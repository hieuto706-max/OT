const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');

const pkgPath = path.join(__dirname, '..', 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const version = pkg.version;

console.log(`Starting sync & obfuscation process for version ${version}...`);

// Helper to update version query params in HTML files
function updateHtmlVersion(filePath, version) {
    try {
        if (!fs.existsSync(filePath)) return;
        let content = fs.readFileSync(filePath, 'utf8');
        content = content.replace(/(href|src)=["']([^"']*?\.(?:css|js))\?v=[^"']*?["']/g, `$1="$2?v=${version}"`);
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Updated version query parameters in ${filePath} to ?v=${version}`);
    } catch (e) {
        console.error(`Error updating html version in ${filePath}:`, e.message);
    }
}

// Helper to update version constants in source code files automatically
function updateSourceVersions(version) {
    try {
        // 1. mobile/app.src.js
        const mobileSrcPath = path.join(__dirname, '..', 'mobile', 'app.src.js');
        if (fs.existsSync(mobileSrcPath)) {
            let content = fs.readFileSync(mobileSrcPath, 'utf8');
            content = content.replace(/const MOBILE_VERSION = window\.PACKAGED_VERSION \|\| ['"].*?['"];/g, `const MOBILE_VERSION = window.PACKAGED_VERSION || '${version}';`);
            fs.writeFileSync(mobileSrcPath, content, 'utf8');
            console.log(`Updated MOBILE_VERSION in mobile/app.src.js to ${version}`);
        }

        // 2. desktop/app.src.js
        const desktopSrcPath = path.join(__dirname, '..', 'desktop', 'app.src.js');
        if (fs.existsSync(desktopSrcPath)) {
            let content = fs.readFileSync(desktopSrcPath, 'utf8');
            content = content.replace(/(window\.OT_LOCAL_VERSION \|\| localStorage\.getItem\('ot_app_version'\) \|\| )['"].*?['"]/g, `$1'${version}'`);
            content = content.replace(/(window\.OT_LOCAL_VERSION \|\| )['"].*?['"]/g, `$1'${version}'`);
            fs.writeFileSync(desktopSrcPath, content, 'utf8');
            console.log(`Updated localVer fallback in desktop/app.src.js to ${version}`);
        }

        // 3. preload.js
        const preloadPath = path.join(__dirname, '..', 'preload.js');
        if (fs.existsSync(preloadPath)) {
            let content = fs.readFileSync(preloadPath, 'utf8');
            content = content.replace(/let localVersion = ['"].*?['"];/g, `let localVersion = '${version}';`);
            fs.writeFileSync(preloadPath, content, 'utf8');
            console.log(`Updated localVersion in preload.js to ${version}`);
        }

        // 4. mobile/download.html
        const downloadHtmlPath = path.join(__dirname, '..', 'mobile', 'download.html');
        if (fs.existsSync(downloadHtmlPath)) {
            let content = fs.readFileSync(downloadHtmlPath, 'utf8');
            content = content.replace(/const MOBILE_VERSION = ['"].*?['"];/g, `const MOBILE_VERSION = '${version}';`);
            fs.writeFileSync(downloadHtmlPath, content, 'utf8');
            console.log(`Updated MOBILE_VERSION in mobile/download.html to ${version}`);
        }

        // 5. mobile-android/app/build.gradle.kts
        const gradlePath = path.join(__dirname, '..', 'mobile-android', 'app', 'build.gradle.kts');
        if (fs.existsSync(gradlePath)) {
            let content = fs.readFileSync(gradlePath, 'utf8');
            content = content.replace(/versionName = ["'].*?["']/g, `versionName = "${version}"`);
            fs.writeFileSync(gradlePath, content, 'utf8');
            console.log(`Updated versionName in build.gradle.kts to ${version}`);
        }
    } catch (e) {
        console.error('Error updating source version constants:', e.message);
    }
}

// Update version tags in HTML templates & source files
updateHtmlVersion(path.join(__dirname, '..', 'desktop', 'index.html'), version);
updateHtmlVersion(path.join(__dirname, '..', 'mobile', 'index.html'), version);
updateHtmlVersion(path.join(__dirname, '..', 'docs', 'index.html'), version);
updateSourceVersions(version);

// Generate build timestamp
const buildTime = Date.now();

// Automatically update CACHE_NAME in both desktop/sw.js and mobile/sw.js
try {
    const swDesktopPath = path.join(__dirname, '..', 'desktop', 'sw.js');
    if (fs.existsSync(swDesktopPath)) {
        let swContent = fs.readFileSync(swDesktopPath, 'utf8');
        swContent = swContent.replace(/const CACHE_NAME = ['"].*?['"];/g, `const CACHE_NAME = 'ot-manager-build-${buildTime}';`);
        fs.writeFileSync(swDesktopPath, swContent, 'utf8');
        console.log(`Updated desktop/sw.js CACHE_NAME to: ot-manager-build-${buildTime}`);
    }
    
    const swMobilePath = path.join(__dirname, '..', 'mobile', 'sw.js');
    if (fs.existsSync(swMobilePath)) {
        let swContent = fs.readFileSync(swMobilePath, 'utf8');
        swContent = swContent.replace(/const CACHE_NAME = ['"].*?['"];/g, `const CACHE_NAME = 'ot-manager-build-${buildTime}';`);
        fs.writeFileSync(swMobilePath, swContent, 'utf8');
        console.log(`Updated mobile/sw.js CACHE_NAME to: ot-manager-build-${buildTime}`);
    }
} catch (e) {
    console.error('Error updating sw.js versions:', e.message);
}

// Cấu hình xáo trộn mã nguồn mức độ nhẹ (giống thu gọn code - minification) để tránh bị Antivirus chặn nhầm
const obfuscateConfig = {
    compact: true,
    controlFlowFlattening: false,
    deadCodeInjection: false,
    debugProtection: false,
    disableConsoleOutput: false,
    identifierNamesGenerator: 'mangled', // Đổi tên biến dạng ngắn (a, b, c) thay vì dạng hex (_0x1a2b) giống hệt Terser/UglifyJS
    log: false,
    numbersToExpressions: false,
    renameGlobals: false,
    selfDefending: false,
    simplify: true,
    splitStrings: false,
    stringArray: false, // Tắt mã hóa mảng chuỗi vì các phần mềm diệt virus rất nhạy cảm với chuỗi base64 ẩn
    stringArrayCallsTransform: false,
    stringArrayEncoding: [],
    stringArrayIndexShift: false,
    stringArrayRotate: false,
    stringArrayShuffle: false,
    stringArrayThreshold: 0,
    transformObjectKeys: false, // Giữ nguyên thuộc tính của object để tránh méo mó cấu trúc bị hiểu lầm là mã độc
    unicodeEscapeSequence: false
};

function obfuscateAndSave(srcPath, destPath) {
    try {
        if (!fs.existsSync(srcPath)) {
            console.error(`[Error] Source file not found: ${srcPath}`);
            return false;
        }
        
        const code = fs.readFileSync(srcPath, 'utf8');
        
        // Đảm bảo thư mục đích tồn tại
        const destDir = path.dirname(destPath);
        if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
        }
        
        const disableObfuscation = process.env.DISABLE_OBFUSCATION === 'true' || srcPath.includes('mobile');
        if (disableObfuscation) {
            console.log(`Copying raw code (No obfuscation): ${srcPath} -> ${destPath}`);
            fs.writeFileSync(destPath, '/* eslint-disable */\n/*jshint ignore:start*/\n// @ts-nocheck\n' + code, 'utf8');
            return true;
        }
        
        console.log(`Obfuscating (Light): ${srcPath} -> ${destPath}`);
        const obfuscationResult = JavaScriptObfuscator.obfuscate(code, obfuscateConfig);
        fs.writeFileSync(destPath, '/* eslint-disable */\n/*jshint ignore:start*/\n// @ts-nocheck\n' + obfuscationResult.getObfuscatedCode(), 'utf8');
        return true;
    } catch (e) {
        console.error(`[Error] Processing failed for ${srcPath}:`, e.message);
        return false;
    }
}

// 1. Obfuscate các file nguồn chính ra thư mục chạy ứng dụng
obfuscateAndSave('docs/landing.src.js', 'docs/landing.js');
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
syncFile('mobile/sw.js', 'sw.js');

// Đồng bộ thư mục resources nếu có
const resourcesSrc = 'mobile/resources';
if (fs.existsSync(resourcesSrc)) {
    const files = fs.readdirSync(resourcesSrc);
    files.forEach(file => {
        syncFile(path.join(resourcesSrc, file), path.join('resources', file));
    });
}

// Ghi tệp build.json chứa timestamp bản dựng mới và version để hỗ trợ cập nhật vá lỗi (hotfix) và định danh phiên bản
try {
    const buildPath = path.join(__dirname, '..', 'server', 'build.json');
    const buildData = {
        version: version,
        buildTime: Date.now()
    };
    fs.writeFileSync(buildPath, JSON.stringify(buildData, null, 2), 'utf8');
    console.log(`Generated build.json with version: ${buildData.version}, buildTime: ${buildData.buildTime}`);
} catch (e) {
    console.error('Lỗi khi ghi build.json:', e.message);
}

// Sao chép toàn bộ thư mục desktop và mobile vào thư mục docs phục vụ chạy web trên GitHub Pages
function copyFolderSync(from, to) {
    if (!fs.existsSync(to)) {
        fs.mkdirSync(to, { recursive: true });
    }
    fs.readdirSync(from).forEach(element => {
        const fromPath = path.join(from, element);
        const toPath = path.join(to, element);
        const stat = fs.lstatSync(fromPath);
        if (stat.isFile()) {
            fs.copyFileSync(fromPath, toPath);
        } else if (stat.isDirectory()) {
            copyFolderSync(fromPath, toPath);
        }
    });
}

console.log('Copying desktop, mobile & resources directories to docs/ for GitHub Pages...');
try {
    copyFolderSync('desktop', 'docs/desktop');
    copyFolderSync('mobile', 'docs/mobile');
    copyFolderSync('resources', 'docs/resources');
    console.log('Successfully copied desktop, mobile & resources directories to docs/');
} catch (e) {
    console.error('Lỗi khi sao chép thư mục sang docs/:', e.message);
}

console.log('Sync and obfuscation completed successfully!');
