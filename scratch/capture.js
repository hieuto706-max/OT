const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

app.disableHardwareAcceleration();

const RESOURCES_DIR = path.join(__dirname, '..', 'resources');
const logFile = path.join(__dirname, 'capture_log.txt');

// Initialize local log file
fs.writeFileSync(logFile, '[Capture Log Start]\n');

function log(msg) {
    console.log(msg);
    fs.appendFileSync(logFile, msg + '\n');
}

function logError(msg, err) {
    console.error(msg, err);
    fs.appendFileSync(logFile, `[ERROR] ${msg} ${err ? err.message || err : ''}\n`);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

app.whenReady().then(async () => {
    log('[Automation] Starting capture script...');
    
    const win = new BrowserWindow({
        width: 1280,
        height: 860,
        show: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false
        }
    });

    win.setMenuBarVisibility(false);

    // Capture console messages from the web view
    win.webContents.on('console-message', (event, level, message, line, sourceId) => {
        log(`[Web Console] ${message} (at ${path.basename(sourceId)}:${line})`);
    });

    log('[Automation] Navigating to http://localhost:3456/desktop/index.html...');
    await win.loadURL('http://localhost:3456/desktop/index.html');

    log('[Automation] Page loaded. Waiting for 3 seconds for UI settling...');
    await sleep(3000);

    // 1. Capture Login Screen (with retry to avoid transient buffer initialization errors)
    let loginCaptured = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            log(`[Automation] Capturing desktop_login.png (attempt ${attempt})...`);
            let image = await win.webContents.capturePage();
            fs.writeFileSync(path.join(RESOURCES_DIR, 'desktop_login.png'), image.toPNG());
            log('[Automation] Saved desktop_login.png');
            loginCaptured = true;
            break;
        } catch (e) {
            logError(`Failed to capture desktop_login.png on attempt ${attempt}`, e);
            await sleep(1500);
        }
    }

    // 2. Perform Login
    log('[Automation] Performing admin login...');
    await win.webContents.executeJavaScript(`{
        document.getElementById('login-admin-username').value = 'admin';
        document.getElementById('login-password').value = 'admin';
        document.querySelector('#form-login-admin button[type="submit"]').click();
    }`);

    // Wait for login and records API load
    log('[Automation] Waiting 5 seconds for dashboard data load...');
    await sleep(5000);

    // Print error if login failed
    try {
        const loginError = await win.webContents.executeJavaScript(`
            document.getElementById('login-error-admin') ? document.getElementById('login-error-admin').textContent : 'N/A'
        `);
        log(`[Automation] Login form error element content: "${loginError}"`);

        const currentScreen = await win.webContents.executeJavaScript(`
            const activeScreen = document.querySelector('.screen.active');
            activeScreen ? activeScreen.id : 'None'
        `);
        log(`[Automation] Current active screen ID: "${currentScreen}"`);
    } catch (e) {
        logError('Failed to retrieve diagnostics', e);
    }

    // 3. Capture Bảng chấm OT
    try {
        log('[Automation] Capturing desktop_records.png and ot_manager_desktop_mockup.png...');
        let image = await win.webContents.capturePage();
        fs.writeFileSync(path.join(RESOURCES_DIR, 'desktop_records.png'), image.toPNG());
        fs.writeFileSync(path.join(RESOURCES_DIR, 'ot_manager_desktop_mockup.png'), image.toPNG());
        log('[Automation] Saved desktop_records.png and ot_manager_desktop_mockup.png');
    } catch (e) {
        logError('Failed to capture records screenshots', e);
    }

    // 4. Switch to Quản lý nhân viên tab and capture
    log('[Automation] Navigating to "Quản lý nhân viên" tab...');
    await win.webContents.executeJavaScript(`{
        const tabBtn = document.querySelector('[data-admin-tab="users"]');
        if (tabBtn) tabBtn.click();
    }`);
    await sleep(2000);
    try {
        log('[Automation] Capturing desktop_users.png...');
        let image = await win.webContents.capturePage();
        fs.writeFileSync(path.join(RESOURCES_DIR, 'desktop_users.png'), image.toPNG());
        log('[Automation] Saved desktop_users.png');
    } catch (e) {
        logError('Failed to capture users screenshot', e);
    }

    // 5. Switch to Báo cáo tổng hợp tab and capture
    log('[Automation] Navigating to "Báo cáo tổng hợp" tab...');
    await win.webContents.executeJavaScript(`{
        const tabBtn = document.querySelector('[data-admin-tab="report"]');
        if (tabBtn) tabBtn.click();
    }`);
    await sleep(2000);
    try {
        log('[Automation] Capturing desktop_reports.png...');
        let image = await win.webContents.capturePage();
        fs.writeFileSync(path.join(RESOURCES_DIR, 'desktop_reports.png'), image.toPNG());
        log('[Automation] Saved desktop_reports.png');
    } catch (e) {
        logError('Failed to capture reports screenshot', e);
    }

    log('[Automation] Screenshots capture complete! Exiting...');
    win.close();
    app.exit(0);
});
