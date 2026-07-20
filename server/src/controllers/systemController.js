const fs = require('fs');
const path = require('path');
const config = require('../../config');
const { fetchGist, loadDB } = require('../../db');
const { logInfo, logError, getLocalIP } = require('../../utils');
const { sendJSON, sendError } = require('../utils/http');

const PORT = process.env.PORT || (process.versions.electron ? 0 : 8080);
let updatesDir = null;

try {
    const { app } = require('electron');
    if (app) {
        updatesDir = path.join(app.getPath('userData'), 'hotfixes');
    }
} catch (e) {}

const SystemController = {
    async handle(req, res, urlPath, method) {
        if (urlPath === '/api/dashboard' && method === 'GET') {
            return this.getDashboard(req, res);
        }
        if (urlPath === '/api/stats' && method === 'GET') {
            return this.getStats(req, res);
        }
        if (urlPath === '/api/gist-status' && method === 'GET') {
            return this.getGistStatus(req, res);
        }
        if (urlPath === '/api/version' && method === 'GET') {
            return this.getVersion(req, res);
        }
        if (urlPath === '/api/server-info' && method === 'GET') {
            return this.getServerInfo(req, res);
        }
        if (urlPath === '/api/cloud-url' && method === 'GET') {
            return this.getCloudUrl(req, res);
        }
        if (urlPath === '/api/trigger-update' && method === 'POST') {
            return this.triggerUpdate(req, res);
        }
        if (urlPath === '/api/apply-hotfix' && method === 'POST') {
            return this.applyHotfix(req, res);
        }

        return sendError(res, 404, 'Endpoint không tồn tại');
    },

    async getDashboard(req, res) {
        const { userId: reqUserId } = req;
        const url = new URL(req.url, `http://${req.headers.host}`);
        
        const now = new Date();
        const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const month = url.searchParams.get('month') || defaultMonth;
        
        const db = await loadDB();
        
        // 1. Teams
        const teams = db.teams || [];
        
        // 2. Users filter based on role/permissions
        const currentUser = db.users.find(u => u.id === reqUserId);
        const isSuperAdmin = currentUser && (currentUser.username === 'admin' || currentUser.isSuperAdmin);
        const managerTeam = currentUser ? (currentUser.team || '') : '';
        
        let users = db.users;
        if (!isSuperAdmin) {
            users = db.users.filter(u => u.id === reqUserId || u.team === managerTeam);
        }
        
        // Exclude passwords
        const safeUsers = users.map(({ password, ...u }) => u);
        
        // 3. Records filter based on month and team/permissions
        let records = db.records.filter(r => {
            const rMonth = r.createdMonth || r.date.substring(0, 7);
            return rMonth === month;
        });
        
        if (!isSuperAdmin) {
            const allowedUserIds = users.map(u => u.id);
            records = records.filter(r => allowedUserIds.includes(r.userId));
        }
        
        // 4. Stats calculation
        const approvedRecords = records.filter(r => r.status === 'approved' || (!r.isBackfill && r.status !== 'pending' && r.status !== 'rejected'));
        const pendingRecords = records.filter(r => r.status === 'pending');
        
        let employees = users.filter(u => u.role === 'employee');
        const pendingUnlinksCount = employees.filter(u => u.pendingUnlink).length;
        
        const stats = {
            totalUsers: employees.length,
            pendingOT: pendingRecords.length,
            pendingUnlinks: pendingUnlinksCount,
            totalOTMonth: approvedRecords.reduce((s, r) => s + r.totalHours, 0),
            totalTripsMonth: approvedRecords.filter(r => r.customActivity && (r.calcMode === 'trip' || !r.calcMode)).length
        };
        
        return sendJSON(res, 200, {
            teams,
            users: safeUsers,
            records,
            stats
        });
    },

    async getStats(req, res) {
        const { userId: reqUserId } = req;
        const now = new Date();
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        
        const db = await loadDB();
        const currentUser = db.users.find(u => u.id === reqUserId);
        const isSuperAdmin = currentUser && (currentUser.username === 'admin' || currentUser.isSuperAdmin);
        const managerTeam = currentUser ? (currentUser.team || '') : '';

        let users = db.users;
        if (!isSuperAdmin) {
            users = db.users.filter(u => u.id === reqUserId || u.team === managerTeam);
        }
        const allowedUserIds = users.map(u => u.id);

        const approvedRecords = db.records.filter(r => {
            const rMonth = r.createdMonth || r.date.substring(0, 7);
            return rMonth === currentMonth && allowedUserIds.includes(r.userId) && (r.status === 'approved' || (!r.isBackfill && r.status !== 'pending' && r.status !== 'rejected'));
        });
        const pendingRecords = db.records.filter(r => {
            const rMonth = r.createdMonth || r.date.substring(0, 7);
            return rMonth === currentMonth && allowedUserIds.includes(r.userId) && r.status === 'pending';
        });
        
        let employees = users.filter(u => u.role === 'employee');
        const pendingUnlinksCount = employees.filter(u => u.pendingUnlink).length;

        return sendJSON(res, 200, {
            totalUsers: employees.length,
            pendingOT: pendingRecords.length,
            pendingUnlinks: pendingUnlinksCount,
            totalOTMonth: approvedRecords.reduce((s, r) => s + r.totalHours, 0),
            totalTripsMonth: approvedRecords.filter(r => r.customActivity && (r.calcMode === 'trip' || !r.calcMode)).length
        });
    },

    async getGistStatus(req, res) {
        const isRender = !!process.env.RENDER;
        const hasCredentials = !!(config.GIST_ID && config.GITHUB_TOKEN);

        if (!isRender) {
            return sendJSON(res, 200, {
                status: 'success',
                message: 'Chạy chế độ local (dữ liệu lưu cục bộ an toàn).'
            });
        }

        if (!hasCredentials) {
            return sendJSON(res, 200, {
                status: 'error',
                message: 'Chưa cấu hình GIST_ID hoặc GITHUB_TOKEN trên Render.'
            });
        }

        try {
            await fetchGist();
            return sendJSON(res, 200, {
                status: 'success',
                message: 'Kết nối GitHub Gist thành công!'
            });
        } catch (e) {
            return sendJSON(res, 200, {
                status: 'error',
                message: `Lỗi kết nối Gist: ${e.message}`
            });
        }
    },

    async getVersion(req, res) {
        let version = '1.0.0';
        try {
            const pkgPath = path.join(__dirname, '..', '..', '..', 'package.json');
            if (fs.existsSync(pkgPath)) {
                const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
                version = pkg.version || '1.0.0';
            }
        } catch (e) {
            console.error('[Version API] Lỗi đọc phiên bản:', e.message);
        }

        let buildTime = 0;
        try {
            // Ưu tiên đọc buildTime từ thư mục hotfixes trước
            let buildPath = updatesDir ? path.join(updatesDir, 'build.json') : null;
            if (!buildPath || !fs.existsSync(buildPath)) {
                buildPath = path.join(__dirname, '..', '..', 'build.json');
            }
            if (fs.existsSync(buildPath)) {
                const buildInfo = JSON.parse(fs.readFileSync(buildPath, 'utf-8'));
                buildTime = buildInfo.buildTime || 0;
            }
        } catch (e) {
            // Fallback: Sử dụng mtime của server.js nếu không có build.json
            try {
                const serverPath = path.join(__dirname, '..', '..', 'server.js');
                if (fs.existsSync(serverPath)) {
                    buildTime = fs.statSync(serverPath).mtime.getTime();
                }
            } catch (fsErr) {}
        }

        const proto = req.headers['x-forwarded-proto'] || 'http';
        const baseUrl = `${proto}://${req.headers.host}`;
        const desktopDownloadUrl = `${baseUrl}/download/desktop`;
        const mobileDownloadUrl = `${baseUrl}/OT-Manager-mobile.apk`;
        return sendJSON(res, 200, { version, buildTime, desktopDownloadUrl, mobileDownloadUrl, databaseType: config.DATABASE_URL ? 'PostgreSQL' : 'Local db.json' });
    },

    async getServerInfo(req, res) {
        const ip = getLocalIP();
        return sendJSON(res, 200, { ip, port: PORT, url: `http://${ip}:${PORT}` });
    },

    async getCloudUrl(req, res) {
        let cloudUrl = '';
        try {
            let configPath = path.join(__dirname, '..', '..', 'config.json');
            if (!fs.existsSync(configPath)) {
                configPath = path.join(__dirname, '..', '..', '..', 'config.json');
            }
            if (fs.existsSync(configPath)) {
                const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
                cloudUrl = cfg.serverUrl || '';
            }
        } catch (e) {
            console.error('[Cloud URL API] Lỗi:', e.message);
        }
        // Fallback: Trên Render, dùng RENDER_EXTERNAL_URL nếu config.json không có serverUrl
        if (!cloudUrl && process.env.RENDER_EXTERNAL_URL) {
            cloudUrl = process.env.RENDER_EXTERNAL_URL;
        }
        if (cloudUrl && cloudUrl.endsWith('/')) {
            cloudUrl = cloudUrl.slice(0, -1);
        }
        return sendJSON(res, 200, { cloudUrl });
    },

    async triggerUpdate(req, res) {
        if (global.startElectronUpdate) {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                try {
                    const data = JSON.parse(body || '{}');
                    const downloadUrl = data.downloadUrl;
                    const version = data.version;
                    if (!downloadUrl || !version) {
                        return sendJSON(res, 400, { success: false, message: 'Thiếu downloadUrl hoặc version trong request body' });
                    }
                    try {
                        global.startElectronUpdate(downloadUrl, version);
                    } catch (updateErr) {
                        console.error('[Server Update] Lỗi khi chạy startElectronUpdate:', updateErr);
                        return sendJSON(res, 500, { success: false, message: `Lỗi kích hoạt tiến trình tải: ${updateErr.message}` });
                    }
                    return sendJSON(res, 200, { success: true });
                } catch (e) {
                    console.error('[Server Update] Lỗi parse JSON:', e);
                    return sendJSON(res, 400, { success: false, message: `Lỗi parse JSON: ${e.message}` });
                }
            });
            return;
        } else {
            console.error('[Server Update] Electron update handler chưa được đăng ký trên Main process');
            return sendJSON(res, 500, { success: false, message: 'Electron update handler chưa được đăng ký trên Main process' });
        }
    },

    async applyHotfix(req, res) {
        if (!updatesDir) {
            return sendJSON(res, 500, { success: false, message: 'Ứng dụng không chạy trong môi trường Electron' });
        }
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const data = JSON.parse(body || '{}');
                const cloudUrl = data.cloudUrl;
                const buildTime = data.buildTime;
                if (!cloudUrl) {
                    return sendJSON(res, 400, { success: false, message: 'Thiếu cloudUrl' });
                }
                
                // Đảm bảo thư mục hotfixes tồn tại
                if (!fs.existsSync(updatesDir)) {
                    fs.mkdirSync(updatesDir, { recursive: true });
                }

                // Tải các tệp từ cloud server
                const filesToDownload = ['server/server.js', 'server/api.js', 'server/db.js', 'server/utils.js', 'server/notifications.js', 'server/tunnel.js'];
                const downloadPromises = filesToDownload.map(file => {
                    return new Promise((resolve, reject) => {
                        const fileUrl = `${cloudUrl}/${file}`;
                        const destPath = path.join(updatesDir, file);
                        
                        // Đảm bảo thư mục cha tồn tại
                        const destDir = path.dirname(destPath);
                        if (!fs.existsSync(destDir)) {
                            fs.mkdirSync(destDir, { recursive: true });
                        }

                        const fileStream = fs.createWriteStream(destPath);
                        const httpLib = fileUrl.startsWith('https') ? require('https') : require('http');
                        
                        httpLib.get(fileUrl, (response) => {
                            if (response.statusCode !== 200) {
                                reject(new Error(`Failed to download ${file}: ${response.statusCode}`));
                                return;
                            }
                            response.pipe(fileStream);
                            fileStream.on('finish', () => {
                                fileStream.close();
                                resolve();
                            });
                        }).on('error', (err) => {
                            fileStream.close();
                            fs.unlink(destPath, () => {});
                            reject(err);
                        });
                    });
                });

                await Promise.all(downloadPromises);

                // Ghi lại tệp build.json mới vào thư mục hotfixes
                fs.writeFileSync(
                    path.join(updatesDir, 'build.json'),
                    JSON.stringify({ buildTime: buildTime || Date.now() }, null, 2),
                    'utf8'
                );

                console.log(`[Hotfix] Đã áp dụng thành công bản vá mới tại timestamp: ${buildTime}`);
                return sendJSON(res, 200, { success: true });
            } catch (err) {
                console.error('[Hotfix] Lỗi khi áp dụng bản vá:', err.message);
                return sendJSON(res, 500, { success: false, message: err.message });
            }
        });
    }
};

module.exports = SystemController;
