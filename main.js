const { app, BrowserWindow, Menu, Tray, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { startServer, stopServer, getLocalIP, PORT } = require('./server/server');

// Kích hoạt tăng tốc phần cứng (GPU Acceleration) giúp giao diện mượt mà, không bị giật lag trên các máy văn phòng yếu.
// Chỉ vô hiệu hóa sandbox để tránh một số lỗi phân quyền hệ thống.
app.commandLine.appendSwitch('no-sandbox');

// Ngăn chạy nhiều phiên bản của ứng dụng cùng lúc
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
    process.exit(0);
}

app.on('second-instance', () => {
    if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
    }
});

// Tắt menu mặc định
Menu.setApplicationMenu(null);

let mainWindow = null;
let tray = null;
let isQuitting = false;

// Hàm kiểm tra IP hoặc hostname có thuộc dải mạng nội bộ (mạng LAN/Wifi Hotspot) không
function isLocalHostOrIP(hostname) {
    return hostname === 'localhost' ||
           hostname === '127.0.0.1' ||
           /^192\.168\./.test(hostname) ||
           /^10\./.test(hostname) ||
           /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname) ||
           /^169\.254\./.test(hostname);
}

async function createWindow() {
    // Khởi động server local (Luôn chạy để load giao diện nhanh và hỗ trợ API)
    try {
        await startServer();
    } catch (err) {
        if (err.code === 'EADDRINUSE') {
            dialog.showErrorBox(
                'Cổng kết nối bị chiếm dụng',
                'Ứng dụng OT Manager đã được chạy hoặc cổng 3456 đang bị sử dụng bởi một chương trình khác.\n\nVui lòng kiểm tra khay hệ thống (System Tray) hoặc tắt chương trình đang chiếm dụng cổng này trước khi mở lại.'
            );
        } else {
            dialog.showErrorBox(
                'Lỗi khởi động máy chủ',
                'Đã xảy ra lỗi không thể khởi động server local:\n' + err.message
            );
        }
        app.quit();
        return;
    }

    let serverUrl = `http://localhost:${PORT}`;
    let cloudUrl = '';

    // Đọc file config.json: Ưu tiên kế bên file exe khi đóng gói, sau đó mới đến file trong asar/dev
    let configPath = path.join(__dirname, 'server', 'config.json');
    if (app.isPackaged) {
        const exeConfig = path.join(path.dirname(process.execPath), 'config.json');
        if (fs.existsSync(exeConfig)) {
            configPath = exeConfig;
        }
    }

    if (fs.existsSync(configPath)) {
        try {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            if (config.serverUrl) {
                cloudUrl = config.serverUrl;
                if (cloudUrl.endsWith('/')) {
                    cloudUrl = cloudUrl.slice(0, -1);
                }
                console.log(`[Main] App trỏ dữ liệu về Cloud Server: ${cloudUrl}`);
            }
        } catch (e) {
            console.error('[Main] Lỗi đọc file config.json:', e);
        }
    }
    const ip = getLocalIP();

    mainWindow = new BrowserWindow({
        width: 1280,
        height: 860,
        minWidth: 900,
        minHeight: 600,
        title: 'OT Manager - Quản Lý Tăng Ca (Admin)',
        backgroundColor: '#020604',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            enableRemoteModule: false,
            sandbox: false,
        },
        autoHideMenuBar: true,
        show: false,
    });

    // Load desktop app từ server local (để tránh lỗi DNS/SSL/Render ngủ đông gây ra màn hình đen)
    let finalDesktopUrl = `${serverUrl}/desktop/index.html`;
    mainWindow.loadURL(finalDesktopUrl);

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        // mainWindow.webContents.openDevTools(); // Mở DevTools để chẩn đoán lỗi
        console.log(`\n╔══════════════════════════════════════╗`);
        console.log(`║   OT Manager đang chạy!              ║`);
        console.log(`║                                      ║`);
        console.log(`║   📱 App Nhân Viên (Điện thoại):     ║`);
        console.log(`║   http://${ip}:${PORT}`.padEnd(41) + `║`);
        console.log(`║                                      ║`);
        console.log(`║   🖥️  App Quản Lý (Desktop):         ║`);
        console.log(`╚══════════════════════════════════════╝\n`);
        
        // Kích hoạt kiểm tra cập nhật trên startup khi online (Đã chuyển sang dùng checkUpdateSilent ở frontend để hiển thị giao diện đẹp hơn)
        // checkUpdates(cloudUrl);
    });

    // Bảo mật: Tắt DevTools trong môi trường production
    if (app.isPackaged) {
        mainWindow.webContents.on('before-input-event', (event, input) => {
            if (input.key === 'F12' ||
                (input.control && input.shift && ['I', 'J', 'C', 'K'].includes(input.key.toUpperCase())) ||
                (input.control && input.key.toUpperCase() === 'U')) {
                event.preventDefault();
            }
        });
    }

    // Bảo mật: Chặn navigation ra ngoài whitelist (Mạng LAN, Hotspot, Domain hệ thống)
    const allowedHosts = ['localhost', '127.0.0.1', 'otmanager.id.vn', 'api.otmanager.id.vn', 'ot-manager-server-jbxd.onrender.com'];
    mainWindow.webContents.on('will-navigate', (event, url) => {
        try {
            const parsed = new URL(url);
            const isAllowed = allowedHosts.some(h => parsed.hostname === h || parsed.hostname.endsWith('.' + h)) ||
                              isLocalHostOrIP(parsed.hostname) ||
                              parsed.protocol === 'data:';
            if (!isAllowed) {
                console.warn(`[Security] Chặn chuyển hướng tới: ${url}`);
                event.preventDefault();
            }
        } catch (e) {
            event.preventDefault();
        }
    });

    // Bảo mật: Chặn mở cửa sổ mới (popup) trỏ đến URL ngoài
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        try {
            const parsed = new URL(url);
            const isAllowed = allowedHosts.some(h => parsed.hostname === h || parsed.hostname.endsWith('.' + h)) ||
                              isLocalHostOrIP(parsed.hostname);
            if (!isAllowed) {
                console.warn(`[Security] Chặn mở cửa sổ mới tới: ${url}`);
                // Mở link ngoài bằng trình duyệt mặc định thay vì trong app
                shell.openExternal(url);
                return { action: 'deny' };
            }
        } catch (e) {
            return { action: 'deny' };
        }
        return { action: 'allow' };
    });

    // Bắt sự kiện tắt cửa sổ: Không thoát mà ẩn xuống khay hệ thống
    mainWindow.on('close', (event) => {
        if (!isQuitting) {
            event.preventDefault();
            mainWindow.hide();
        }
    });

    // Tạo System Tray
    createTray();
}

