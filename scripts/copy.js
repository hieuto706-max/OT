const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');

console.log('Starting sync & obfuscation process...');

// Cấu hình xáo trộn mã nguồn bảo mật cao nhưng tối ưu hiệu năng
const obfuscateConfig = {
    compact: true,
    controlFlowFlattening: false,
    deadCodeInjection: false,
    debugProtection: false,
    disableConsoleOutput: false,
    identifierNamesGenerator: 'hexadecimal',
    log: false,
    numbersToExpressions: false,
    renameGlobals: false,
    selfDefending: false,
    simplify: true,
    splitStrings: false,
    stringArray: true,
    stringArrayCallsTransform: true,
    stringArrayEncoding: ['base64'],
    stringArrayIndexShift: true,
    stringArrayRotate: true,
    stringArrayShuffle: true,
    stringArrayThreshold: 0.8,
    transformObjectKeys: true,
    unicodeEscapeSequence: false
};

function obfuscateAndSave(srcPath, destPath) {
    try {
        if (!fs.existsSync(srcPath)) {
            console.error(`[Error] Source file not found: ${srcPath}`);
            return false;
        }
        console.log(`Obfuscating: ${srcPath} -> ${destPath}`);
        const code = fs.readFileSync(srcPath, 'utf8');
        const obfuscationResult = JavaScriptObfuscator.obfuscate(code, obfuscateConfig);
        
        // Đảm bảo thư mục đích tồn tại
        const destDir = path.dirname(destPath);
        if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
        }
        
        fs.writeFileSync(destPath, obfuscationResult.getObfuscatedCode(), 'utf8');
        return true;
    } catch (e) {
        console.error(`[Error] Obfuscation failed for ${srcPath}:`, e.message);
        return false;
    }
}

// 1. Obfuscate các file nguồn chính ra thư mục chạy ứng dụng
obfuscateAndSave('landing.src.js', 'landing.js');
obfuscateAndSave('mobile/app.src.js', 'mobile/app.js');
obfuscateAndSave('desktop/app.src.js', 'desktop/app.js');

// 2. Đồng bộ các file tĩnh khác sang Android & iOS assets
const androidAssets = 'mobile-android/app/src/main/assets';
const iosAssets = 'mobile-ios/OTManager/www';

function syncFile(src, destSubPath) {
    const destAndroid = path.join(androidAssets, destSubPath);
    const destIos = path.join(iosAssets, destSubPath);
    
    // Tạo thư mục nếu chưa có
    [path.dirname(destAndroid), path.dirname(destIos)].forEach(dir => {
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    });

    if (fs.existsSync(src)) {
        fs.copyFileSync(src, destAndroid);
        fs.copyFileSync(src, destIos);
    }
}

// Đồng bộ các file code đã được obfuscated sang Android & iOS
syncFile('mobile/app.js', 'app.js');

// Đồng bộ các file tài nguyên tĩnh khác
syncFile('mobile/download.html', 'download.html');
syncFile('mobile/index.html', 'index.html');
syncFile('mobile/style.css', 'style.css');
syncFile('mobile/manifest.json', 'manifest.json');
syncFile('mobile/icon-192.png', 'icon-192.png');

// Đồng bộ thư mục resources nếu có
const resourcesSrc = 'mobile/resources';
if (fs.existsSync(resourcesSrc)) {
    const files = fs.readdirSync(resourcesSrc);
    files.forEach(file => {
        syncFile(path.join(resourcesSrc, file), path.join('resources', file));
    });
}

// Ghi tệp build.json chứa timestamp bản dựng mới để hỗ trợ cập nhật vá lỗi (hotfix) không đổi số phiên bản
try {
    const buildPath = path.join(__dirname, '..', 'server', 'build.json');
    const buildData = {
        buildTime: Date.now()
    };
    fs.writeFileSync(buildPath, JSON.stringify(buildData, null, 2), 'utf8');
    console.log(`Generated build.json with buildTime: ${buildData.buildTime}`);
} catch (e) {
    console.error('Lỗi khi ghi build.json:', e.message);
}

console.log('Sync and obfuscation completed successfully!');
