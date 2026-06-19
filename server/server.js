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
const { startTunnel, stopTunnel, updateRentry } = require('./tunnel');

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
                // Loại bỏ ngoặc kép bọc giá trị
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

// ==================== PASSWORD HASHING ====================
function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
    return `pbkdf2$100000$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
    // Hỗ trợ so sánh với mật khẩu plaintext cũ (backward compatibility)
    if (!stored.startsWith('pbkdf2$')) {
        return password === stored;
    }
    const parts = stored.split('$');
    if (parts.length !== 4) return false;
    const iterations = parseInt(parts[1], 10);
    const salt = parts[2];
    const storedHash = parts[3];
    const hash = crypto.pbkdf2Sync(password, salt, iterations, 64, 'sha512').toString('hex');
    // Sử dụng timingSafeEqual để chống tấn công Timing Attack
    try {
        return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(storedHash, 'hex'));
    } catch (e) {
        return false;
    }
}

// Tự động chuyển đổi mật khẩu plaintext sang dạng băm khi khởi động
async function migratePasswords(db) {
    let migrated = false;
    db.users.forEach(user => {
        if (user.role === 'admin' && user.password && !user.password.startsWith('pbkdf2$')) {
            console.log(`[Migration] Băm mật khẩu cho tài khoản admin: ${user.username}`);
            user.password = hashPassword(user.password);
            migrated = true;
        }
    });
    return migrated;
}

// ==================== JWT TOKEN ====================
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');

function base64UrlEncode(data) {
    return Buffer.from(data).toString('base64')
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str) {
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) str += '=';
    return Buffer.from(str, 'base64').toString('utf-8');
}

function signJWT(payload, expiresInSeconds) {
    const header = { alg: 'HS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const fullPayload = { ...payload, iat: now, exp: now + (expiresInSeconds || 7 * 24 * 3600) };
    const headerB64 = base64UrlEncode(JSON.stringify(header));
    const payloadB64 = base64UrlEncode(JSON.stringify(fullPayload));
    const signature = crypto.createHmac('sha256', JWT_SECRET)
        .update(`${headerB64}.${payloadB64}`).digest('base64')
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return `${headerB64}.${payloadB64}.${signature}`;
}

function verifyJWT(token) {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return null;
        const [headerB64, payloadB64, signature] = parts;
        const expectedSig = crypto.createHmac('sha256', JWT_SECRET)
            .update(`${headerB64}.${payloadB64}`).digest('base64')
            .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        if (signature !== expectedSig) return null;
        const payload = JSON.parse(base64UrlDecode(payloadB64));
        if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) return null;
        return payload;
    } catch (e) {
        return null;
    }
}

// Giải mã JWT từ header Authorization: Bearer <token>
function authenticateToken(req) {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    const token = authHeader.substring(7);
    return verifyJWT(token);
}

// ==================== GPS VALIDATION (DISABLED) ====================


// ==================== DATABASE ENCRYPTION (AES-256-CBC) ====================
const DB_ENCRYPTION_KEY = process.env.DB_ENCRYPTION_KEY || '';

function encryptData(plaintext) {
    if (!DB_ENCRYPTION_KEY) return plaintext;
    try {
        const key = Buffer.from(DB_ENCRYPTION_KEY, 'hex');
        if (key.length !== 32) {
            console.warn('[Encryption] DB_ENCRYPTION_KEY phải đúng 64 ký tự hex (32 bytes). Bỏ qua mã hóa.');
            return plaintext;
        }
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
        let encrypted = cipher.update(plaintext, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return 'enc:' + iv.toString('hex') + ':' + encrypted;
    } catch (e) {
        console.error('[Encryption] Lỗi mã hóa:', e.message);
        return plaintext;
    }
}

function decryptData(ciphertext) {
    if (!DB_ENCRYPTION_KEY || !ciphertext.startsWith('enc:')) return ciphertext;
    try {
        const key = Buffer.from(DB_ENCRYPTION_KEY, 'hex');
        const parts = ciphertext.split(':');
        if (parts.length !== 3) return ciphertext;
        const iv = Buffer.from(parts[1], 'hex');
        const encrypted = parts[2];
        const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (e) {
        console.error('[Decryption] Lỗi giải mã:', e.message);
        return ciphertext;
    }
}

// ==================== CORS & SECURITY HEADERS ====================
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : null; // null = cho phép tất cả (backward compatible)

function getCorsOrigin(req) {
    const origin = req.headers['origin'] || '';
    if (!ALLOWED_ORIGINS) return '*'; // Backward compatible
    if (ALLOWED_ORIGINS.includes(origin)) return origin;
    // Cho phép localhost và các IP nội bộ
    if (origin.includes('localhost') || origin.includes('127.0.0.1') || /^https?:\/\/192\.168\./.test(origin)) {
        return origin;
    }
    return ''; // Từ chối
}

function getSecurityHeaders(req) {
    const isHTTPS = req.headers['x-forwarded-proto'] === 'https' || process.env.RENDER;
    const headers = {
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'no-referrer',
    };
    if (isHTTPS) {
        headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
    }
    return headers;
}

// ==================== WRITE QUEUE (Chống xung đột ghi) ====================
let writeQueue = Promise.resolve();

function enqueueWrite(fn) {
    writeQueue = writeQueue.then(fn).catch(e => {
        console.error('[WriteQueue] Lỗi:', e.message);
    });
    return writeQueue;
}

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
        try {
            const dir = path.dirname(DB_FILE);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        } catch (err) {
            console.error('[Server] Không thể tạo thư mục cho DB_PATH:', err.message);
        }
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
                    // Giải mã nếu dữ liệu đã được mã hóa
                    const rawContent = decryptData(file.content);
                    const db = JSON.parse(rawContent);
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
        // Mã hóa dữ liệu trước khi đẩy lên Gist
        const dbContent = JSON.stringify(data, null, 2);
        const encryptedContent = encryptData(dbContent);
        const payload = JSON.stringify({
            files: {
                'db.json': {
                    content: encryptedContent
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

    const dbFile = getDbPath();
    let fileLoaded = false;
    let localDB = null;

    // 1. Thử tải dữ liệu từ file local trước (Đặc biệt tối ưu khi có Persistent Disk)
    try {
        if (fs.existsSync(dbFile)) {
            const data = fs.readFileSync(dbFile, 'utf-8').trim();
            if (data) {
                localDB = JSON.parse(data);
                if (!localDB.users) localDB.users = [];
                if (!localDB.records) localDB.records = [];
                dbCache = localDB;
                fileLoaded = true;
                console.log('[Database] Tải dữ liệu thành công từ file local db.json.');
            }
        }
    } catch (e) {
        console.error('[Database] Lỗi khi đọc file local db.json:', e.message);
    }

    // 2. Nếu file local đã tồn tại và tải thành công, ta tin tưởng nó là bản mới nhất
    if (fileLoaded && localDB) {
        // Tự động băm mật khẩu plaintext cũ
        const migrated = await migratePasswords(localDB);
        if (migrated) {
            saveDB(localDB);
            console.log('[Migration] Đã tự động băm mật khẩu plaintext.');
        }
        return localDB;
    }

    // 3. Nếu file local chưa tồn tại (lần đầu deploy hoặc ổ đĩa bị reset), ta tải dữ liệu từ GitHub Gist để khôi phục
    let gistLoaded = false;
    if (process.env.GIST_ID && process.env.GITHUB_TOKEN) {
        try {
            console.log('[Gist] Không có file local. Đang khôi phục dữ liệu từ GitHub Gist...');
            const gistData = await fetchGist();
            if (gistData) {
                if (!gistData.users) gistData.users = [];
                if (!gistData.records) gistData.records = [];
                // Đồng bộ ghi vào file local db.json để các lần khởi động sau đọc trực tiếp
                fs.writeFileSync(dbFile, JSON.stringify(gistData, null, 2), 'utf-8');
                console.log('[Gist] Khôi phục dữ liệu từ Gist thành công!');
                dbCache = gistData;
                return gistData;
            }
        } catch (e) {
            console.error('[Gist] Lỗi tải từ Gist để khôi phục:', e.message);
            // Nếu là lỗi 404 hoặc không có db.json thì coi như Gist mới/chưa có database
            if (e.message.includes('404') || e.message.includes('not found')) {
                gistLoaded = false;
            } else {
                // Lỗi mạng hoặc lỗi kết nối, KHÔNG được ghi đè dữ liệu mặc định lên Gist!
                gistLoaded = 'failed';
            }
        }
    }

    // 4. Nếu cả local và Gist đều không có dữ liệu, khởi tạo database mặc định
    const defaultDB = {
        users: [{
            id: generateId(),
            username: 'admin',
            password: hashPassword('admin123'),
            fullname: 'Quản trị viên',
            role: 'admin',
            createdAt: new Date().toISOString()
        }],
        records: []
    };
    
    if (gistLoaded !== 'failed') {
        saveDB(defaultDB);
    } else {
        console.warn('[Gist] Cảnh báo: Gist lỗi kết nối. Khởi tạo DB tạm thời trong RAM.');
    }
    dbCache = defaultDB;
    return defaultDB;
}

function saveDB(data) {
    dbCache = data;
    // Sử dụng Write Queue để đảm bảo tuần tự ghi
    enqueueWrite(() => {
        fs.writeFileSync(getDbPath(), JSON.stringify(data, null, 2), 'utf-8');
        notifySseClients({ type: 'update' });

        // Cập nhật bất đồng bộ lên Gist (không làm nghẽn phản hồi API)
        if (process.env.GIST_ID && process.env.GITHUB_TOKEN) {
            return updateGist(data).catch(e => {
                console.error('[Gist] Lỗi cập nhật lên Gist:', e.message);
            });
        }
    });
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
    
    // 3. Xoá dữ liệu tháng cũ khỏi DB chính (giữ lại các bản ghi bù/bổ sung của tháng sau)
    db.records = db.records.filter(r => {
        const recordMonth = r.createdMonth || r.date.substring(0, 7);
        return recordMonth > month;
    });
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

function sendJSON(res, statusCode, data, req) {
    const corsOrigin = req ? getCorsOrigin(req) : '*';
    const secHeaders = req ? getSecurityHeaders(req) : {};
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': corsOrigin,
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-device-id, x-user-id',
        ...secHeaders,
    });
    res.end(JSON.stringify(data));
}

function sendError(res, statusCode, message, req) {
    sendJSON(res, statusCode, { error: message }, req);
}

function getCurrentMonth() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// ==================== API ROUTES ====================
async function handleAPI(req, res, urlPath, method) {
    const db = await loadDB();

    // --- Xác thực JWT Token ---
    const jwtPayload = authenticateToken(req);
    // Fallback: Hỗ trợ cơ chế cũ (x-user-id header) để backward compatible trong giai đoạn chuyển đổi
    const reqUserId = jwtPayload ? jwtPayload.userId : req.headers['x-user-id'];
    const reqDeviceId = jwtPayload ? jwtPayload.deviceId : req.headers['x-device-id'];
    const reqUserRole = jwtPayload ? jwtPayload.role : null;
    const reqUserTeam = jwtPayload ? jwtPayload.team : null;

    // Gắn thông tin user vào request để các route sử dụng
    req.user = jwtPayload || null;

    // --- Phân quyền: Các API nhạy cảm yêu cầu JWT ---
    // Bỏ qua auth cho: login, version, server-info, cloud-url, gist-status
    const publicEndpoints = ['/api/auth/login', '/api/auth/request-unlink', '/api/version', '/api/server-info', '/api/cloud-url', '/api/gist-status'];
    const isPublicEndpoint = publicEndpoints.some(ep => urlPath === ep || urlPath.startsWith(ep + '/'));

    if (!isPublicEndpoint && !jwtPayload && !req.headers['x-user-id']) {
        return sendError(res, 401, 'Yêu cầu xác thực! Vui lòng đăng nhập lại.', req);
    }

    // Kiểm tra xem tài khoản có bị xóa khỏi hệ thống hoặc bị hủy liên kết thiết bị không
    if (reqUserId && !urlPath.startsWith('/api/auth/')) {
        const user = db.users.find(u => u.id === reqUserId);
        if (!user) {
            return sendError(res, 401, 'Tài khoản của bạn đã bị xóa khỏi hệ thống!', req);
        }
        if (user.role === 'employee') {
            const matchesNative = user.deviceId && user.deviceId === reqDeviceId;
            const matchesBrowser = user.browserDeviceId && user.browserDeviceId === reqDeviceId;
            if (!matchesNative && !matchesBrowser) {
                return sendError(res, 403, 'Thiết bị hoặc trình duyệt này đã bị hủy liên kết khỏi tài khoản!', req);
            }
        }
    }

    // Kiểm tra xem tài khoản có bị xóa khỏi hệ thống không (fallback qua query parameter)
    const url = new URL(req.url, `http://${req.headers.host}`);
    const queryUserId = url.searchParams.get('userId');
    if (queryUserId && !urlPath.startsWith('/api/auth/')) {
        const userExists = db.users.some(u => u.id === queryUserId);
        if (!userExists) {
            return sendError(res, 401, 'Tài khoản của bạn đã bị xóa khỏi hệ thống!', req);
        }
    }

    // --- AUTH ---
    if (urlPath === '/api/auth/login' && method === 'POST') {
        const { username, password, deviceId, isBrowser } = await parseBody(req);
        
        // Tìm user không phân biệt chữ hoa chữ thường
        const user = db.users.find(u => u.username.toLowerCase() === username.toLowerCase());
        if (!user) return sendError(res, 401, 'Sai tên đăng nhập!', req);

        // Nếu là nhân viên, cho phép đăng nhập không cần mật khẩu và liên kết thiết bị
        if (user.role === 'employee') {
            if (deviceId) {
                if (isBrowser) {
                    // Đăng nhập từ trình duyệt web
                    if (!user.browserDeviceId) {
                        // Kiểm tra xem trình duyệt này đã liên kết với tài khoản khác chưa
                        const otherOwner = db.users.find(u => u.role === 'employee' && u.id !== user.id && u.browserDeviceId === deviceId);
                        if (otherOwner) {
                            return sendError(res, 403, 'Trình duyệt này đã được liên kết với một tài khoản khác!', req);
                        }
                        user.browserDeviceId = deviceId;
                        saveDB(db);
                    } else if (user.browserDeviceId !== deviceId) {
                        return sendError(res, 403, 'Tài khoản này đã được đăng nhập trên một trình duyệt khác!', req);
                    }
                } else {
                    // Đăng nhập từ ứng dụng điện thoại (native app)
                    if (!user.deviceId) {
                        // Kiểm tra xem thiết bị này đã liên kết với tài khoản khác chưa
                        const otherOwner = db.users.find(u => u.role === 'employee' && u.id !== user.id && u.deviceId === deviceId);
                        if (otherOwner) {
                            return sendError(res, 403, 'Thiết bị này đã được liên kết với một tài khoản khác!', req);
                        }
                        user.deviceId = deviceId;
                        saveDB(db);
                    } else if (user.deviceId !== deviceId) {
                        return sendError(res, 403, 'Tài khoản này đã được đăng nhập trên một thiết bị khác!', req);
                    }
                }
            }
            const { password: _, ...safeUser } = user;
            const token = signJWT({ userId: user.id, role: user.role, team: user.team || '', deviceId: deviceId || '' }, 7 * 24 * 3600);
            return sendJSON(res, 200, { user: safeUser, token }, req);
        }

        // Nếu là admin, yêu cầu mật khẩu
        if (!verifyPassword(password || '', user.password)) {
            return sendError(res, 401, 'Sai mật khẩu!', req);
        }

        const { password: _, ...safeUser } = user;
        const token = signJWT({ userId: user.id, role: user.role, team: user.team || '' }, 24 * 3600);
        return sendJSON(res, 200, { user: safeUser, token }, req);
    }

    if (urlPath === '/api/auth/request-unlink' && method === 'POST') {
        const { username } = await parseBody(req);
        if (!username) return sendError(res, 400, 'Thiếu tên đăng nhập!', req);
        const user = db.users.find(u => u.username.toLowerCase() === username.toLowerCase());
        if (!user) return sendError(res, 404, 'Không tìm thấy tên đăng nhập trong hệ thống!', req);
        
        user.pendingUnlink = true;
        saveDB(db);
        return sendJSON(res, 200, { success: true, message: 'Đã gửi yêu cầu huỷ liên kết đến Quản trị viên!' }, req);
    }

    if (urlPath === '/api/auth/register' && method === 'POST') {
        // Phân quyền: Chỉ Admin/Sub-Admin mới được tạo tài khoản
        if (jwtPayload && reqUserRole !== 'admin') {
            return sendError(res, 403, 'Chỉ quản trị viên mới được tạo tài khoản mới!', req);
        }

        const body = await parseBody(req);
        const { fullname, username, password, role } = body;
        if (!fullname || !username) return sendError(res, 400, 'Vui lòng điền đầy đủ thông tin!', req);
        if (username.length < 3) return sendError(res, 400, 'Tên đăng nhập phải có ít nhất 3 ký tự!', req);
        
        const isEmployee = role !== 'admin';
        if (!isEmployee && (!password || password.length < 4)) {
            return sendError(res, 400, 'Mật khẩu quản trị viên phải có ít nhất 4 ký tự!', req);
        }

        if (db.users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
            return sendError(res, 409, 'Tên đăng nhập đã tồn tại!', req);
        }

        let userTeam = body.team || '';
        if (reqUserId) {
            const reqUser = db.users.find(u => u.id === reqUserId);
            if (reqUser && reqUser.role === 'admin' && reqUser.username !== 'admin') {
                // Nếu là sub-admin tạo, mặc định gán nhân viên vào team của sub-admin này
                userTeam = reqUser.team || '';
            }
        }

        const newUser = {
            id: generateId(),
            username,
            password: isEmployee ? (password || '123') : hashPassword(password),
            fullname,
            role: role || 'employee',
            team: userTeam,
            createdAt: new Date().toISOString()
        };
        db.users.push(newUser);
        saveDB(db);
        const { password: _, ...safeUser } = newUser;
        return sendJSON(res, 201, { user: safeUser }, req);
    }

    // --- USERS ---
    if (urlPath === '/api/users' && method === 'GET') {
        let filteredUsers = db.users;
        if (reqUserId) {
            const reqUser = db.users.find(u => u.id === reqUserId);
            if (reqUser && reqUser.role === 'admin' && reqUser.username !== 'admin') {
                const reqUserTeam = reqUser.team || '';
                // Sub-admin: chỉ xem các quản trị viên, nhân viên thuộc team mình, và nhân viên chưa phân team
                filteredUsers = db.users.filter(u => u.role === 'admin' || (reqUserTeam && u.team === reqUserTeam) || !u.team);
            }
        }
        const safeUsers = filteredUsers.map(({ password, ...u }) => u);
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

        // Phân quyền theo Team
        if (reqUserId) {
            const reqUser = db.users.find(u => u.id === reqUserId);
            if (reqUser && reqUser.role === 'admin' && reqUser.username !== 'admin') {
                const reqUserTeam = reqUser.team || '';
                if (user.team && user.team !== reqUserTeam) {
                    return sendError(res, 403, 'Bạn không có quyền xóa tài khoản của team khác!');
                }
            }
        }

        db.users = db.users.filter(u => u.id !== userId);
        db.records = db.records.filter(r => r.userId !== userId);
        saveDB(db);
        return sendJSON(res, 200, { message: 'Đã xóa' });
    }

    if (urlPath.startsWith('/api/users/') && method === 'PUT') {
        const userId = urlPath.split('/api/users/')[1];
        const body = await parseBody(req);
        const { fullname, password, role, deviceId, browserDeviceId, pendingUnlink, team } = body;
        const userIdx = db.users.findIndex(u => u.id === userId);
        if (userIdx < 0) return sendError(res, 404, 'Không tìm thấy người dùng!');

        const targetUser = db.users[userIdx];
        // Phân quyền theo Team
        if (reqUserId) {
            const reqUser = db.users.find(u => u.id === reqUserId);
            if (reqUser && reqUser.role === 'admin' && reqUser.username !== 'admin') {
                const reqUserTeam = reqUser.team || '';
                if (targetUser.id !== reqUserId && targetUser.team && targetUser.team !== reqUserTeam) {
                    return sendError(res, 403, 'Bạn không có quyền sửa tài khoản của team khác!');
                }
            }
        }

        if (fullname) db.users[userIdx].fullname = fullname;
        if (password) db.users[userIdx].password = password;
        if (deviceId !== undefined) db.users[userIdx].deviceId = deviceId;
        if (browserDeviceId !== undefined) db.users[userIdx].browserDeviceId = browserDeviceId;
        if (pendingUnlink !== undefined) db.users[userIdx].pendingUnlink = !!pendingUnlink;
        
        if (team !== undefined) {
            if (reqUserId) {
                const reqUser = db.users.find(u => u.id === reqUserId);
                if (reqUser && reqUser.role === 'admin' && reqUser.username !== 'admin') {
                    // Sub-admin chỉ được gán về team của mình hoặc để trống
                    const reqUserTeam = reqUser.team || '';
                    if (team && team !== reqUserTeam) {
                        db.users[userIdx].team = reqUserTeam;
                    } else {
                        db.users[userIdx].team = team;
                    }
                } else {
                    db.users[userIdx].team = team;
                }
            } else {
                db.users[userIdx].team = team;
            }
        }

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

        // Lọc records theo team nếu requester là Sub-admin
        if (reqUserId) {
            const reqUser = db.users.find(u => u.id === reqUserId);
            if (reqUser && reqUser.role === 'admin' && reqUser.username !== 'admin') {
                const reqUserTeam = reqUser.team || '';
                const allowedUserIds = db.users
                    .filter(u => u.role === 'admin' || (reqUserTeam && u.team === reqUserTeam) || !u.team)
                    .map(u => u.id);
                records = records.filter(r => allowedUserIds.includes(r.userId));
            }
        }

        if (userId) records = records.filter(r => r.userId === userId);
        if (month) {
            records = records.filter(r => r.createdMonth === month || (!r.createdMonth && r.date.startsWith(month)));
        }
        records.sort((a, b) => b.date.localeCompare(a.date));
        return sendJSON(res, 200, { records });
    }

    if (urlPath === '/api/records' && method === 'POST') {
        const body = await parseBody(req);
        const { userId, date, hasLunchOT, otStart, otEnd, eveningOTHours, totalHours, note } = body;
        if (!userId || !date) return sendError(res, 400, 'Thiếu thông tin!');

        // Phân quyền: Nhân viên chỉ được tạo bản ghi cho chính mình
        if (jwtPayload && reqUserRole === 'employee' && reqUserId !== userId) {
            return sendError(res, 403, 'Bạn chỉ được ghi nhận tăng ca cho chính mình!', req);
        }

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
            createdMonth: body.createdMonth || '',
            isBackfill: !!body.isBackfill,
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
            // Phân quyền: Nhân viên chỉ được xóa bản ghi của chính mình
            if (jwtPayload && reqUserRole === 'employee' && record.userId !== reqUserId) {
                return sendError(res, 403, 'Bạn chỉ được xóa bản ghi của chính mình!', req);
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

        // Phân quyền: Nhân viên chỉ được sửa bản ghi của chính mình
        if (jwtPayload && reqUserRole === 'employee' && db.records[idx].userId !== reqUserId) {
            return sendError(res, 403, 'Bạn chỉ được sửa bản ghi của chính mình!', req);
        }

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
        if (body.createdMonth !== undefined) db.records[idx].createdMonth = body.createdMonth;
        if (body.isBackfill !== undefined) db.records[idx].isBackfill = !!body.isBackfill;
        db.records[idx].updatedAt = new Date().toISOString();

        saveDB(db);
        return sendJSON(res, 200, { record: db.records[idx] });
    }

    // --- STATS ---
    if (urlPath === '/api/stats' && method === 'GET') {
        const currentMonth = getCurrentMonth();
        const today = new Date().toISOString().split('T')[0];
        
        let employees = db.users.filter(u => u.role === 'employee');
        let allowedUserIds = employees.map(u => u.id);

        if (reqUserId) {
            const reqUser = db.users.find(u => u.id === reqUserId);
            if (reqUser && reqUser.role === 'admin' && reqUser.username !== 'admin') {
                const adminTeam = reqUser.team || '';
                // Sub-admin: chỉ thống kê nhân viên thuộc team của mình
                employees = db.users.filter(u => u.role === 'employee' && u.team === adminTeam);
                // Thống kê bao gồm cả chính mình (admin) và nhân viên trong team
                allowedUserIds = [reqUserId, ...employees.map(u => u.id)];
            }
        }

        const monthRecords = db.records.filter(r => r.date.startsWith(currentMonth) && allowedUserIds.includes(r.userId));
        const todayRecords = db.records.filter(r => r.date === today && allowedUserIds.includes(r.userId));

        return sendJSON(res, 200, {
            totalUsers: employees.length,
            totalOTMonth: monthRecords.reduce((s, r) => s + r.totalHours, 0),
            todayOT: todayRecords.reduce((s, r) => s + r.totalHours, 0),
            lunchOTMonth: monthRecords.filter(r => r.hasLunchOT).length
        });
    }

    // --- TEAMS CONFIG ---
    if (urlPath === '/api/teams' && method === 'GET') {
        const defaultTeams = ['Team 1', 'Team 2', 'Team 3', 'Team 4', 'Team 5', 'Team 6', 'Team 7', 'Team 8', 'Team 9', 'Team 10'];
        const teams = db.teams || defaultTeams;
        return sendJSON(res, 200, { teams });
    }

    if (urlPath === '/api/teams' && method === 'POST') {
        // Phân quyền: Admin và Sub-Admin đều được cấu hình team
        if (reqUserId) {
            const user = db.users.find(u => u.id === reqUserId);
            if (!user || user.role !== 'admin') {
                return sendError(res, 403, 'Bạn không có quyền thiết lập team!', req);
            }
        }
        const body = await parseBody(req);
        const { teams, oldName, newName, deletedTeam } = body;
        if (!teams || !Array.isArray(teams)) {
            return sendError(res, 400, 'Danh sách team không hợp lệ!');
        }

        // Rename team for users
        if (oldName && newName) {
            db.users.forEach(u => {
                if (u.team === oldName) {
                    u.team = newName;
                }
            });
        }

        // Delete team for users
        if (deletedTeam) {
            db.users.forEach(u => {
                if (u.team === deletedTeam) {
                    u.team = '';
                }
            });
        }

        db.teams = teams;
        saveDB(db);
        return sendJSON(res, 200, { success: true, teams });
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

    // --- TRIGGER ELECTRON UPDATE ---
    if (urlPath === '/api/trigger-update' && method === 'POST') {
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
                    global.startElectronUpdate(downloadUrl, version);
                    return sendJSON(res, 200, { success: true });
                } catch (e) {
                    return sendJSON(res, 400, { success: false, message: `Lỗi parse JSON: ${e.message}` });
                }
            });
            return;
        } else {
            return sendJSON(res, 500, { success: false, message: 'Electron update handler chưa được đăng ký trên Main process' });
        }
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
        const corsOrigin = getCorsOrigin(req);
        res.writeHead(204, {
            'Access-Control-Allow-Origin': corsOrigin,
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-device-id, x-user-id',
            'Access-Control-Max-Age': '86400',
        });
        return res.end();
    }

    // SSE endpoint
    if (urlPath === '/api/events' && method === 'GET') {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': getCorsOrigin(req)
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
    if (urlPath === '/OT-Manager-mobile.apk' || (urlPath.startsWith('/OT-Manager-mobile') && urlPath.endsWith('.apk'))) {
        const mobileDir = path.join(__dirname, '..', 'mobile');
        fs.readdir(mobileDir, (err, files) => {
            if (err) {
                res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
                return res.end('Lỗi server khi đọc thư mục mobile.');
            }
            
            // Ưu tiên chọn đúng file được yêu cầu từ URL
            const requestedFile = path.basename(urlPath);
            let apkFile = null;
            if (files.includes(requestedFile)) {
                apkFile = requestedFile;
            } else {
                // Fallback: Tìm file .apk mới nhất (sắp xếp giảm dần theo thời gian hoặc bảng chữ cái)
                const apkFiles = files.filter(f => f.endsWith('.apk')).sort((a, b) => b.localeCompare(a));
                apkFile = apkFiles[0];
            }

            if (!apkFile) {
                res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
                return res.end('Không tìm thấy file APK trong thư mục mobile trên server.');
            }
            const apkPath = path.join(mobileDir, apkFile);
            fs.readFile(apkPath, (err, data) => {
                if (err) {
                    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
                    return res.end('Không tìm thấy file APK trên server.');
                }
                res.writeHead(200, {
                    'Content-Type': 'application/vnd.android.package-archive',
                    'Content-Disposition': `attachment; filename="${apkFile}"`,
                    'Access-Control-Allow-Origin': '*',
                });
                res.end(data);
            });
        });
        return;
    }

    // Direct proxy download route for the desktop EXE installer using GITHUB_TOKEN (for private repos)
    if (urlPath === '/download/desktop') {
        const isCheckOnly = req.url.includes('check=true');
        const token = process.env.GITHUB_TOKEN;
        if (!token) {
            if (isCheckOnly) {
                return sendJSON(res, 200, { ready: false, message: 'Server chưa cấu hình GITHUB_TOKEN trên Render để tải bản Desktop.' });
            }
            res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
            return res.end('Server chưa cấu hình GITHUB_TOKEN trên Render để tải bản Desktop.');
        }

        let version = '1.2.0';
        try {
            const pkgPath = path.join(__dirname, '..', 'package.json');
            if (fs.existsSync(pkgPath)) {
                const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
                version = pkg.version || '1.2.0';
            }
        } catch (e) {}

        const owner = 'hieuto706-max';
        const repo = 'OT';

        const fetchRelease = (versionToFetch) => {
            const tag = `v${versionToFetch}`;
            const assetName = `ot-manager-Setup-${versionToFetch}.exe`;

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
                    if (resGit.statusCode === 404 && versionToFetch !== '1.2.0') {
                        if (isCheckOnly) {
                            return sendJSON(res, 200, { ready: false, version: version });
                        }
                        console.log(`[Desktop Download] Release ${tag} không tìm thấy (404). Fallback về v1.2.0`);
                        return fetchRelease('1.2.0');
                    }
                    if (resGit.statusCode !== 200) {
                        if (isCheckOnly) {
                            return sendJSON(res, 200, { ready: false, error: `Lỗi GitHub API: ${resGit.statusCode}` });
                        }
                        res.writeHead(resGit.statusCode, { 'Content-Type': 'text/plain; charset=utf-8' });
                        return res.end(`Lỗi GitHub API khi lấy thông tin Release: ${resGit.statusCode}. Chi tiết: ${body}`);
                    }

                    try {
                        const releaseInfo = JSON.parse(body);
                        const asset = releaseInfo.assets.find(a => a.name === assetName);
                        if (!asset) {
                            if (versionToFetch !== '1.2.0') {
                                if (isCheckOnly) {
                                    return sendJSON(res, 200, { ready: false, version: version });
                                }
                                console.log(`[Desktop Download] Không tìm thấy asset ${assetName} trong Release ${tag}. Fallback về v1.2.0`);
                                return fetchRelease('1.2.0');
                            }
                            if (isCheckOnly) {
                                return sendJSON(res, 200, { ready: false, version: '1.2.0' });
                            }
                            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
                            return res.end(`Không tìm thấy file build ${assetName} trong Release ${tag} trên GitHub.`);
                        }

                        if (isCheckOnly) {
                            return sendJSON(res, 200, { ready: true, version: versionToFetch });
                        }

                        // 2. Fetch asset binary using octet-stream header (GitHub API returns a 302 Redirect to AWS S3)
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

                        const reqAsset = https.request(downloadOptions, (resAsset) => {
                            // Thay vì tải về rồi truyền qua Render (tốn băng thông Render), 
                            // chuyển hướng trình duyệt của client tải trực tiếp từ link S3 của GitHub.
                            if ([301, 302, 307, 308].includes(resAsset.statusCode) && resAsset.headers.location) {
                                res.writeHead(302, {
                                    'Location': resAsset.headers.location,
                                    'Access-Control-Allow-Origin': '*'
                                });
                                res.end();
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
                if (versionToFetch !== '1.2.0') {
                    console.error(`[Desktop Download] Lỗi kết nối GitHub API khi tải ${tag}: ${err.message}. Fallback về v1.2.0`);
                    return fetchRelease('1.2.0');
                }
                res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end(`Lỗi kết nối GitHub API: ${err.message}`);
            });
            reqGit.end();
        };

        fetchRelease(version);
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
    return new Promise((resolve, reject) => {
        const onError = (err) => {
            reject(err);
        };
        server.once('error', onError);

        server.listen(PORT, '0.0.0.0', () => {
            server.removeListener('error', onError);
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
                        updateRentry(cloudUrl);
                        console.log(`[Cloud] Đã tự động cập nhật URL Cloud lên Rentry: ${cloudUrl}`);
                    } catch (e) {
                        console.error('[Cloud] Lỗi tự động cập nhật Rentry:', e.message);
                    }
                }
            }


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
