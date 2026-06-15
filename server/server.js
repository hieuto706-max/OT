/**
 * OT Manager Server
 * Cung cấp REST API cho cả desktop và mobile app
 * Lưu dữ liệu trong file db.json
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { startTunnel, stopTunnel } = require('./tunnel');

const PORT = process.env.PORT || 3456;
let DB_FILE = null;
let sseClients = [];

function notifySseClients(data) {
    const payload = `data: ${JSON.stringify(data)}\n\n`;
    sseClients.forEach(res => {
        try {
            res.write(payload);
        } catch (e) {
            // connection broken
        }
    });
}

function getDbPath() {
    if (DB_FILE) return DB_FILE;

    if (process.env.DB_PATH) {
        DB_FILE = process.env.DB_PATH;
        return DB_FILE;
    }

    const defaultPath = path.join(__dirname, '..', 'db.json');
    try {
        const { app } = require('electron');
        if (app) {
            if (!app.isReady()) {
                return defaultPath;
            }
            const userDataPath = app.getPath('userData');
            const electronDB = path.join(userDataPath, 'db.json');

            // Sao chép cơ sở dữ liệu hiện có bằng read/write để hỗ trợ giải nén từ app.asar
            if (!fs.existsSync(electronDB) && fs.existsSync(defaultPath)) {
                try {
                    const dir = path.dirname(electronDB);
                    if (!fs.existsSync(dir)) {
                        fs.mkdirSync(dir, { recursive: true });
                    }
                    const data = fs.readFileSync(defaultPath, 'utf-8');
                    fs.writeFileSync(electronDB, data, 'utf-8');
                    console.log(`[Server] Đã sao chép cơ sở dữ liệu sang đường dẫn ghi: ${electronDB}`);
                } catch (copyErr) {
                    console.error('[Server] Lỗi sao chép cơ sở dữ liệu:', copyErr);
                }
            }
            DB_FILE = electronDB;
            return DB_FILE;
        }
    } catch (e) {
        // Chạy độc lập ngoài Electron (Node.js thuần)
    }
    DB_FILE = defaultPath;
    return DB_FILE;
}

function getConfigPath() {
    let configPath = path.join(__dirname, '..', 'config.json');
    try {
        const { app } = require('electron');
        if (app) {
            const exeDir = path.dirname(process.execPath);
            const exeConfig = path.join(exeDir, 'config.json');
            if (fs.existsSync(exeConfig)) {
                configPath = exeConfig;
            } else if (app.isPackaged) {
                const asarConfig = path.join(__dirname, '..', 'config.json');
                if (fs.existsSync(asarConfig)) {
                    configPath = asarConfig;
                }
            }
        }
    } catch (e) {
        // Chạy độc lập ngoài Electron (ví dụ trên Render)
    }
    return configPath;
}

// ==================== GITHUB GIST BACKUP ====================
function fetchGist() {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.github.com',
            path: `/gists/${process.env.GIST_ID}`,
            method: 'GET',
            headers: {
                'Authorization': `token ${process.env.GITHUB_TOKEN}`,
                'User-Agent': 'Node.js-Server-App'
            }
        };

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    if (res.statusCode !== 200) {
                        return reject(new Error(`HTTP status ${res.statusCode}`));
                    }
                    const gist = JSON.parse(body);
                    const file = gist.files['db.json'];
                    if (!file) {
                        return reject(new Error('db.json not found in Gist'));
                    }
                    const db = JSON.parse(file.content);
                    resolve(db);
                } catch (e) {
                    reject(e);
                }
            });
        });

        req.on('error', reject);
        req.end();
    });
}

function updateGist(data) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify({
            files: {
                'db.json': {
                    content: JSON.stringify(data, null, 2)
                }
            }
        });

        const options = {
            hostname: 'api.github.com',
            path: `/gists/${process.env.GIST_ID}`,
            method: 'PATCH',
            headers: {
                'Authorization': `token ${process.env.GITHUB_TOKEN}`,
                'User-Agent': 'Node.js-Server-App',
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        };

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve(true);
                } else {
                    reject(new Error(`HTTP status ${res.statusCode}: ${body}`));
                }
            });
        });

        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

// ==================== DATABASE ====================
let dbCache = null;

async function loadDB() {
    if (dbCache) return dbCache;

    let gistLoaded = false;
    // Tải dữ liệu từ Gist nếu có cấu hình trên môi trường Cloud (chỉ chạy khi server khởi động/chưa có cache)
    if (process.env.GIST_ID && process.env.GITHUB_TOKEN) {
        try {
            console.log('[Gist] Đang đồng bộ tải dữ liệu từ GitHub Gist...');
            const gistData = await fetchGist();
            if (gistData) {
                if (!gistData.users) gistData.users = [];
                if (!gistData.records) gistData.records = [];
                // Đồng bộ ghi vào file local db.json
                fs.writeFileSync(getDbPath(), JSON.stringify(gistData, null, 2), 'utf-8');
                console.log('[Gist] Đồng bộ tải thành công!');
                dbCache = gistData;
                return gistData;
            }
        } catch (e) {
            console.error('[Gist] Lỗi đồng bộ tải từ Gist (sử dụng cache local):', e.message);
            // Nếu là lỗi 404 hoặc không có db.json thì coi như Gist mới/chưa có database
            if (e.message.includes('404') || e.message.includes('not found')) {
                gistLoaded = false;
            } else {
                // Lỗi mạng hoặc lỗi kết nối, KHÔNG được ghi đè dữ liệu mặc định lên Gist!
                gistLoaded = 'failed';
            }
        }
    }

    const dbFile = getDbPath();
    try {
        if (fs.existsSync(dbFile)) {
            const db = JSON.parse(fs.readFileSync(dbFile, 'utf-8'));
            if (!db.users) db.users = [];
            if (!db.records) db.records = [];
            dbCache = db;
            return db;
        }
    } catch (e) {
        console.error('Error loading DB:', e);
    }
    // Default DB
    const defaultDB = {
        users: [{
            id: generateId(),
            username: 'admin',
            password: 'admin123',
            fullname: 'Quản trị viên',
            role: 'admin',
            createdAt: new Date().toISOString()
        }],
        records: []
    };
    
    if (gistLoaded !== 'failed') {
        saveDB(defaultDB);
    } else {
        console.warn('[Gist] Cảnh báo: Gist lỗi kết nối mạng. Khởi tạo DB tạm thời trong RAM và không ghi đè lên Gist.');
    }
    dbCache = defaultDB;
    return defaultDB;
}

function saveDB(data) {
    dbCache = data;
    fs.writeFileSync(getDbPath(), JSON.stringify(data, null, 2), 'utf-8');
    notifySseClients({ type: 'update' });

    // Cập nhật bất đồng bộ lên Gist (không làm nghẽn phản hồi API)
    if (process.env.GIST_ID && process.env.GITHUB_TOKEN) {
        updateGist(data).catch(e => {
            console.error('[Gist] Lỗi cập nhật lên Gist:', e.message);
        });
    }
}

async function performCleanup(month) {
    const db = await loadDB();
    const cleanMonthStr = month.replace('-', '_'); // e.g. "2026_05"
    const backupFileName = `db_backup_${cleanMonthStr}.json`;
    const backupFilePath = path.join(path.dirname(getDbPath()), backupFileName);
    
    // 1. Sao lưu cục bộ
    try {
        fs.writeFileSync(backupFilePath, JSON.stringify(db, null, 2), 'utf-8');
        console.log(`[Cleanup] Đã lưu tệp sao lưu cục bộ tại: ${backupFilePath}`);
    } catch (err) {
        console.error('[Cleanup] Lỗi sao lưu cục bộ:', err.message);
    }
    
    // 2. Sao lưu lên GitHub Gist
    if (process.env.GIST_ID && process.env.GITHUB_TOKEN) {
        try {
            console.log(`[Cleanup] Đang đồng bộ tệp sao lưu ${backupFileName} lên GitHub Gist...`);
            await backupGistFile(backupFileName, db);
            console.log('[Cleanup] Đồng bộ Gist thành công!');
        } catch (err) {
            console.error('[Cleanup] Lỗi đồng bộ Gist:', err.message);
        }
    }
    
    // 3. Xoá dữ liệu tháng cũ khỏi DB chính
    db.records = db.records.filter(r => !r.date.startsWith(month) && r.date > month);
    saveDB(db);
    console.log(`[Cleanup] Đã dọn dẹp dữ liệu của tháng ${month} và các tháng cũ hơn.`);
}

function backupGistFile(fileName, data) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify({
            files: {
                [fileName]: {
                    content: JSON.stringify(data, null, 2)
                }
            }
        });

        const options = {
            hostname: 'api.github.com',
            path: `/gists/${process.env.GIST_ID}`,
            method: 'PATCH',
            headers: {
                'Authorization': `token ${process.env.GITHUB_TOKEN}`,
                'User-Agent': 'Node.js-Server-App',
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        };

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve(true);
                } else {
                    reject(new Error(`HTTP status ${res.statusCode}: ${body}`));
                }
            });
        });

        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

async function autoCleanupOn15th(db) {
    const today = new Date();
    const currentDay = today.getDate();
    if (currentDay >= 15) {
        // Tính tháng trước
        const prevMonthDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const yyyy = prevMonthDate.getFullYear();
        const mm = String(prevMonthDate.getMonth() + 1).padStart(2, '0');
        const targetMonth = `${yyyy}-${mm}`; // e.g. "2026-05"
        
        // Kiểm tra xem còn bản ghi cũ nào không
        const hasOldRecords = db.records.some(r => r.date.startsWith(targetMonth) || r.date < targetMonth);
        if (hasOldRecords) {
            console.log(`[Auto Cleanup] Phát hiện hôm nay là ngày ${currentDay} (>= 15) và có dữ liệu của tháng ${targetMonth} (hoặc cũ hơn). Bắt đầu tự động dọn dẹp...`);
            try {
                await performCleanup(targetMonth);
                console.log(`[Auto Cleanup] Tự động dọn dẹp thành công dữ liệu tháng ${targetMonth}!`);
            } catch (err) {
                console.error('[Auto Cleanup] Lỗi tự động dọn dẹp:', err.message);
            }
        }
    }
}

function generateId() {
    return Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
}

// ==================== MIME TYPES ====================
const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.webmanifest': 'application/manifest+json',
};

// ==================== HELPERS ====================
function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return '127.0.0.1';
}

function parseBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch (e) {
                reject(e);
            }
        });
        req.on('error', reject);
    });
}

function sendJSON(res, statusCode, data) {
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, x-device-id, x-user-id',
    });
    res.end(JSON.stringify(data));
}

function sendError(res, statusCode, message) {
    sendJSON(res, statusCode, { error: message });
}

function getCurrentMonth() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// ==================== API ROUTES ====================
async function handleAPI(req, res, urlPath, method) {
    const db = await loadDB();

    // Kiểm tra xem tài khoản có bị xóa khỏi hệ thống hoặc bị hủy liên kết thiết bị không
    const reqUserId = req.headers['x-user-id'];
    const reqDeviceId = req.headers['x-device-id'];
    if (reqUserId && !urlPath.startsWith('/api/auth/')) {
        const user = db.users.find(u => u.id === reqUserId);
        if (!user) {
            return sendError(res, 401, 'Tài khoản của bạn đã bị xóa khỏi hệ thống!');
        }
        if (user.role === 'employee') {
            const matchesNative = user.deviceId && user.deviceId === reqDeviceId;
            const matchesBrowser = user.browserDeviceId && user.browserDeviceId === reqDeviceId;
            if (!matchesNative && !matchesBrowser) {
                return sendError(res, 403, 'Thiết bị hoặc trình duyệt này đã bị hủy liên kết khỏi tài khoản!');
            }
        }
    }

    // Kiểm tra xem tài khoản có bị xóa khỏi hệ thống không (fallback qua query parameter)
    const url = new URL(req.url, `http://${req.headers.host}`);
    const queryUserId = url.searchParams.get('userId');
    if (queryUserId && !urlPath.startsWith('/api/auth/')) {
        const userExists = db.users.some(u => u.id === queryUserId);
        if (!userExists) {
            return sendError(res, 401, 'Tài khoản của bạn đã bị xóa khỏi hệ thống!');
        }
    }

    // --- AUTH ---
    if (urlPath === '/api/auth/login' && method === 'POST') {
        const { username, password, deviceId, isBrowser } = await parseBody(req);
        
        // Tìm user không phân biệt chữ hoa chữ thường
        const user = db.users.find(u => u.username.toLowerCase() === username.toLowerCase());
        if (!user) return sendError(res, 401, 'Sai tên đăng nhập!');

        // Nếu là nhân viên, cho phép đăng nhập không cần mật khẩu và liên kết thiết bị
        if (user.role === 'employee') {
            if (deviceId) {
                if (isBrowser) {
                    // Đăng nhập từ trình duyệt web
                    if (!user.browserDeviceId) {
                        // Kiểm tra xem trình duyệt này đã liên kết với tài khoản khác chưa
                        const otherOwner = db.users.find(u => u.role === 'employee' && u.id !== user.id && u.browserDeviceId === deviceId);
                        if (otherOwner) {
                            return sendError(res, 403, 'Trình duyệt này đã được liên kết với một tài khoản khác!');
                        }
                        user.browserDeviceId = deviceId;
                        saveDB(db);
                    } else if (user.browserDeviceId !== deviceId) {
                        return sendError(res, 403, 'Tài khoản này đã được đăng nhập trên một trình duyệt khác!');
                    }
                } else {
                    // Đăng nhập từ ứng dụng điện thoại (native app)
                    if (!user.deviceId) {
                        // Kiểm tra xem thiết bị này đã liên kết với tài khoản khác chưa
                        const otherOwner = db.users.find(u => u.role === 'employee' && u.id !== user.id && u.deviceId === deviceId);
                        if (otherOwner) {
                            return sendError(res, 403, 'Thiết bị này đã được liên kết với một tài khoản khác!');
                        }
                        user.deviceId = deviceId;
                        saveDB(db);
                    } else if (user.deviceId !== deviceId) {
                        return sendError(res, 403, 'Tài khoản này đã được đăng nhập trên một thiết bị khác!');
                    }
                }
            }
            const { password: _, ...safeUser } = user;
            return sendJSON(res, 200, { user: safeUser });
        }

        // Nếu là admin, yêu cầu mật khẩu
        if (user.password !== password) {
            return sendError(res, 401, 'Sai mật khẩu!');
        }

        const { password: _, ...safeUser } = user;
        return sendJSON(res, 200, { user: safeUser });
    }

    if (urlPath === '/api/auth/register' && method === 'POST') {
        const { fullname, username, password, role } = await parseBody(req);
        if (!fullname || !username) return sendError(res, 400, 'Vui lòng điền đầy đủ thông tin!');
        if (username.length < 3) return sendError(res, 400, 'Tên đăng nhập phải có ít nhất 3 ký tự!');
        
        const isEmployee = role !== 'admin';
        if (!isEmployee && (!password || password.length < 4)) {
            return sendError(res, 400, 'Mật khẩu quản trị viên phải có ít nhất 4 ký tự!');
        }

        if (db.users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
            return sendError(res, 409, 'Tên đăng nhập đã tồn tại!');
        }

        const newUser = {
            id: generateId(),
            username,
            password: password || '123',
            fullname,
            role: role || 'employee',
            createdAt: new Date().toISOString()
        };
        db.users.push(newUser);
        saveDB(db);
        const { password: _, ...safeUser } = newUser;
        return sendJSON(res, 201, { user: safeUser });
    }

    // --- USERS ---
    if (urlPath === '/api/users' && method === 'GET') {
        const safeUsers = db.users.map(({ password, ...u }) => u);
        return sendJSON(res, 200, { users: safeUsers });
    }

    if (urlPath.startsWith('/api/users/') && method === 'GET') {
        const userId = urlPath.split('/api/users/')[1];
        const user = db.users.find(u => u.id === userId);
        if (!user) return sendError(res, 404, 'Không tìm thấy người dùng!');
        const { password: _, ...safeUser } = user;
        return sendJSON(res, 200, { user: safeUser });
    }

    if (urlPath.startsWith('/api/users/') && method === 'DELETE') {
        const userId = urlPath.split('/api/users/')[1];
        const user = db.users.find(u => u.id === userId);
        if (!user) return sendError(res, 404, 'Không tìm thấy người dùng!');
        if (user.username === 'admin') return sendError(res, 403, 'Không thể xóa tài khoản admin!');
        db.users = db.users.filter(u => u.id !== userId);
        db.records = db.records.filter(r => r.userId !== userId);
        saveDB(db);
        return sendJSON(res, 200, { message: 'Đã xóa' });
    }

    if (urlPath.startsWith('/api/users/') && method === 'PUT') {
        const userId = urlPath.split('/api/users/')[1];
        const body = await parseBody(req);
        const { fullname, password, role, deviceId, browserDeviceId, pendingUnlink } = body;
        const userIdx = db.users.findIndex(u => u.id === userId);
        if (userIdx < 0) return sendError(res, 404, 'Không tìm thấy người dùng!');

        if (fullname) db.users[userIdx].fullname = fullname;
        if (password) db.users[userIdx].password = password;
        if (deviceId !== undefined) db.users[userIdx].deviceId = deviceId;
        if (browserDeviceId !== undefined) db.users[userIdx].browserDeviceId = browserDeviceId;
        if (pendingUnlink !== undefined) db.users[userIdx].pendingUnlink = !!pendingUnlink;
        if (role) {
            if (db.users[userIdx].username === 'admin' && role !== 'admin') {
                return sendError(res, 403, 'Không thể thay đổi vai trò của admin mặc định!');
            }
            db.users[userIdx].role = role;
        }
        db.users[userIdx].updatedAt = new Date().toISOString();
        saveDB(db);
        const { password: _, ...safeUser } = db.users[userIdx];
        return sendJSON(res, 200, { user: safeUser });
    }

    // --- RECORDS ---
    if (urlPath === '/api/records' && method === 'GET') {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const userId = url.searchParams.get('userId');
        const month = url.searchParams.get('month');
        let records = [...db.records];
        if (userId) records = records.filter(r => r.userId === userId);
        if (month) records = records.filter(r => r.date.startsWith(month));
        records.sort((a, b) => b.date.localeCompare(a.date));
        return sendJSON(res, 200, { records });
    }

    if (urlPath === '/api/records' && method === 'POST') {
        const body = await parseBody(req);
        const { userId, date, hasLunchOT, otStart, otEnd, eveningOTHours, totalHours, note } = body;
        if (!userId || !date) return sendError(res, 400, 'Thiếu thông tin!');

        const userExists = db.users.some(u => u.id === userId);
        if (!userExists) {
            return sendError(res, 401, 'Tài khoản của bạn đã bị xóa khỏi hệ thống!');
        }

        // Check for existing record on same date
        const existingIdx = db.records.findIndex(r => r.userId === userId && r.date === date);
        const record = {
            id: existingIdx >= 0 ? db.records[existingIdx].id : generateId(),
            userId,
            date,
            hasLunchOT: !!hasLunchOT,
            otStart: otStart || '',
            otEnd: otEnd || '',
            eveningOTHours: eveningOTHours || 0,
            totalHours: totalHours || 0,
            note: note || '',
            createdAt: existingIdx >= 0 ? db.records[existingIdx].createdAt : new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        if (existingIdx >= 0) {
            db.records[existingIdx] = record;
        } else {
            db.records.push(record);
        }
        saveDB(db);
        return sendJSON(res, existingIdx >= 0 ? 200 : 201, { record, updated: existingIdx >= 0 });
    }

    if (urlPath.startsWith('/api/records/') && method === 'DELETE') {
        const recordId = urlPath.split('/api/records/')[1];
        const record = db.records.find(r => r.id === recordId);
        if (record) {
            const userExists = db.users.some(u => u.id === record.userId);
            if (!userExists) {
                return sendError(res, 401, 'Tài khoản của bạn đã bị xóa khỏi hệ thống!');
            }
        }
        db.records = db.records.filter(r => r.id !== recordId);
        saveDB(db);
        return sendJSON(res, 200, { message: 'Đã xóa' });
    }

    if (urlPath.startsWith('/api/records/') && method === 'PUT') {
        const recordId = urlPath.split('/api/records/')[1];
        const body = await parseBody(req);
        const { date, hasLunchOT, otStart, otEnd, eveningOTHours, totalHours, note } = body;
        const idx = db.records.findIndex(r => r.id === recordId);
        if (idx < 0) return sendError(res, 404, 'Không tìm thấy bản ghi!');

        const userExists = db.users.some(u => u.id === db.records[idx].userId);
        if (!userExists) {
            return sendError(res, 401, 'Tài khoản của bạn đã bị xóa khỏi hệ thống!');
        }

        db.records[idx].date = date || db.records[idx].date;
        db.records[idx].hasLunchOT = hasLunchOT !== undefined ? !!hasLunchOT : db.records[idx].hasLunchOT;
        db.records[idx].otStart = otStart !== undefined ? otStart : db.records[idx].otStart;
        db.records[idx].otEnd = otEnd !== undefined ? otEnd : db.records[idx].otEnd;
        db.records[idx].eveningOTHours = eveningOTHours !== undefined ? eveningOTHours : db.records[idx].eveningOTHours;
        db.records[idx].totalHours = totalHours !== undefined ? totalHours : db.records[idx].totalHours;
        db.records[idx].note = note !== undefined ? note : db.records[idx].note;
        db.records[idx].updatedAt = new Date().toISOString();

        saveDB(db);
        return sendJSON(res, 200, { record: db.records[idx] });
    }

    // --- STATS ---
    if (urlPath === '/api/stats' && method === 'GET') {
        const currentMonth = getCurrentMonth();
        const today = new Date().toISOString().split('T')[0];
        const employees = db.users.filter(u => u.role === 'employee');
        const monthRecords = db.records.filter(r => r.date.startsWith(currentMonth));
        const todayRecords = db.records.filter(r => r.date === today);

        return sendJSON(res, 200, {
            totalUsers: employees.length,
            totalOTMonth: monthRecords.reduce((s, r) => s + r.totalHours, 0),
            todayOT: todayRecords.reduce((s, r) => s + r.totalHours, 0),
            lunchOTMonth: monthRecords.filter(r => r.hasLunchOT).length
        });
    }

    // --- GIST STATUS ---
    if (urlPath === '/api/gist-status' && method === 'GET') {
        const isRender = !!process.env.RENDER;
        const hasCredentials = !!(process.env.GIST_ID && process.env.GITHUB_TOKEN);

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
    }

    // --- SERVER VERSION ---
    if (urlPath === '/api/version' && method === 'GET') {
        let version = '1.0.0';
        try {
            const pkgPath = path.join(__dirname, '..', 'package.json');
            if (fs.existsSync(pkgPath)) {
                const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
                version = pkg.version || '1.0.0';
            }
        } catch (e) {
            console.error('[Version API] Lỗi đọc phiên bản:', e.message);
        }
        // Luôn tự sinh URL tải từ phiên bản hiện tại (không đọc từ config.json để tránh lỗi hardcode phiên bản cũ)
        const proto = req.headers['x-forwarded-proto'] || 'http';
        const baseUrl = `${proto}://${req.headers.host}`;
        const desktopDownloadUrl = `${baseUrl}/download/desktop`;
        const mobileDownloadUrl = `${baseUrl}/OT-Manager-mobile.apk`;
        return sendJSON(res, 200, { version, desktopDownloadUrl, mobileDownloadUrl });
    }

    // --- SERVER INFO ---
    if (urlPath === '/api/server-info' && method === 'GET') {
        const ip = getLocalIP();
        return sendJSON(res, 200, { ip, port: PORT, url: `http://${ip}:${PORT}` });
    }

    // --- CLOUD URL FOR DESKTOP CONFIG ---
    if (urlPath === '/api/cloud-url' && method === 'GET') {
        let cloudUrl = '';
        try {
            const configPath = getConfigPath();
            if (fs.existsSync(configPath)) {
                const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
                cloudUrl = config.serverUrl || '';
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
    }

    // --- MANUAL CLEANUP & BACKUP ---
    if (urlPath === '/api/records/cleanup' && method === 'POST') {
        const body = await parseBody(req);
        const { month } = body;
        if (!month || !month.match(/^\d{4}-\d{2}$/)) {
            return sendError(res, 400, 'Tháng không hợp lệ (định dạng đúng: YYYY-MM)!');
        }
        try {
            await performCleanup(month);
            return sendJSON(res, 200, { success: true, message: `Đã chốt công và dọn dẹp dữ liệu tháng ${month} thành công!` });
        } catch (err) {
            return sendError(res, 500, `Lỗi dọn dẹp: ${err.message}`);
        }
    }

    return sendError(res, 404, 'API not found');
}

// ==================== STATIC FILE SERVING ====================
function serveStatic(req, res, basePath, urlPath) {
    let filePath = urlPath === '/' ? '/index.html' : urlPath;
    filePath = path.join(basePath, filePath);

    // Security: prevent directory traversal
    if (!filePath.startsWith(basePath)) {
        res.writeHead(403);
        return res.end('Forbidden');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404);
            return res.end('Not found');
        }
        res.writeHead(200, {
            'Content-Type': contentType,
            'Access-Control-Allow-Origin': '*',
        });
        res.end(data);
    });
}

// ==================== HTTP SERVER ====================
const server = http.createServer(async (req, res) => {
    const method = req.method.toUpperCase();
    let urlPath = decodeURIComponent(req.url.split('?')[0]);
    // Normalize duplicate slashes (e.g. //api/records -> /api/records)
    urlPath = urlPath.replace(/\/+/g, '/');

    // CORS Preflight
    if (method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, x-device-id, x-user-id',
        });
        return res.end();
    }

    // SSE endpoint
    if (urlPath === '/api/events' && method === 'GET') {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*'
        });
        res.write('\n');
        sseClients.push(res);
        req.on('close', () => {
            sseClients = sseClients.filter(c => c !== res);
        });
        return;
    }

    // API routes
    if (urlPath.startsWith('/api/')) {
        try {
            return await handleAPI(req, res, urlPath, method);
        } catch (e) {
            console.error('API Error:', e);
            return sendError(res, 500, 'Lỗi server: ' + e.message);
        }
    }

    // Short download routes (e.g. /dl, /tai, /app)
    const cleanPath = urlPath.endsWith('/') && urlPath.length > 1 ? urlPath.slice(0, -1) : urlPath;
    if (cleanPath === '/dl' || cleanPath === '/tai' || cleanPath === '/app') {
        const mobilePath = path.join(__dirname, '..', 'mobile');
        return serveStatic(req, res, mobilePath, '/download.html');
    }

    // Direct download route for the Android APK (serve the local file directly to support private repositories)
    if (urlPath === '/OT-Manager-mobile.apk') {
        const apkPath = path.join(__dirname, '..', 'mobile', 'OT-Manager-mobile.apk');
        fs.readFile(apkPath, (err, data) => {
            if (err) {
                res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
                return res.end('Không tìm thấy file APK trên server.');
            }
            res.writeHead(200, {
                'Content-Type': 'application/vnd.android.package-archive',
                'Content-Disposition': 'attachment; filename="OT-Manager-mobile.apk"',
                'Access-Control-Allow-Origin': '*',
            });
            res.end(data);
        });
        return;
    }

    // Direct proxy download route for the desktop EXE installer using GITHUB_TOKEN (for private repos)
    if (urlPath === '/download/desktop') {
        const token = process.env.GITHUB_TOKEN;
        if (!token) {
            res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
            return res.end('Server chưa cấu hình GITHUB_TOKEN trên Render để tải bản Desktop.');
        }

        let version = '1.1.9';
        try {
            const pkgPath = path.join(__dirname, '..', 'package.json');
            if (fs.existsSync(pkgPath)) {
                const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
                version = pkg.version || '1.1.9';
            }
        } catch (e) {}

        const owner = 'hieuto706-max';
        const repo = 'OT';
        const tag = `v${version}`;
        const assetName = `ot-manager-Setup-${version}.exe`;

        // 1. Get release info from GitHub API
        const options = {
            hostname: 'api.github.com',
            path: `/repos/${owner}/${repo}/releases/tags/${tag}`,
            method: 'GET',
            headers: {
                'Authorization': `token ${token}`,
                'User-Agent': 'Node.js-Server-App',
                'Accept': 'application/vnd.github.v3+json'
            }
        };

        const reqGit = https.request(options, (resGit) => {
            let body = '';
            resGit.on('data', chunk => body += chunk);
            resGit.on('end', () => {
                if (resGit.statusCode !== 200) {
                    res.writeHead(resGit.statusCode, { 'Content-Type': 'text/plain; charset=utf-8' });
                    return res.end(`Lỗi GitHub API khi lấy thông tin Release: ${resGit.statusCode}. Chi tiết: ${body}`);
                }

                try {
                    const releaseInfo = JSON.parse(body);
                    const asset = releaseInfo.assets.find(a => a.name === assetName);
                    if (!asset) {
                        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
                        return res.end(`Không tìm thấy file build ${assetName} trong Release ${tag} trên GitHub.`);
                    }

                    // 2. Fetch asset binary using octet-stream header
                    const downloadOptions = {
                        hostname: 'api.github.com',
                        path: `/repos/${owner}/${repo}/releases/assets/${asset.id}`,
                        method: 'GET',
                        headers: {
                            'Authorization': `token ${token}`,
                            'User-Agent': 'Node.js-Server-App',
                            'Accept': 'application/octet-stream'
                        }
                    };

                    const handleDownloadRedirect = (dlUrl) => {
                        const parsedUrl = new URL(dlUrl);
                        const redirectClient = parsedUrl.protocol === 'https:' ? https : http;

                        redirectClient.get(dlUrl, (resDl) => {
                            if ([301, 302, 307, 308].includes(resDl.statusCode) && resDl.headers.location) {
                                return handleDownloadRedirect(resDl.headers.location);
                            }

                            if (resDl.statusCode !== 200) {
                                res.writeHead(resDl.statusCode, { 'Content-Type': 'text/plain; charset=utf-8' });
                                return res.end(`Lỗi khi tải file từ S3: ${resDl.statusCode}`);
                            }

                            res.writeHead(200, {
                                'Content-Type': 'application/octet-stream',
                                'Content-Disposition': `attachment; filename="${assetName}"`,
                                'Content-Length': resDl.headers['content-length']
                            });

                            resDl.pipe(res);
                        }).on('error', (err) => {
                            res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
                            res.end(`Lỗi kết nối tải file: ${err.message}`);
                        });
                    };

                    const reqAsset = https.request(downloadOptions, (resAsset) => {
                        if ([301, 302, 307, 308].includes(resAsset.statusCode) && resAsset.headers.location) {
                            handleDownloadRedirect(resAsset.headers.location);
                        } else {
                            res.writeHead(resAsset.statusCode, { 'Content-Type': 'text/plain; charset=utf-8' });
                            res.end(`Lỗi khi yêu cầu tải file từ GitHub: Mã trạng thái ${resAsset.statusCode}`);
                        }
                    });

                    reqAsset.on('error', (err) => {
                        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
                        res.end(`Lỗi tải file build: ${err.message}`);
                    });
                    reqAsset.end();

                } catch (e) {
                    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
                    res.end(`Lỗi xử lý thông tin Release: ${e.message}`);
                }
            });
        });

        reqGit.on('error', (err) => {
            res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end(`Lỗi kết nối GitHub API: ${err.message}`);
        });
        reqGit.end();
        return;
    }


    // Desktop admin app (served at /desktop/)
    if (urlPath.startsWith('/desktop')) {
        const desktopPath = urlPath.replace('/desktop', '') || '/';
        return serveStatic(req, res, path.join(__dirname, '..', 'desktop'), desktopPath);
    }

    // Mobile PWA / self-contained app (served at /mobile/)
    if (urlPath.startsWith('/mobile')) {
        const mobileSubPath = urlPath.replace('/mobile', '') || '/';
        return serveStatic(req, res, path.join(__dirname, '..', 'mobile'), mobileSubPath);
    }

    // Root landing page / web app (served at root /)
    const rootPath = path.join(__dirname, '..');
    return serveStatic(req, res, rootPath, urlPath);
});

function getCloudUrl() {
    try {
        const configPath = path.join(__dirname, '..', 'config.json');
        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            if (config.serverUrl) {
                let url = config.serverUrl.trim();
                if (url.endsWith('/')) {
                    url = url.slice(0, -1);
                }
                return url;
            }
        }
    } catch (e) {
        console.error('[Server] Lỗi đọc config.json:', e.message);
    }
    return null;
}

function startServer() {
    return new Promise((resolve) => {
        server.listen(PORT, '0.0.0.0', () => {
            const ip = getLocalIP();
            console.log(`✅ OT Manager Server đang chạy!`);
            console.log(`📱 Mobile (Nhân viên): http://${ip}:${PORT}`);
            console.log(`🖥️  Desktop: http://localhost:${PORT}/desktop/`);
            
            // Khởi chạy đường hầm tunnel kết nối từ xa qua internet (chỉ chạy khi không ở môi trường Cloud)
            if (!process.env.PORT) {
                const cloudUrl = getCloudUrl();
                const isLocal = !cloudUrl || cloudUrl.includes('localhost') || cloudUrl.includes('127.0.0.1');
                if (isLocal) {
                    try {
                        startTunnel();
                    } catch (e) {
                        console.error('Lỗi khởi chạy tunnel:', e);
                    }
                } else {
                    console.log(`☁️ App đang cấu hình trỏ về Cloud Server: ${cloudUrl}. Cập nhật Rentry và bỏ qua Tunnel local.`);
                    try {
                        const { updateRentry } = require('./tunnel');
                        updateRentry(cloudUrl);
                    } catch (e) {
                        console.error('[Server] Lỗi cập nhật Rentry:', e.message);
                    }
                }
            } else {
                console.log(`☁️ Đang chạy trên Cloud - Bỏ qua khởi chạy Tunnel SSH.`);
                // Tự động cập nhật Rentry với URL của Render
                const cloudUrl = process.env.RENDER_EXTERNAL_URL || process.env.SERVER_URL;
                if (cloudUrl) {
                    try {
                        const { updateRentry } = require('./tunnel');
                        updateRentry(cloudUrl);
                        console.log(`[Cloud] Đã tự động cập nhật URL Cloud lên Rentry: ${cloudUrl}`);
                    } catch (e) {
                        console.error('[Cloud] Lỗi tự động cập nhật Rentry:', e.message);
                    }
                }
            }
            
            // 1. Tự động kiểm tra dọn dẹp dữ liệu vào ngày >= 15 khi khởi động
            loadDB().then(db => {
                autoCleanupOn15th(db);
            }).catch(err => {
                console.error('[Startup] Lỗi nạp DB để tự động dọn dẹp:', err.message);
            });

            // 2. Chạy dọn dẹp tự động định kỳ mỗi 24 tiếng
            setInterval(async () => {
                try {
                    const db = await loadDB();
                    await autoCleanupOn15th(db);
                } catch (err) {
                    console.error('[Interval] Lỗi kiểm tra tự động dọn dẹp:', err.message);
                }
            }, 24 * 60 * 60 * 1000);

            resolve({ ip, port: PORT });
        });
    });
}

function stopServer() {
    console.log('[Server] Stopping OT Manager Server...');
    stopTunnel();
    if (server) {
        server.close();
    }
}

// If run directly (not imported)
if (require.main === module) {
    startServer();
}

module.exports = { startServer, stopServer, getLocalIP, PORT };