// Kiểm tra cập nhật phiên bản chéo với Cloud Server
function checkUpdates(cloudUrl) {
    if (!cloudUrl || cloudUrl.includes('localhost') || cloudUrl.includes('127.0.0.1')) return;
    
    const localVersion = app.getVersion();
    const fetchUrl = `${cloudUrl}/api/version`;
    const https = require('https');
    const http = require('http');
    const client = cloudUrl.startsWith('https') ? https : http;

    client.get(fetchUrl, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            try {
                if (res.statusCode === 200) {
                    const info = JSON.parse(data);
                    if (info.version && compareVersions(localVersion, info.version) < 0) {
                        const updateUrl = info.desktopDownloadUrl || `https://github.com/hieuto706-max/OT/releases/download/v${info.version}/ot-manager-Setup-${info.version}.exe`;
                        dialog.showMessageBox(mainWindow, {
                            type: 'info',
                            title: 'Cập nhật phiên bản mới',
                            message: `Đã có phiên bản mới v${info.version} (phiên bản hiện tại: v${localVersion}).`,
                            detail: 'Bạn có muốn tải về và cài đặt phiên bản mới ngay bây giờ không?',
                            buttons: ['Tải về ngay', 'Để sau'],
                            defaultId: 0,
                            cancelId: 1
                        }).then(r => {
                            if (r.response === 0) {
                                if (info.desktopDownloadUrl) {
                                    global.startElectronUpdate(info.desktopDownloadUrl, info.version);
                                } else {
                                    shell.openExternal(updateUrl);
                                }
                            }
                        });
                    }
                }
            } catch (e) {}
        });
    }).on('error', () => {});
}

