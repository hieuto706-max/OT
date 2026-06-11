const { app, BrowserWindow, Menu, Tray } = require('electron');
const path = require('path');
const fs = require('fs');
const { startServer, getLocalIP, PORT } = require('./server');

// Tắt menu mặc định
Menu.setApplicationMenu(null);

let mainWindow = null;
let tray = null;
let isQuitting = false;

async function createWindow() {
    let serverUrl = `http://localhost:${PORT}`;
    let useCloud = false;

    // Đọc file config.json nếu có để dùng Cloud Server
    const configPath = path.join(__dirname, 'config.json');
    if (fs.existsSync(configPath)) {
        try {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            if (config.serverUrl) {
                serverUrl = config.serverUrl;
                if (serverUrl.endsWith('/')) {
                    serverUrl = serverUrl.slice(0, -1);
                }
                useCloud = true;
                console.log(`[Main] Kết nối trực tiếp đến Cloud Server: ${serverUrl}`);
            }
        } catch (e) {
            console.error('[Main] Lỗi đọc file config.json:', e);
        }
    }

    if (!useCloud) {
        // Khởi động server local
        await startServer();
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

function createTray() {
    try {
        const iconPath = path.join(__dirname, 'icon.png');
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
