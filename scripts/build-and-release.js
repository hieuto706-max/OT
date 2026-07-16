const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Step 1: Clean dist folder
console.log('--- Cleaning up dist directory ---');
if (fs.existsSync('dist')) {
    fs.rmSync('dist', { recursive: true, force: true });
}
fs.mkdirSync('dist');

// Step 2: Build Electron Desktop app
console.log('\n--- Building Electron Desktop App (Windows) ---');
try {
    execSync('npx electron-builder --win --publish never', { stdio: 'inherit' });
} catch (e) {
    console.error('Error building desktop app:', e.message);
    process.exit(1);
}

// Step 3: Build Android Mobile app
console.log('\n--- Building Android Mobile App (APK) ---');
try {
    const gradleCmd = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
    execSync(`${gradleCmd} assembleRelease`, { 
        cwd: path.join(__dirname, '..', 'mobile-android'),
        stdio: 'inherit' 
    });
} catch (e) {
    console.error('Error building Android app:', e.message);
    process.exit(1);
}

// Step 4: Copy Android APK to dist folder for unified release
console.log('\n--- Copying Android APK to dist/ ---');
const apkSrc = path.join(__dirname, '..', 'mobile-android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
const apkDest = path.join(__dirname, '..', 'dist', 'OT-Manager-mobile.apk');

if (fs.existsSync(apkSrc)) {
    fs.copyFileSync(apkSrc, apkDest);
    console.log(`Successfully copied APK to ${apkDest}`);
} else {
    console.error('Error: APK file not found at ' + apkSrc);
    process.exit(1);
}

// Step 5: Publish both to GitHub Release using gh CLI
console.log('\n--- Creating GitHub Release via gh CLI ---');
const version = require('../package.json').version;
try {
    execSync(`gh release create v${version} dist/ot-manager-Setup-${version}.exe dist/OT-Manager-mobile.apk --title "Release v${version}" --notes "Bản phát hành v${version} - Thiết kế lại thanh Header phẳng gọn và sửa lỗi đăng nhập Email nhân viên."`, { stdio: 'inherit' });
    console.log('\n🎉 Release published successfully!');
} catch (e) {
    console.error('\n❌ Failed to publish release via gh CLI. You can still upload files in dist/ manually.');
}