// Hàm tải xuống hỗ trợ chuyển hướng (redirect)
function downloadFile(fileUrl, destPath, onProgress, onComplete, onError) {
    const https = require('https');
    const http = require('http');
    const { URL } = require('url');
    
    let finished = false;
    const safeComplete = () => {
        if (finished) return;
        finished = true;
        onComplete();
    };
    const safeError = (err) => {
        if (finished) return;
        finished = true;
        onError(err);
    };
    
    function startDownload(currentUrl) {
        let redirected = false;
        let parsedUrl;
        try {
            parsedUrl = new URL(currentUrl);
        } catch (e) {
            return safeError(new Error('URL không hợp lệ: ' + currentUrl));
        }
        const protocol = parsedUrl.protocol === 'https:' ? https : http;
        
        const req = protocol.get(currentUrl, (res) => {
            // Xử lý chuyển hướng (HTTP 301, 302, 307, 308)
            if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
                redirected = true;
                let redirectUrl = res.headers.location;
                if (!redirectUrl.startsWith('http')) {
                    redirectUrl = new URL(redirectUrl, currentUrl).href;
                }
                return startDownload(redirectUrl);
            }
            
            if (res.statusCode !== 200) {
                return safeError(new Error(`Server trả về mã lỗi HTTP ${res.statusCode}`));
            }
            
            const totalBytes = parseInt(res.headers['content-length'], 10) || 0;
            let downloadedBytes = 0;
            const fileStream = fs.createWriteStream(destPath);
            
            let lastProgressTime = Date.now();
            let lastDownloadedBytes = 0;
            
            res.on('data', (chunk) => {
                downloadedBytes += chunk.length;
                fileStream.write(chunk);
                
                const now = Date.now();
                if (now - lastProgressTime >= 100 || downloadedBytes === totalBytes) {
                    const elapsed = (now - lastProgressTime) / 1000;
                    const speedBytes = elapsed > 0 ? (downloadedBytes - lastDownloadedBytes) / elapsed : 0;
                    
                    const percent = totalBytes > 0 ? Math.round((downloadedBytes / totalBytes) * 100) : 0;
                    const loadedMB = (downloadedBytes / (1024 * 1024)).toFixed(1);
                    const totalMB = (totalBytes / (1024 * 1024)).toFixed(1);
                    
                    let speedText = '0 KB/s';
                    if (speedBytes > 1024 * 1024) {
                        speedText = `${(speedBytes / (1024 * 1024)).toFixed(1)} MB/s`;
                    } else if (speedBytes > 1024) {
                        speedText = `${(speedBytes / 1024).toFixed(0)} KB/s`;
                    }
                    
                    if (!finished) {
                        onProgress(percent, speedText, loadedMB, totalMB);
                    }
                    
                    lastProgressTime = now;
                    lastDownloadedBytes = downloadedBytes;
                }
            });
            
            res.on('end', () => {
                fileStream.end();
                safeComplete();
            });
            
            fileStream.on('error', (err) => {
                fileStream.close();
                fs.unlink(destPath, () => {});
                safeError(err);
            });
        });
        
        req.on('error', (err) => {
            if (redirected) return;
            safeError(err);
        });
    }
    
    startDownload(fileUrl);
}

// Tiến trình tự động cập nhật (Được gọi từ local server khi có yêu cầu tải từ in-app)
global.startElectronUpdate = function(downloadUrl, targetVersion) {
    const { BrowserWindow } = require('electron');
    const https = require('https');
    const http = require('http');
    const { URL } = require('url');

    // Kiểm tra file tồn tại trước khi tải (HEAD request với theo dõi redirect)
    function checkUrlExists(urlToCheck, callback, maxRedirects) {
        if (maxRedirects === undefined) maxRedirects = 5;
        
        let called = false;
        const done = (result) => {
            if (called) return;
            called = true;
            callback(result);
        };

        if (maxRedirects <= 0) return done(false);
        
        let parsedUrl;
        try { parsedUrl = new URL(urlToCheck); } catch (e) { return done(false); }
        const client = parsedUrl.protocol === 'https:' ? https : http;

        const req = client.request(urlToCheck, { method: 'HEAD', timeout: 10000 }, (res) => {
            if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
                let redirectUrl = res.headers.location;
                if (!redirectUrl.startsWith('http')) {
                    redirectUrl = new URL(redirectUrl, urlToCheck).href;
                }
                called = true;
                return checkUrlExists(redirectUrl, callback, maxRedirects - 1);
            }
            done(res.statusCode === 200);
        });
        req.on('error', () => done(false));
        req.on('timeout', () => { req.destroy(); done(false); });
        req.end();
    }

    checkUrlExists(downloadUrl, (exists) => {
        if (!exists) {
            console.warn(`[Main Update] Không tìm thấy file cài đặt tại URL: ${downloadUrl}`);
            return;
        }

        // File tồn tại, tiến hành tải
        showDownloadProgress(downloadUrl, targetVersion);
    });
};

