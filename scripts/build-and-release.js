const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Clean dummy GITHUB_TOKEN to let gh CLI use local credentials
if (process.env.GITHUB_TOKEN === 'github_pat_antigravitydummytoken') {
    delete process.env.GITHUB_TOKEN;
}

// Helper function to recursively delete directory with retry to bypass temporary file locks (like OneDrive)
function deleteFolderRecursiveWithRetry(folderPath, retries = 5, delay = 1000) {
    for (let i = 0; i < retries; i++) {
        try {
            if (fs.existsSync(folderPath)) {
                fs.rmSync(folderPath, { recursive: true, force: true });
            }
            console.log(`Successfully deleted folder: ${folderPath}`);
            return true;
        } catch (e) {
            console.warn(`[Delete Retry ${i+1}/${retries}] Failed to delete ${folderPath}: ${e.message}`);
            if (i < retries - 1) {
                try {
                    execSync(`powershell -Command "Start-Sleep -Milliseconds ${delay}"`);
                } catch(e2) {}
            }
        }
    }
    return false;
}


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
    
    // Inject the local JDK 17 from temp_jdk to prevent JVM 8 mismatch errors
    const localJdkPath = path.resolve(path.join(__dirname, '..', 'temp_jdk', 'jdk-17.0.19+10'));
    let resolvedJdkPath = localJdkPath;
    if (process.platform === 'win32') {
        if (localJdkPath.toLowerCase().includes('máy tính\\ot manager')) {
            resolvedJdkPath = localJdkPath.replace(/c:\\users\\hieut\\onedrive\\máy tính\\ot manager/i, 'C:\\Users\\hieut\\OneDrive\\MYTNH~1\\OTMANA~1');
        } else {
            try {
                resolvedJdkPath = execSync(`powershell -Command "(New-Object -ComObject Scripting.FileSystemObject).GetFolder('${localJdkPath}').ShortPath"`).toString().trim();
            } catch (e) {
                console.warn('Failed to resolve short path, using fallback long path:', e.message);
            }
        }
    }
    
    const childEnv = { ...process.env };
    childEnv['JAVA_HOME'] = resolvedJdkPath;
    
    const binPath = path.join(resolvedJdkPath, 'bin');
    if (process.platform === 'win32') {
        childEnv['PATH'] = `${binPath};${childEnv['PATH'] || ''}`;
    } else {
        childEnv['PATH'] = `${binPath}:${childEnv['PATH'] || ''}`;
    }
    
    console.log(`Using JAVA_HOME: ${childEnv['JAVA_HOME']}`);
    
    // Stop any running Gradle daemons to release file locks
    console.log('Stopping active Gradle daemons...');
    try {
        execSync(`${gradleCmd} --stop`, { 
            cwd: path.join(__dirname, '..', 'mobile-android'),
            env: childEnv,
            stdio: 'ignore' 
        });
    } catch (e) {
        console.warn('Failed to stop Gradle daemons (continuing):', e.message);
    }
    
    // Forcibly kill any running java.exe processes to ensure all locks are released
    console.log('Forcibly terminating Java processes to release locks...');
    try {
        if (process.platform === 'win32') {
            execSync('taskkill /F /IM java.exe', { stdio: 'ignore' });
        }
    } catch (e) {
        // May error if no Java process is running, which is fine
    }

    // Force delete the build directory using Node.js with retry logic
    console.log('Force deleting build directory via Node.js...');
    const buildDirPath = path.resolve(path.join(__dirname, '..', 'mobile-android', 'app', 'build'));
    deleteFolderRecursiveWithRetry(buildDirPath);
    
    execSync(`${gradleCmd} clean assembleRelease`, { 
        cwd: path.join(__dirname, '..', 'mobile-android'),
        env: childEnv,
        stdio: 'inherit' 
    });
} catch (e) {
    console.error('Error building Android app:', e.message);
    process.exit(1);
}

// Step 4: Copy Android APK to dist folder for unified release
console.log('\n--- Copying Android APK to dist/, mobile/, and docs/mobile/ ---');
const apkSrc = path.join(__dirname, '..', 'mobile-android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
const apkDest = path.join(__dirname, '..', 'dist', 'OT-Manager-mobile.apk');
const apkMobile = path.join(__dirname, '..', 'mobile', 'OT-Manager-mobile.apk');
const apkDocsMobile = path.join(__dirname, '..', 'docs', 'mobile', 'OT-Manager-mobile.apk');

if (fs.existsSync(apkSrc)) {
    fs.copyFileSync(apkSrc, apkDest);
    console.log(`Successfully copied APK to ${apkDest}`);
    fs.copyFileSync(apkSrc, apkMobile);
    console.log(`Successfully copied APK to ${apkMobile}`);
    if (fs.existsSync(path.dirname(apkDocsMobile))) {
        fs.copyFileSync(apkSrc, apkDocsMobile);
        console.log(`Successfully copied APK to ${apkDocsMobile}`);
    }
} else {
    console.error('Error: APK file not found at ' + apkSrc);
    process.exit(1);
}

// Step 5: Publish both to GitHub Release using gh CLI
console.log('\n--- Creating GitHub Release via gh CLI ---');
const version = require('../package.json').version;
try {
    execSync(`gh release create v${version} dist/ot-manager-Setup-${version}.exe dist/OT-Manager-mobile.apk --title "Release v${version}" --notes "Bản phát hành v${version}: Hỗ trợ Quản lý đăng nhập trên điện thoại để phê duyệt đơn OT và yêu cầu hủy thiết bị; Quản lý có thể ghi nhận OT cá nhân; Hiển thị tổng giờ OT tháng của Quản lý trên Desktop; Sửa lỗi tải lý do tăng ca lần đầu."`, { stdio: 'inherit' });
    console.log('\n🎉 Release published successfully!');
} catch (e) {
    console.log('\nRelease tag may already exist, updating assets via gh release upload --clobber...');
    try {
        execSync(`gh release upload v${version} dist/ot-manager-Setup-${version}.exe dist/OT-Manager-mobile.apk --clobber`, { stdio: 'inherit' });
        console.log('\n🎉 Release assets updated successfully!');
    } catch (e2) {
        console.error('\n❌ Failed to upload assets via gh CLI:', e2.message);
    }
}
