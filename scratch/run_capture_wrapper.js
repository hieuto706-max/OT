const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const configPath = path.join(__dirname, '..', 'config.json');
const tempConfigPath = path.join(__dirname, '..', 'config_temp.json');

// Self-healing: If config_temp.json exists but config.json doesn't, restore it first
if (fs.existsSync(tempConfigPath) && !fs.existsSync(configPath)) {
    console.log('[Wrapper] Self-healing: config_temp.json found. Restoring to config.json...');
    fs.renameSync(tempConfigPath, configPath);
}

let renamed = false;

try {
    if (fs.existsSync(configPath)) {
        console.log('[Wrapper] Renaming config.json to config_temp.json...');
        fs.renameSync(configPath, tempConfigPath);
        renamed = true;
    } else {
        console.log('[Wrapper] config.json does not exist. Running as local base.');
    }

    console.log('[Wrapper] Launching Electron screenshot capture...');
    const electronPath = path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'electron.exe');
    const captureScript = path.join(__dirname, 'capture.js');
    
    execSync(`"${electronPath}" "${captureScript}"`, { stdio: 'inherit' });
    console.log('[Wrapper] Electron execution completed.');

} catch (err) {
    console.error('[Wrapper] Error during execution:', err.message);
} finally {
    if (renamed && fs.existsSync(tempConfigPath)) {
        console.log('[Wrapper] Restoring config_temp.json back to config.json...');
        try {
            if (fs.existsSync(configPath)) {
                fs.unlinkSync(configPath);
            }
            fs.renameSync(tempConfigPath, configPath);
            console.log('[Wrapper] Restored successfully.');
        } catch (restoreErr) {
            console.error('[Wrapper] Restore failed:', restoreErr.message);
        }
    }
}
