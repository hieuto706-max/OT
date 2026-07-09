const fs = require('fs');
const path = require('path');

// ==================== ENVIRONMENT VARIABLES ====================
function loadEnv() {
    const envPath = path.join(__dirname, '..', '.env');
    try {
        if (fs.existsSync(envPath)) {
            const content = fs.readFileSync(envPath, 'utf-8');
            content.split('\n').forEach(line => {
                line = line.trim();
                if (!line || line.startsWith('#')) return;
                const eqIdx = line.indexOf('=');
                if (eqIdx < 0) return;
                const key = line.substring(0, eqIdx).trim();
                let value = line.substring(eqIdx + 1).trim();
                // Remove surrounding quotes
                if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
                    value = value.slice(1, -1);
                }
                if (!process.env[key]) {
                    process.env[key] = value;
                }
            });
            console.log('[Env] Đã nạp biến môi trường từ .env');
        }
    } catch (e) {
        console.error('[Env] Lỗi đọc file .env:', e.message);
    }
}
loadEnv();

let updatesDir = null;
try {
    const { app } = require('electron');
    if (app) {
        updatesDir = path.join(app.getPath('userData'), 'hotfixes');
        cleanObsoleteHotfixes();
    }
} catch (e) {}

function cleanObsoleteHotfixes() {
    if (!updatesDir || !fs.existsSync(updatesDir)) return;
    try {
        const hotfixBuildPath = path.join(updatesDir, 'build.json');
        const internalBuildPath = path.join(__dirname, 'build.json');
        
        let hotfixBuildTime = 0;
        let internalBuildTime = 0;
        
        if (fs.existsSync(hotfixBuildPath)) {
            const hotfixInfo = JSON.parse(fs.readFileSync(hotfixBuildPath, 'utf-8'));
            hotfixBuildTime = hotfixInfo.buildTime || 0;
        }
        
        if (fs.existsSync(internalBuildPath)) {
            const internalInfo = JSON.parse(fs.readFileSync(internalBuildPath, 'utf-8'));
            internalBuildTime = internalInfo.buildTime || 0;
        }
        
        if (internalBuildTime >= hotfixBuildTime) {
            console.log(`[Hotfix] Internal buildTime (${internalBuildTime}) >= Hotfix buildTime (${hotfixBuildTime}). Clearing obsolete hotfixes.`);
            const files = fs.readdirSync(updatesDir);
            for (const file of files) {
                const filePath = path.join(updatesDir, file);
                if (fs.statSync(filePath).isFile()) {
                    fs.unlinkSync(filePath);
                }
            }
        }
    } catch (e) {
        console.error('[Hotfix] Error cleaning obsolete hotfixes:', e.message);
    }
}

module.exports = {
    updatesDir,
    PORT: process.env.PORT || 8080,
    DATABASE_URL: process.env.DATABASE_URL || null,
    GIST_ID: process.env.GIST_ID || null,
    GITHUB_TOKEN: process.env.GITHUB_TOKEN || null,
    VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY || null,
    VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY || null,
    PORT_HTTPS: process.env.PORT_HTTPS || 443,
    CERT_PATH: process.env.CERT_PATH || null,
    KEY_PATH: process.env.KEY_PATH || null,
    EMAIL_ADMIN: process.env.EMAIL_ADMIN || null,
    ENABLE_HTTPS: process.env.ENABLE_HTTPS === 'true',
    RENTRY_KEY: process.env.RENTRY_KEY || null
};
