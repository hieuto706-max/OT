const { contextBridge, ipcRenderer } = require('electron');
const path = require('path');
const fs = require('fs');

let cloudUrl = 'https://api.otmanager.id.vn';
let localVersion = '1.5.3';
let localBuildTime = 0;

// Phát hiện app đã được đóng gói (.asar) hay đang chạy dev
const isPackaged = __dirname.includes('app.asar');

// Xác định đường dẫn file cấu hình config.json
let configPath = null;

if (isPackaged) {
    // Khi đóng gói: CHỈ đọc config.json nằm cùng cấp với file .exe (cấu hình người dùng tùy chỉnh)
    // KHÔNG đọc server/config.json bên trong .asar (vì nó chứa URL localhost cho dev)
    const exeConfig = path.join(path.dirname(process.execPath), 'config.json');
    if (fs.existsSync(exeConfig)) {
        configPath = exeConfig;
    }
    // Nếu không có config.json bên ngoài → dùng URL mặc định (https://api.otmanager.id.vn)
} else {
    // Khi chạy dev: đọc config.json trong thư mục server (localhost)
    const devConfig = path.join(__dirname, 'server', 'config.json');
    if (fs.existsSync(devConfig)) {
        configPath = devConfig;
    }
}

if (configPath) {
    try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        if (config.serverUrl) {
            cloudUrl = config.serverUrl;
            if (cloudUrl.endsWith('/')) {
                cloudUrl = cloudUrl.slice(0, -1);
            }
        }
    } catch (e) {
        console.error('[Preload] Lỗi đọc file config.json:', e);
    }
}

// Đọc version và buildTime từ build.json
try {
    let buildJsonPath = null;
    const userDataPath = process.env.USER_DATA_PATH;
    if (userDataPath) {
        const hotfixBuildPath = path.join(userDataPath, 'hotfixes', 'build.json');
        if (fs.existsSync(hotfixBuildPath)) {
            buildJsonPath = hotfixBuildPath;
        }
    }
    
    if (!buildJsonPath) {
        buildJsonPath = path.join(__dirname, 'server', 'build.json');
    }

    if (fs.existsSync(buildJsonPath)) {
        const buildInfo = JSON.parse(fs.readFileSync(buildJsonPath, 'utf-8'));
        if (buildInfo.buildTime) localBuildTime = buildInfo.buildTime;
        if (buildInfo.version) localVersion = buildInfo.version;
    }
} catch (e) {
    console.error('[Preload] Lỗi đọc file build.json:', e);
}

// Expose các biến cấu hình vào Renderer Process window một cách bảo mật
contextBridge.exposeInMainWorld('OT_CLOUD_URL', cloudUrl);
contextBridge.exposeInMainWorld('OT_LOCAL_VERSION', localVersion);
contextBridge.exposeInMainWorld('OT_LOCAL_BUILD_TIME', localBuildTime);

// Expose IPC APIs cho cập nhật & vá lỗi không cần local Express server
contextBridge.exposeInMainWorld('electronAPI', {
    triggerUpdate: (downloadUrl, version) => ipcRenderer.send('trigger-update', { downloadUrl, version }),
    applyHotfix: (cloudUrl, buildTime) => ipcRenderer.invoke('apply-hotfix', { cloudUrl, buildTime }),
    isElectron: true
});

console.log(`[Preload] Mode=${isPackaged ? 'PACKAGED' : 'DEV'}, URL=${cloudUrl}, Version=${localVersion}`);

