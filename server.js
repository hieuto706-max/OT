/**
 * OT Manager Server
 * Cung cấp REST API cho cả desktop và mobile app
 * Lưu dữ liệu trong file db.json
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { startTunnel } = require('./tunnel');

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

    const defaultPath = path.join(__dirname, 'db.json');
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

// ==================== DATABASE ====================
function loadDB() {
    const dbFile = getDbPath();
    try {
        if (fs.existsSync(dbFile)) {
            const db = JSON.parse(fs.readFileSync(dbFile, 'utf-8'));
            if (!db.users) db.users = [];
            if (!db.records) db.records = [];
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
    saveDB(defaultDB);
    return defaultDB;
}

function saveDB(data) {
    fs.writeFileSync(getDbPath(), JSON.stringify(data, null, 2), 'utf-8');
    notifySseClients({ type: 'update' });
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
        'Access-Control-Allow-Headers': 'Content-Type',
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
    const db = loadDB();

    // Kiểm tra xem tài khoản có bị xóa khỏi hệ thống không
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
        const { username, password, deviceId } = await parseBody(req);
        
        // Tìm user không phân biệt chữ hoa chữ thường
        const user = db.users.find(u => u.username.toLowerCase() === username.toLowerCase());
        if (!user) return sendError(res, 401, 'Sai tên đăng nhập!');

        // Nếu là nhân viên, cho phép đăng nhập không cần mật khẩu và liên kết thiết bị
        if (user.role === 'employee') {
            if (deviceId) {
                if (!user.deviceId) {
                    // Liên kết thiết bị lần đầu
                    user.deviceId = deviceId;
                    saveDB(db);
                } else if (user.deviceId !== deviceId) {
                    return sendError(res, 403, 'Tài khoản này đã được liên kết với một thiết bị khác!');
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
        const { fullname, password, role, deviceId } = body;
        const userIdx = db.users.findIndex(u => u.id === userId);
        if (userIdx < 0) return sendError(res, 404, 'Không tìm thấy người dùng!');

        if (fullname) db.users[userIdx].fullname = fullname;
        if (password) db.users[userIdx].password = password;
        if (deviceId !== undefined) db.users[userIdx].deviceId = deviceId;
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

    // --- SERVER INFO ---
    if (urlPath === '/api/server-info' && method === 'GET') {
        const ip = getLocalIP();
        return sendJSON(res, 200, { ip, port: PORT, url: `http://${ip}:${PORT}` });
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
            'Access-Control-Allow-Headers': 'Content-Type',
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

    // Desktop admin app (served at /desktop/)
    if (urlPath.startsWith('/desktop')) {
        const desktopPath = urlPath.replace('/desktop', '') || '/';
        return serveStatic(req, res, __dirname, desktopPath);
    }

    // Mobile app (served at root /)
    const mobilePath = path.join(__dirname, 'mobile');
    return serveStatic(req, res, mobilePath, urlPath);
});

function startServer() {
    return new Promise((resolve) => {
        server.listen(PORT, '0.0.0.0', () => {
            const ip = getLocalIP();
            console.log(`✅ OT Manager Server đang chạy!`);
            console.log(`📱 Mobile (Nhân viên): http://${ip}:${PORT}`);
            console.log(`🖥️  Desktop: http://localhost:${PORT}/desktop/`);
            
            // Khởi chạy đường hầm tunnel kết nối từ xa qua internet (chỉ chạy khi không ở môi trường Cloud)
            if (!process.env.PORT) {
                try {
                    startTunnel();
                } catch (e) {
                    console.error('Lỗi khởi chạy tunnel:', e);
                }
            } else {
                console.log(`☁️ Đang chạy trên Cloud - Bỏ qua khởi chạy Tunnel SSH.`);
            }
            
            resolve({ ip, port: PORT });
        });
    });
}

// If run directly (not imported)
if (require.main === module) {
    startServer();
}

module.exports = { startServer, getLocalIP, PORT };
