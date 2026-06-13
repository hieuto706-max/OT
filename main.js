const { app, BrowserWindow, Menu, Tray, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { startServer, stopServer, getLocalIP, PORT } = require('./server/server');

// Tắt menu mặc định
Menu.setApplicationMenu(null);

let mainWindow = null;
let tray = null;
let isQuitting = false;

async function createWindow() {
    // Khởi động server local (Luôn chạy để load giao diện nhanh và hỗ trợ API)
    await startServer();

    let serverUrl = `http://localhost:${PORT}`;
    let cloudUrl = '';

    // Đọc file config.json nếu có để dùng Cloud Server
    const configPath = path.join(__dirname, 'config.json');
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
        backgroundColor: '#0f0f1a',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
        },
        autoHideMenuBar: true,
        show: false,
    });

    // Load desktop app từ server (để dùng chung API)
    mainWindow.loadURL(`${serverUrl}/desktop/index.html`);

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        console.log(`\n╔══════════════════════════════════════╗`);
        console.log(`║   OT Manager đang chạy!              ║`);
        console.log(`║                                      ║`);
        console.log(`║   📱 App Nhân Viên (Điện thoại):     ║`);
        console.log(`║   http://${ip}:${PORT}`.padEnd(41) + `║`);
        console.log(`║                                      ║`);
        console.log(`║   🖥️  App Quản Lý (Desktop):         ║`);
        console.log(`╚══════════════════════════════════════╝\n`);
        
        // Kiểm tra cập nhật phần mềm nếu kết nối Cloud
        checkUpdates(serverUrl);
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
function checkUpdates(serverUrl) {
    if (!serverUrl || serverUrl.includes('localhost') || serverUrl.includes('127.0.0.1')) return;
    
    const localVersion = app.getVersion();
    const fetchUrl = `${serverUrl}/api/version`;
    const http = require('http');
    const https = require('https');
    const client = serverUrl.startsWith('https') ? https : http;

    client.get(fetchUrl, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            try {
                if (res.statusCode === 200) {
                    const info = JSON.parse(data);
                    if (info.version && compareVersions(localVersion, info.version) < 0) {
                        dialog.showMessageBox(mainWindow, {
                            type: 'info',
                            title: 'Cập nhật phần mềm',
                            message: `Đã có phiên bản mới: v${info.version} (Bản hiện tại: v${localVersion})`,
                            detail: 'Bạn có muốn truy cập để tải về phiên bản mới nhất không?',
                            buttons: ['Để sau', 'Tải về ngay'],
                            defaultId: 1
                        }).then((result) => {
                            if (result.response === 1) {
                                // Mở trình duyệt đến Cloud Server URL để tải về
                                shell.openExternal(serverUrl);
                            }
                        });
                    }
                }
            } catch (e) {}
        });
    }).on('error', () => {});
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