function showDownloadProgress(downloadUrl, targetVersion) {
    const { BrowserWindow, dialog } = require('electron');

    const progressHtml = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body {
                margin: 0;
                padding: 24px;
                background: #0f0f1a;
                color: #ffffff;
                font-family: 'Inter', -apple-system, sans-serif;
                overflow: hidden;
                display: flex;
                flex-direction: column;
                justify-content: center;
                height: 100vh;
                box-sizing: border-box;
            }
            h3 {
                margin: 0 0 8px 0;
                color: #10b981;
                font-size: 1.1rem;
                font-weight: 600;
            }
            p {
                margin: 0 0 16px 0;
                color: #a1a1aa;
                font-size: 0.85rem;
                line-height: 1.4;
            }
            .progress-container {
                width: 100%;
                height: 8px;
                background: rgba(255, 255, 255, 0.05);
                border-radius: 4px;
                overflow: hidden;
                margin-bottom: 12px;
            }
            .progress-bar {
                width: 0%;
                height: 100%;
                background: linear-gradient(90deg, #10b981, #059669);
                border-radius: 4px;
                transition: width 0.1s ease;
            }
            .status {
                display: flex;
                justify-content: space-between;
                font-size: 0.75rem;
                color: #71717a;
            }
        </style>
    </head>
    <body>
        <h3 id="title">Đang tải bản cập nhật v${targetVersion}</h3>
        <p id="desc">Đang chuẩn bị tải về phiên bản mới...</p>
        <div class="progress-container">
            <div id="bar" class="progress-bar"></div>
        </div>
        <div class="status">
            <span id="percent">0%</span>
            <span id="speed">0 MB/s</span>
        </div>
        <script>
            window.updateProgress = function(percent, speed, loadedMB, totalMB) {
                document.getElementById('bar').style.width = percent + '%';
                document.getElementById('percent').textContent = percent + '%';
                document.getElementById('desc').textContent = 'Đã tải: ' + loadedMB + ' MB / ' + totalMB + ' MB';
                document.getElementById('speed').textContent = speed;
            };
            window.setError = function(err) {
                document.getElementById('title').style.color = '#ef4444';
                document.getElementById('title').textContent = 'Lỗi cập nhật';
                document.getElementById('desc').textContent = err;
            };
        </script>
    </body>
    </html>
    `;

    const progressWindow = new BrowserWindow({
        width: 420,
        height: 220,
        resizable: false,
        frame: false,
        alwaysOnTop: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        },
        backgroundColor: '#0f0f1a'
    });

    progressWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(progressHtml));

    const tempPath = path.join(app.getPath('temp'), `ot-manager-setup-${targetVersion}.exe`);
    
    downloadFile(downloadUrl, tempPath,
        (percent, speed, loadedMB, totalMB) => {
            if (!progressWindow.isDestroyed()) {
                progressWindow.webContents.executeJavaScript(`updateProgress(${percent}, '${speed}', '${loadedMB}', '${totalMB}')`).catch(() => {});
            }
        },
        () => {
            setTimeout(() => {
                if (!progressWindow.isDestroyed()) progressWindow.close();
                // Khởi chạy bộ cài đặt mới hoàn toàn tách biệt
                const { spawn } = require('child_process');
                try {
                    const child = spawn(tempPath, [], {
                        detached: true,
                        stdio: 'ignore'
                    });
                    child.unref();
                    app.exit(0);
                } catch (spawnErr) {
                    // Cơ chế dự phòng
                    const { exec } = require('child_process');
                    exec(`"${tempPath}"`);
                    app.quit();
                }
            }, 1000);
        },
        (err) => {
            console.error('Lỗi tải cập nhật:', err.message);
            if (!progressWindow.isDestroyed()) {
                progressWindow.webContents.executeJavaScript(`setError('${err.message.replace(/'/g, "\\'")}')`).catch(() => {});
            }
            setTimeout(() => {
                if (!progressWindow.isDestroyed()) progressWindow.close();
                dialog.showMessageBox(mainWindow, {
                    type: 'error',
                    title: 'Lỗi cập nhật',
                    message: 'Không thể tự động tải bản cập nhật.',
                    detail: `${err.message}\n\nBạn có muốn tải về thủ công qua trình duyệt không?`,
                    buttons: ['Hủy', 'Tải thủ công'],
                    defaultId: 1
                }).then(r => {
                    if (r.response === 1) {
                        shell.openExternal(downloadUrl);
                    }
                });
            }, 4000);
        }
    );
}

function compareVersions(v1, v2) {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);
    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
        const p1 = parts1[i] || 0;
        const p2 = parts2[i] || 0;
        if (p1 < p2) return -1;
        if (p1 > p2) return 1;
    }
    return 0;
}

function createTray() {
    try {
        const iconPath = path.join(__dirname, 'resources', 'icon.png');
        tray = new Tray(iconPath);
        const contextMenu = Menu.buildFromTemplate([
            { label: 'Mở cửa sổ quản lý', click: () => { mainWindow.show(); } },
            { type: 'separator' },
            { label: 'Thoát hoàn toàn', click: () => {
                isQuitting = true;
                app.quit();
            }}
        ]);
        tray.setToolTip('OT Manager Server đang chạy ngầm...');
        tray.setContextMenu(contextMenu);
        tray.on('click', () => {
            mainWindow.show();
        });
    } catch (e) {
        console.error('Lỗi khởi tạo System Tray:', e);
    }
}

app.whenReady().then(createWindow);

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    } else {
        mainWindow.show();
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        if (isQuitting) {
            app.quit();
        }
    }
});

app.on('will-quit', () => {
    stopServer();
});
