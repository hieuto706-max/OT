const { contextBridge } = require('electron');
const path = require('path');
const fs = require('fs');

let cloudUrl = 'https://api.otmanager.id.vn';
let localVersion = '1.4.4';
let localBuildTime = 0;

// Xác định đường dẫn file cấu hình config.json
let configPath = null;

// Khi đóng gói (app.isPackaged), đọc config.json nằm cùng cấp với file exe.
// Khi chạy dev, đọc config.json trong thư mục server.
const exeConfig = path.join(path.dirname(process.execPath), 'config.json');
const devConfig = path.join(__dirname, 'server', 'config.json');

if (fs.existsSync(exeConfig)) {
    configPath = exeConfig;
} else if (fs.existsSync(devConfig)) {
    configPath = devConfig;
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
    const buildJsonPath = path.join(__dirname, 'server', 'build.json');
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

console.log(`[Preload] Đã nạp cấu hình thành công: URL=${cloudUrl}, Version=${localVersion}`);
