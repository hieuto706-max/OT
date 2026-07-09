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

// ==================== GLOBAL ERROR HANDLERS ====================
process.on('uncaughtException', (err) => {
    console.error('⚠️ [CRITICAL] Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ [CRITICAL] Unhandled Rejection at:', promise, 'reason:', reason);
});

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

// Tự động chuyển đổi các team dạng chuỗi cũ sang đối tượng cấu hình mới
function migrateTeams(db) {
    if (!db.teams) {
        db.teams = [];
        return false;
    }
    let migrated = false;
    db.teams = db.teams.map(team => {
        if (typeof team === 'string') {
            migrated = true;
            return {
                id: team,
                name: team,
                leaderId: null,
                leaderIds: [],
                customActivities: [],
                autoApproveRules: {
                    normalOT: false,
                    backfill: false,
                    sunday: false,
                    customActivity: false
                }
            };
        }
        // Đảm bảo có đầy đủ thuộc tính nếu là dạng đối tượng cũ
        let updated = false;
        if (!team.id) { team.id = team.name || generateId(); updated = true; }
        if (team.leaderId === undefined) { team.leaderId = null; updated = true; }
        if (team.leaderIds === undefined) { team.leaderIds = team.leaderId ? [team.leaderId] : []; updated = true; }
        if (!team.customActivities) { team.customActivities = []; updated = true; }
        if (!team.autoApproveRules) {
            team.autoApproveRules = {
                normalOT: false,
                backfill: false,
                sunday: false,
                customActivity: false
            };
            updated = true;
        } else {
            const rules = team.autoApproveRules;
            if (rules.normalOT === undefined) { rules.normalOT = false; updated = true; }
            if (rules.backfill === undefined) { rules.backfill = false; updated = true; }
            if (rules.sunday === undefined) { rules.sunday = false; updated = true; }
            if (rules.customActivity === undefined) { rules.customActivity = false; updated = true; }
        }
        if (updated) {
            migrated = true;
        }
        return team;
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

function getMostRecent5AM() {
    const now = new Date();
    const vnNow = new Date(now.getTime() + 7 * 3600000);
    const vnToday5AM = new Date(Date.UTC(
        vnNow.getUTCFullYear(),
        vnNow.getUTCMonth(),
        vnNow.getUTCDate(),
        5, 0, 0, 0
    ));
    let today5AM = vnToday5AM.getTime() - 7 * 3600000;
    if (now.getTime() < today5AM) {
        today5AM -= 24 * 3600000;
    }
    return today5AM;
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

        // Force logout after 5 AM check
        const mostRecent5AM = Math.floor(getMostRecent5AM() / 1000);
        if (payload.iat && payload.iat < mostRecent5AM) {
            return null;
        }

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
    if (!ALLOWED_ORIGINS) return origin || '*'; // Backward compatible
    if (ALLOWED_ORIGINS.includes(origin)) return origin;
    // Cho phép localhost, các IP nội bộ, và file:// hoặc null (từ Electron/Webview)
    if (origin.includes('localhost') || origin.includes('127.0.0.1') || /^https?:\/\/192\.168\./.test(origin) || origin === 'file://' || origin === 'null') {
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

const PORT = process.env.PORT || (process.versions.electron ? 0 : 8080);
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
    let configPath = path.join(__dirname, 'config.json');
    try {
        const { app } = require('electron');
        if (app) {
            const exeDir = path.dirname(process.execPath);
            const exeConfig = path.join(exeDir, 'config.json');
            if (fs.existsSync(exeConfig)) {
                configPath = exeConfig;
            } else if (app.isPackaged) {
                const asarConfig = path.join(__dirname, 'config.json');
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
let dbLoadingPromise = null;

// Structured Logging helpers
function logInfo(message, ...args) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [INFO] ${message}`, ...args);
}

function logError(message, ...args) {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] [ERROR] ${message}`, ...args);
}

// Connection Pool singleton — tái sử dụng kết nối thay vì tạo mới mỗi lần (tiết kiệm tài nguyên, ổn định hơn)
let pgPool = null;

function getPGPool() {
    if (!pgPool && process.env.DATABASE_URL) {
        const { Pool, types } = require('pg');
        // DATE OID = 1082. Giữ nguyên chuỗi YYYY-MM-DD từ DB, tránh sai lệch múi giờ trong JS
        types.setTypeParser(1082, (val) => val);

        pgPool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false },
            max: 5,                        // Tối đa 5 kết nối đồng thời
            idleTimeoutMillis: 30000,      // Đóng kết nối rảnh sau 30 giây
            connectionTimeoutMillis: 10000 // Timeout kết nối sau 10 giây
        });
        pgPool.on('error', (err) => {
            logError('[Database PG] Lỗi kết nối Pool (sẽ tự kết nối lại):', err.message);
        });
        logInfo('[Database PG] Đã khởi tạo Connection Pool (max=5, idle=30s, timeout=10s).');
    }
    return pgPool;
}

async function closePGPool() {
    if (pgPool) {
        await pgPool.end();
        pgPool = null;
        logInfo('[Database PG] Đã đóng Connection Pool.');
    }
}

async function initPGTable() {
    const pool = getPGPool();
    if (!pool) return;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Bảng nhân viên
        await client.query(`
            CREATE TABLE IF NOT EXISTS pg_users (
                id VARCHAR(100) PRIMARY KEY,
                username VARCHAR(100) UNIQUE NOT NULL,
                fullname VARCHAR(200),
                password TEXT,
                role VARCHAR(20) DEFAULT 'user',
                team VARCHAR(100),
                device_id TEXT,
                browser_device_id TEXT,
                push_subscriptions JSONB,
                fcm_tokens JSONB DEFAULT '[]'::jsonb,
                pending_unlink BOOLEAN DEFAULT false,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Bảng bản ghi tăng ca
        await client.query(`
            CREATE TABLE IF NOT EXISTS pg_records (
                id VARCHAR(100) PRIMARY KEY,
                user_id VARCHAR(100) NOT NULL REFERENCES pg_users(id) ON DELETE CASCADE,
                date DATE NOT NULL,
                has_lunch_ot BOOLEAN DEFAULT false,
                ot_start TIME,
                ot_end TIME,
                evening_ot_hours REAL DEFAULT 0,
                total_hours REAL DEFAULT 0,
                note TEXT,
                status VARCHAR(30),
                is_backfill BOOLEAN DEFAULT false,
                created_month VARCHAR(10),
                delivery_province TEXT,
                extra_data JSONB,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Bảng đội/tổ
        await client.query(`
            CREATE TABLE IF NOT EXISTS pg_teams (
                id VARCHAR(100) PRIMARY KEY,
                data JSONB NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Bảng tháng đã chốt
        await client.query(`
            CREATE TABLE IF NOT EXISTS pg_closed_months (
                month VARCHAR(20) PRIMARY KEY,
                closed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Tạo index tăng tốc truy vấn
        await client.query(`CREATE INDEX IF NOT EXISTS idx_records_user_id ON pg_records(user_id)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_records_date ON pg_records(date)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_records_user_date ON pg_records(user_id, date DESC)`);

        await client.query('COMMIT');
        logInfo('[Database PG] Khởi tạo thành công 4 bảng và các chỉ mục (bao gồm composite index).');
    } catch (err) {
        try {
            await client.query('ROLLBACK');
        } catch (rollbackErr) {}
        logError('[Database PG] Lỗi khởi tạo bảng:', err.message);
    } finally {
        client.release();
    }
}

// Chuyển đổi row PostgreSQL -> object JavaScript (camelCase)
function pgUserToJS(row) {
    return {
        id: row.id, username: row.username, fullname: row.fullname,
        password: row.password, role: row.role, team: row.team || undefined,
        deviceId: row.device_id || undefined, browserDeviceId: row.browser_device_id || undefined,
        pushSubscriptions: row.push_subscriptions || undefined,
        fcmTokens: row.fcm_tokens || [],
        pendingUnlink: row.pending_unlink || undefined,
        createdAt: row.created_at ? row.created_at.toISOString() : undefined,
        updatedAt: row.updated_at ? row.updated_at.toISOString() : undefined
    };
}

function pgRecordToJS(row) {
    const obj = {
        id: row.id,
        userId: row.user_id,
        date: row.date,
        hasLunchOT: row.has_lunch_ot,
        otStart: row.ot_start ? row.ot_start.substring(0, 5) : undefined,
        otEnd: row.ot_end ? row.ot_end.substring(0, 5) : undefined,
        eveningOTHours: row.evening_ot_hours,
        totalHours: row.total_hours,
        note: row.note,
        status: row.status || undefined,
        isBackfill: row.is_backfill || undefined,
        createdMonth: row.created_month || undefined,
        deliveryProvince: row.delivery_province || undefined,
        createdAt: row.created_at ? row.created_at.toISOString() : undefined,
        updatedAt: row.updated_at ? row.updated_at.toISOString() : undefined
    };
    // Gộp lại các trường mở rộng từ extra_data
    if (row.extra_data) {
        Object.assign(obj, row.extra_data);
    }
    // Xóa các giá trị undefined và null
    Object.keys(obj).forEach(k => (obj[k] === undefined || obj[k] === null) && delete obj[k]);
    return obj;
}

async function loadDBFromPG() {
    const pool = getPGPool();
    if (!pool) return null;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Kiểm tra xem bảng mới có dữ liệu không
        const usersCheck = await client.query('SELECT COUNT(*) as cnt FROM pg_users');
        const hasNewTables = parseInt(usersCheck.rows[0].cnt) > 0;

        if (hasNewTables) {
            // Tải từ bảng tách riêng
            const usersRes = await client.query('SELECT * FROM pg_users ORDER BY created_at');
            const recordsRes = await client.query('SELECT * FROM pg_records ORDER BY date DESC, created_at');
            const teamsRes = await client.query('SELECT data FROM pg_teams');
            const closedRes = await client.query('SELECT month FROM pg_closed_months');

            await client.query('COMMIT');

            const result = {
                users: usersRes.rows.map(pgUserToJS),
                records: recordsRes.rows.map(pgRecordToJS),
                teams: teamsRes.rows.map(r => r.data),
                closedMonths: closedRes.rows.map(r => r.month)
            };
            logInfo(`[Database PG] Tải từ bảng tách riêng: ${result.users.length} nhân viên, ${result.records.length} bản ghi, ${result.teams.length} đội.`);
            return result;
        } else {
            await client.query('COMMIT');
        }
    } catch (err) {
        try {
            await client.query('ROLLBACK');
        } catch (rollbackErr) {}
        logError('[Database PG] Lỗi nạp dữ liệu từ PostgreSQL:', err.message);
    } finally {
        client.release();
    }
    return null;
}

async function saveDBToPG(data) {
    const pool = getPGPool();
    if (!pool) return;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // === Đồng bộ bảng pg_users ===
        const existingUsers = await client.query('SELECT id FROM pg_users');
        const existingUserIds = new Set(existingUsers.rows.map(r => r.id));
        const currentUserIds = new Set((data.users || []).map(u => u.id));

        // Xóa users không còn tồn tại
        for (const id of existingUserIds) {
            if (!currentUserIds.has(id)) {
                await client.query('DELETE FROM pg_users WHERE id = $1', [id]);
            }
        }

        // Upsert users
        for (const u of (data.users || [])) {
            await client.query(`
                INSERT INTO pg_users (id, username, fullname, password, role, team, device_id, browser_device_id, push_subscriptions, pending_unlink, fcm_tokens, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                ON CONFLICT (id) DO UPDATE SET
                    username = $2, fullname = $3, password = $4, role = $5, team = $6,
                    device_id = $7, browser_device_id = $8, push_subscriptions = $9,
                    pending_unlink = $10, fcm_tokens = $11, updated_at = $13
            `, [
                u.id, u.username, u.fullname || '', u.password || '',
                u.role || 'user', u.team || null,
                u.deviceId || null, u.browserDeviceId || null,
                u.pushSubscriptions ? JSON.stringify(u.pushSubscriptions) : null,
                u.pendingUnlink || false,
                u.fcmTokens ? JSON.stringify(u.fcmTokens) : '[]',
                u.createdAt || new Date().toISOString(),
                u.updatedAt || new Date().toISOString()
            ]);
        }

        // === Đồng bộ bảng pg_records ===
        const existingRecords = await client.query('SELECT id FROM pg_records');
        const existingRecordIds = new Set(existingRecords.rows.map(r => r.id));
        const currentRecordIds = new Set((data.records || []).map(r => r.id));

        // Xóa records không còn tồn tại
        for (const id of existingRecordIds) {
            if (!currentRecordIds.has(id)) {
                await client.query('DELETE FROM pg_records WHERE id = $1', [id]);
            }
        }

        // Upsert records
        for (const r of (data.records || [])) {
            const knownFields = ['id','userId','date','hasLunchOT','otStart','otEnd','eveningOTHours','totalHours','note','status','isBackfill','createdMonth','deliveryProvince','createdAt','updatedAt'];
            const extraData = {};
            for (const key of Object.keys(r)) {
                if (!knownFields.includes(key)) extraData[key] = r[key];
            }
            await client.query(`
                INSERT INTO pg_records (id, user_id, date, has_lunch_ot, ot_start, ot_end, evening_ot_hours, total_hours, note, status, is_backfill, created_month, delivery_province, extra_data, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
                ON CONFLICT (id) DO UPDATE SET
                    user_id = $2, date = $3, has_lunch_ot = $4, ot_start = $5, ot_end = $6,
                    evening_ot_hours = $7, total_hours = $8, note = $9, status = $10,
                    is_backfill = $11, created_month = $12, delivery_province = $13,
                    extra_data = $14, updated_at = $16
            `, [
                r.id, r.userId, r.date,
                r.hasLunchOT || false, r.otStart || null, r.otEnd || null,
                r.eveningOTHours || 0, r.totalHours || 0,
                r.note || '', r.status || null,
                r.isBackfill || false, r.createdMonth || null,
                r.deliveryProvince || null,
                Object.keys(extraData).length > 0 ? JSON.stringify(extraData) : null,
                r.createdAt || new Date().toISOString(),
                r.updatedAt || new Date().toISOString()
            ]);
        }

        // === Đồng bộ bảng pg_teams ===
        await client.query('DELETE FROM pg_teams');
        for (const t of (data.teams || [])) {
            await client.query(`
                INSERT INTO pg_teams (id, data) VALUES ($1, $2)
            `, [t.id, JSON.stringify(t)]);
        }

        // === Đồng bộ bảng pg_closed_months ===
        await client.query('DELETE FROM pg_closed_months');
        for (const m of (data.closedMonths || [])) {
            await client.query(`
                INSERT INTO pg_closed_months (month) VALUES ($1)
            `, [m]);
        }

        await client.query('COMMIT');
        logInfo('[Database PG] Đồng bộ thành công lên 4 bảng.');
    } catch (err) {
        try {
            await client.query('ROLLBACK');
        } catch (rollbackErr) {}
        logError('[Database PG] Lỗi đồng bộ lên PostgreSQL:', err.message);
    } finally {
        client.release();
    }
}

async function loadDB() {
    if (dbCache) return JSON.parse(JSON.stringify(dbCache));
    if (dbLoadingPromise) return dbLoadingPromise.then(res => JSON.parse(JSON.stringify(res)));

    dbLoadingPromise = (async () => {
        // 0. Nếu có cấu hình PostgreSQL, ưu tiên nạp từ PostgreSQL trước!
        if (process.env.DATABASE_URL) {
            try {
                console.log('[Database PG] Đang kết nối tải cơ sở dữ liệu từ Cloud PostgreSQL...');
                const pgData = await loadDBFromPG();
                if (pgData) {
                    if (!pgData.users) pgData.users = [];
                    if (!pgData.records) pgData.records = [];
                    if (!pgData.closedMonths) pgData.closedMonths = [];
                    
                    const migratedTeams = migrateTeams(pgData);
                    const migratedPass = await migratePasswords(pgData);
                    if (migratedTeams || migratedPass) {
                        await saveDBToPG(pgData);
                    }
                    console.log('[Database PG] Tải dữ liệu từ PostgreSQL thành công!');
                    dbCache = pgData;
                    return pgData;
                }
            } catch (e) {
                console.error('[Database PG] Lỗi khi tải dữ liệu khởi động từ PostgreSQL:', e.message);
            }
        }

        const dbFile = getDbPath();
        let fileLoaded = false;
        let localDB = null;

        // 1. Nếu có cấu hình Gist, luôn ưu tiên đồng bộ tải dữ liệu mới nhất từ Gist về trước (tránh bị ghi đè bởi db.json mặc định từ Git)
        if (process.env.GIST_ID && process.env.GITHUB_TOKEN) {
            try {
                console.log('[Gist] Đang kết nối tải cơ sở dữ liệu từ GitHub Gist...');
                const gistData = await fetchGist();
                if (gistData) {
                    if (!gistData.users) gistData.users = [];
                    if (!gistData.records) gistData.records = [];
                    if (!gistData.closedMonths) gistData.closedMonths = [];
                    
                    const migratedTeams = migrateTeams(gistData);
                    const migratedPass = await migratePasswords(gistData);
                    if (migratedTeams || migratedPass) {
                        saveDB(gistData);
                    } else {
                        // Ghi đè vào file local làm cache
                        fs.writeFileSync(dbFile, JSON.stringify(gistData, null, 2), 'utf-8');
                    }
                    console.log('[Gist] Tải dữ liệu từ Gist thành công!');
                    if (process.env.DATABASE_URL) {
                        saveDBToPG(gistData).catch(e => console.error('[Database PG] Lỗi đồng bộ từ Gist lên PG:', e.message));
                    }
                    dbCache = gistData;
                    return gistData;
                }
            } catch (e) {
                console.error('[Gist] Lỗi khi tải dữ liệu khởi động từ Gist (sẽ dùng file local):', e.message);
            }
        }

        // 2. Thử tải dữ liệu từ file local (Đặc biệt tối ưu khi có Persistent Disk hoặc chạy local offline)
        try {
            if (fs.existsSync(dbFile)) {
                const data = fs.readFileSync(dbFile, 'utf-8').trim();
                if (data) {
                    localDB = JSON.parse(data);
                    if (!localDB.users) localDB.users = [];
                    if (!localDB.records) localDB.records = [];
                    if (!localDB.closedMonths) localDB.closedMonths = [];
                    dbCache = localDB;
                    fileLoaded = true;
                    console.log('[Database] Tải dữ liệu thành công từ file local db.json.');
                }
            }
        } catch (e) {
            console.error('[Database] Lỗi khi đọc file local db.json:', e.message);
        }

        // 3. Nếu file local đã tồn tại và tải thành công, ta tin tưởng nó là bản mới nhất
        if (fileLoaded && localDB) {
            // Tự động băm mật khẩu plaintext cũ và di trú cấu hình team
            const migratedPass = await migratePasswords(localDB);
            const migratedTeams = migrateTeams(localDB);
            if (migratedPass || migratedTeams) {
                saveDB(localDB);
                console.log('[Migration] Đã tự động di trú cơ sở dữ liệu (Passwords/Teams).');
            } else if (process.env.DATABASE_URL) {
                saveDBToPG(localDB).catch(e => console.error('[Database PG] Lỗi đồng bộ từ local lên PG:', e.message));
            }
            return localDB;
        }

        // 4. Nếu cả local và Gist đều không có dữ liệu, khởi tạo database mặc định
        const defaultDB = {
            users: [{
                id: generateId(),
                username: 'admin',
                password: hashPassword('admin123'),
                fullname: 'Quản trị viên',
                role: 'admin',
                isSuperAdmin: true,
                createdAt: new Date().toISOString()
            }],
            records: [],
            closedMonths: []
        };
        
        saveDB(defaultDB);
        return defaultDB;
    })();

    try {
        const result = await dbLoadingPromise;
        if (result && result.users) {
            const superAdmin = result.users.find(u => u.username === 'admin');
            if (superAdmin && !superAdmin.isSuperAdmin) {
                superAdmin.isSuperAdmin = true;
                saveDB(result);
                console.log('[Migration] Đã thiết lập cờ isSuperAdmin cho tài khoản admin mặc định.');
            }
        }
        return JSON.parse(JSON.stringify(result));
    } finally {
        dbLoadingPromise = null;
    }
}

function isUserEqual(u1, u2) {
    return u1.username === u2.username &&
           u1.fullname === u2.fullname &&
           u1.password === u2.password &&
           u1.role === u2.role &&
           u1.team === u2.team &&
           u1.deviceId === u2.deviceId &&
           u1.browserDeviceId === u2.browserDeviceId &&
           JSON.stringify(u1.pushSubscriptions) === JSON.stringify(u2.pushSubscriptions) &&
           JSON.stringify(u1.fcmTokens) === JSON.stringify(u2.fcmTokens) &&
           u1.pendingUnlink === u2.pendingUnlink;
}

function isRecordEqual(r1, r2) {
    const keys1 = Object.keys(r1);
    const keys2 = Object.keys(r2);
    if (keys1.length !== keys2.length) return false;
    for (const key of keys1) {
        if (typeof r1[key] === 'object' && r1[key] !== null) {
            if (JSON.stringify(r1[key]) !== JSON.stringify(r2[key])) return false;
        } else {
            if (r1[key] !== r2[key]) return false;
        }
    }
    return true;
}

async function syncDiffToPG(oldData, newData) {
    if (!oldData) {
        // Fallback: Nếu không có dữ liệu cũ để so sánh, thực hiện đồng bộ toàn bộ (Full Sync)
        return saveDBToPG(newData);
    }

    const pool = getPGPool();
    if (!pool) return;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        let changesCount = 0;

        // === 1. Đồng bộ bảng pg_users ===
        const oldUsersMap = new Map((oldData.users || []).map(u => [u.id, u]));
        const newUsersMap = new Map((newData.users || []).map(u => [u.id, u]));

        // Xóa những user bị xóa
        for (const [id] of oldUsersMap) {
            if (!newUsersMap.has(id)) {
                await client.query('DELETE FROM pg_users WHERE id = $1', [id]);
                changesCount++;
            }
        }

        // Thêm/Sửa những user thay đổi hoặc mới
        for (const [id, nu] of newUsersMap) {
            const ou = oldUsersMap.get(id);
            if (!ou || !isUserEqual(ou, nu)) {
                await client.query(`
                    INSERT INTO pg_users (id, username, fullname, password, role, team, device_id, browser_device_id, push_subscriptions, pending_unlink, fcm_tokens, created_at, updated_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                    ON CONFLICT (id) DO UPDATE SET
                        username = $2, fullname = $3, password = $4, role = $5, team = $6,
                        device_id = $7, browser_device_id = $8, push_subscriptions = $9,
                        pending_unlink = $10, fcm_tokens = $11, updated_at = $13
                `, [
                    nu.id, nu.username, nu.fullname || '', nu.password || '',
                    nu.role || 'user', nu.team || null,
                    nu.deviceId || null, nu.browserDeviceId || null,
                    nu.pushSubscriptions ? JSON.stringify(nu.pushSubscriptions) : null,
                    nu.pendingUnlink || false,
                    nu.fcmTokens ? JSON.stringify(nu.fcmTokens) : '[]',
                    nu.createdAt || new Date().toISOString(),
                    nu.updatedAt || new Date().toISOString()
                ]);
                changesCount++;
            }
        }

        // === 2. Đồng bộ bảng pg_records ===
        const oldRecordsMap = new Map((oldData.records || []).map(r => [r.id, r]));
        const newRecordsMap = new Map((newData.records || []).map(r => [r.id, r]));

        // Xóa những record bị xóa
        for (const [id] of oldRecordsMap) {
            if (!newRecordsMap.has(id)) {
                await client.query('DELETE FROM pg_records WHERE id = $1', [id]);
                changesCount++;
            }
        }

        // Thêm/Sửa những record thay đổi hoặc mới
        for (const [id, nr] of newRecordsMap) {
            const or = oldRecordsMap.get(id);
            if (!or || !isRecordEqual(or, nr)) {
                const knownFields = ['id','userId','date','hasLunchOT','otStart','otEnd','eveningOTHours','totalHours','note','status','isBackfill','createdMonth','deliveryProvince','createdAt','updatedAt'];
                const extraData = {};
                for (const key of Object.keys(nr)) {
                    if (!knownFields.includes(key)) extraData[key] = nr[key];
                }
                await client.query(`
                    INSERT INTO pg_records (id, user_id, date, has_lunch_ot, ot_start, ot_end, evening_ot_hours, total_hours, note, status, is_backfill, created_month, delivery_province, extra_data, created_at, updated_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
                    ON CONFLICT (id) DO UPDATE SET
                        user_id = $2, date = $3, has_lunch_ot = $4, ot_start = $5, ot_end = $6,
                        evening_ot_hours = $7, total_hours = $8, note = $9, status = $10,
                        is_backfill = $11, created_month = $12, delivery_province = $13,
                        extra_data = $14, updated_at = $16
                `, [
                    nr.id, nr.userId, nr.date,
                    nr.hasLunchOT || false, nr.otStart || null, nr.otEnd || null,
                    nr.eveningOTHours || 0, nr.totalHours || 0,
                    nr.note || '', nr.status || null,
                    nr.isBackfill || false, nr.createdMonth || null,
                    nr.deliveryProvince || null,
                    Object.keys(extraData).length > 0 ? JSON.stringify(extraData) : null,
                    nr.createdAt || new Date().toISOString(),
                    nr.updatedAt || new Date().toISOString()
                ]);
                changesCount++;
            }
        }

        // === 3. Đồng bộ bảng pg_teams ===
        const oldTeamsMap = new Map((oldData.teams || []).map(t => [t.id, t]));
        const newTeamsMap = new Map((newData.teams || []).map(t => [t.id, t]));

        // Xóa team bị xóa
        for (const [id] of oldTeamsMap) {
            if (!newTeamsMap.has(id)) {
                await client.query('DELETE FROM pg_teams WHERE id = $1', [id]);
                changesCount++;
            }
        }

        // Thêm/Sửa team thay đổi hoặc mới
        for (const [id, nt] of newTeamsMap) {
            const ot = oldTeamsMap.get(id);
            if (!ot || JSON.stringify(ot) !== JSON.stringify(nt)) {
                await client.query(`
                    INSERT INTO pg_teams (id, data) VALUES ($1, $2)
                    ON CONFLICT (id) DO UPDATE SET data = $2
                `, [nt.id, JSON.stringify(nt)]);
                changesCount++;
            }
        }

        // === 4. Đồng bộ bảng pg_closed_months ===
        const oldMonthsSet = new Set(oldData.closedMonths || []);
        const newMonthsSet = new Set(newData.closedMonths || []);

        // Xóa tháng bị bỏ chốt
        for (const m of oldMonthsSet) {
            if (!newMonthsSet.has(m)) {
                await client.query('DELETE FROM pg_closed_months WHERE month = $1', [m]);
                changesCount++;
            }
        }

        // Thêm tháng mới được chốt
        for (const m of newMonthsSet) {
            if (!oldMonthsSet.has(m)) {
                await client.query(`
                    INSERT INTO pg_closed_months (month) VALUES ($1)
                    ON CONFLICT (month) DO NOTHING
                `, [m]);
                changesCount++;
            }
        }

        await client.query('COMMIT');
        if (changesCount > 0) {
            logInfo(`[Database PG] Đồng bộ thành công ${changesCount} thay đổi (Direct CRUD).`);
        }
    } catch (err) {
        try {
            await client.query('ROLLBACK');
        } catch (rollbackErr) {}
        logError('[Database PG] Lỗi đồng bộ trực tiếp:', err.message);
    } finally {
        client.release();
    }
}

function saveDB(data) {
    const oldData = dbCache ? JSON.parse(JSON.stringify(dbCache)) : null;
    dbCache = data;
    // Sử dụng Write Queue để đảm bảo tuần tự ghi
    enqueueWrite(() => {
        fs.writeFileSync(getDbPath(), JSON.stringify(data, null, 2), 'utf-8');
        notifySseClients({ type: 'update' });

        // Cập nhật bất đồng bộ lên PostgreSQL (Direct CRUD qua Diffing hiệu năng cao)
        if (process.env.DATABASE_URL) {
            syncDiffToPG(oldData, data).catch(e => {
                logError('[Database PG] Lỗi cập nhật lên PostgreSQL:', e.message);
            });
        }

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
    '.mobileconfig': 'application/x-apple-aspen-config',
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
        req.on('data', chunk => { 
            body += chunk; 
            // Limit body size to 2MB to prevent memory exhaustion DoS attacks
            if (body.length > 2 * 1024 * 1024) {
                req.destroy();
                reject(new Error('Payload too large'));
            }
        });
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
    const publicEndpoints = ['/api/auth/login', '/api/auth/request-unlink', '/api/version', '/api/server-info', '/api/cloud-url', '/api/gist-status', '/api/apply-hotfix', '/api/trigger-update', '/api/notifications/vapid-public-key'];
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
            let matchesBrowser = user.browserDeviceId && user.browserDeviceId === reqDeviceId;
            
            // Tự động chuyển đổi ID cũ sang ID mới (Silent Migration) nếu thiết bị gửi lên ID hợp lệ
            const isLegacyBrowserId = user.browserDeviceId && user.browserDeviceId.startsWith('web_') && user.browserDeviceId.length < 25;
            if (isLegacyBrowserId && !matchesNative && !matchesBrowser && reqDeviceId) {
                // Kiểm tra xem ID mới này đã bị liên kết bởi tài khoản khác hay chưa
                const otherOwner = db.users.find(u => u.role === 'employee' && u.id !== user.id && u.browserDeviceId === reqDeviceId);
                if (!otherOwner) {
                    user.browserDeviceId = reqDeviceId;
                    saveDB(db);
                    matchesBrowser = true;
                }
            }

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
        const { username, password, deviceId, isBrowser, clientSource } = await parseBody(req);
        
        // Tìm user không phân biệt chữ hoa chữ thường
        const user = db.users.find(u => u.username.toLowerCase() === username.toLowerCase());
        if (!user) return sendError(res, 401, 'Sai tên đăng nhập!', req);

        // Nếu là nhân viên, chỉ cho phép đăng nhập qua app APK hoặc app WebClip iOS (truyền clientSource = 'mobile_app')
        if (user.role === 'employee') {
            if (isBrowser && clientSource !== 'mobile_app') {
                return sendError(res, 403, 'Tài khoản nhân viên không được phép đăng nhập trên trình duyệt web thường. Vui lòng sử dụng ứng dụng di động (APK hoặc iOS WebClip)!', req);
            }
            if (deviceId) {
                const targetDeviceField = isBrowser ? 'browserDeviceId' : 'deviceId';
                const currentBoundId = user[targetDeviceField];
                
                const isLegacyBrowserId = isBrowser && currentBoundId && currentBoundId.startsWith('web_') && currentBoundId.length < 25;
                const hasNoBinding = !currentBoundId || isLegacyBrowserId;

                if (hasNoBinding) {
                    // Chưa liên kết thiết bị/trình duyệt
                    const otherOwner = db.users.find(u => u.role === 'employee' && u.id !== user.id && u[targetDeviceField] === deviceId);
                    if (otherOwner) {
                        return sendError(res, 403, isBrowser ? 'Trình duyệt này đã được liên kết với một tài khoản khác!' : 'Thiết bị này đã được liên kết với một tài khoản khác!', req);
                    }
                    user[targetDeviceField] = deviceId;
                    saveDB(db);
                } else if (currentBoundId !== deviceId) {
                    // Thiết bị không trùng khớp ➡️ Khóa và yêu cầu liên hệ Quản lý để hủy liên kết
                    const errMsg = isBrowser ? 'Tài khoản này đã được liên kết với trình duyệt khác. Vui lòng liên hệ Quản lý để hủy liên kết thiết bị cũ.' : 'Tài khoản này đã được liên kết với thiết bị khác. Vui lòng liên hệ Quản lý để hủy liên kết thiết bị cũ.';
                    return sendJSON(res, 403, { error: errMsg, code: 'device_locked' }, req);
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
            if (reqUser && reqUser.role === 'admin' && !reqUser.isSuperAdmin && reqUser.team !== 'admin') {
                // Nếu là sub-admin tạo, mặc định gán nhân viên vào team của sub-admin này
                userTeam = reqUser.team || '';
            }
        }
        if (role === 'admin' && !userTeam) {
            userTeam = 'admin';
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
            if (reqUser && reqUser.role === 'admin' && !reqUser.isSuperAdmin && reqUser.team !== 'admin') {
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
        let teamSettings = null;
        if (user.team) {
            const team = (db.teams || []).find(t => (typeof t === 'string' ? t : t.name) === user.team);
            if (team && typeof team === 'object') {
                teamSettings = team;
            }
        }
        return sendJSON(res, 200, { user: { ...safeUser, teamSettings } });
    }

    if (urlPath.startsWith('/api/users/') && method === 'DELETE') {
        const userId = urlPath.split('/api/users/')[1];
        const user = db.users.find(u => u.id === userId);
        if (!user) return sendError(res, 404, 'Không tìm thấy người dùng!');
        if (user.isSuperAdmin) return sendError(res, 403, 'Không thể xóa tài khoản Quản trị viên tối cao!');

        // Phân quyền theo Team
        if (reqUserId) {
            const reqUser = db.users.find(u => u.id === reqUserId);
            if (reqUser && reqUser.role === 'admin' && !reqUser.isSuperAdmin && reqUser.team !== 'admin') {
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
        const { fullname, username, password, role, deviceId, browserDeviceId, pendingUnlink, team } = body;
        const userIdx = db.users.findIndex(u => u.id === userId);
        if (userIdx < 0) return sendError(res, 404, 'Không tìm thấy người dùng!');

        const targetUser = db.users[userIdx];
        if (targetUser.isSuperAdmin && reqUserId !== targetUser.id) {
            return sendError(res, 403, 'Chỉ có Quản trị viên tối cao mới được chỉnh sửa tài khoản này!');
        }

        // Phân quyền theo Team
        if (reqUserId) {
            const reqUser = db.users.find(u => u.id === reqUserId);
            if (reqUser && reqUser.role === 'admin' && !reqUser.isSuperAdmin && reqUser.team !== 'admin') {
                const reqUserTeam = reqUser.team || '';
                if (targetUser.id !== reqUserId && targetUser.team && targetUser.team !== reqUserTeam) {
                    return sendError(res, 403, 'Bạn không có quyền sửa tài khoản của team khác!');
                }
            }
        }

        if (fullname) db.users[userIdx].fullname = fullname;
        if (username) {
            const lowercaseUsername = username.toLowerCase().trim();
            if (lowercaseUsername.length < 3) {
                return sendError(res, 400, 'Tên đăng nhập phải có ít nhất 3 ký tự!');
            }
            const existing = db.users.find(u => u.id !== userId && u.username.toLowerCase() === lowercaseUsername);
            if (existing) {
                return sendError(res, 409, 'Tên đăng nhập đã tồn tại!');
            }
            db.users[userIdx].username = username.trim();
        }
        if (password) db.users[userIdx].password = password;
        if (deviceId !== undefined) db.users[userIdx].deviceId = deviceId;
        if (browserDeviceId !== undefined) db.users[userIdx].browserDeviceId = browserDeviceId;
        if (pendingUnlink !== undefined) db.users[userIdx].pendingUnlink = !!pendingUnlink;
        
        if (team !== undefined) {
            if (reqUserId) {
                const reqUser = db.users.find(u => u.id === reqUserId);
                if (reqUser && reqUser.role === 'admin' && !reqUser.isSuperAdmin && reqUser.team !== 'admin') {
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
            if (db.users[userIdx].isSuperAdmin && role !== 'admin') {
                return sendError(res, 403, 'Không thể thay đổi vai trò của Quản trị viên tối cao!');
            }
            db.users[userIdx].role = role;
        }

        if (db.users[userIdx].role === 'admin' && (!db.users[userIdx].team || db.users[userIdx].team === '')) {
            db.users[userIdx].team = 'admin';
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
            if (reqUser && reqUser.role === 'admin' && !reqUser.isSuperAdmin && reqUser.team !== 'admin') {
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
        const { userId, date, hasLunchOT, otStart, otEnd, eveningOTHours, totalHours, note, deliveryProvince } = body;
        if (!userId || !date) return sendError(res, 400, 'Thiếu thông tin!');

        // Phân quyền: Nhân viên chỉ được tạo bản ghi cho chính mình
        if (jwtPayload && reqUserRole === 'employee' && reqUserId !== userId) {
            return sendError(res, 403, 'Bạn chỉ được ghi nhận tăng ca cho chính mình!', req);
        }

        const userExists = db.users.some(u => u.id === userId);
        if (!userExists) {
            return sendError(res, 401, 'Tài khoản của bạn đã bị xóa khỏi hệ thống!');
        }

        const today = new Date(Date.now() + 7 * 3600000).toISOString().split('T')[0];
        if (date > today) {
            return sendError(res, 400, 'Không thể đăng ký tăng ca cho ngày tương lai!');
        }

        // Check for existing record on same date
        const existingIdx = db.records.findIndex(r => r.userId === userId && r.date === date);
        const recordMonth = date.substring(0, 7);
        const currentMonth = today.substring(0, 7);
        const isMonthClosed = db.closedMonths && db.closedMonths.includes(recordMonth);
        const isPastMonth = recordMonth < currentMonth;
        const isBackfill = !!body.isBackfill || isMonthClosed || isPastMonth || (note && (note.includes('[BÙ THÁNG TRƯỚC]') || note.includes('[TĂNG THÁNG NÀY]')));

        let resolvedRole = reqUserRole;
        if (!resolvedRole && reqUserId) {
            const u = db.users.find(usr => usr.id === reqUserId);
            if (u) resolvedRole = u.role;
        }

        let status = 'approved';
        if (resolvedRole === 'admin') {
            status = body.status || 'approved';
        } else {
            // Nhân viên: Kiểm tra luật tự động duyệt của Team
            const employeeUser = db.users.find(u => u.id === userId);
            const userTeamName = employeeUser ? employeeUser.team : '';
            
            let autoApprove = false;
            if (userTeamName) {
                const team = (db.teams || []).find(t => (typeof t === 'string' ? t : t.name) === userTeamName);
                if (team && typeof team === 'object' && team.autoApproveRules) {
                    const rules = team.autoApproveRules;
                    const isSunday = new Date(date + 'T00:00:00').getDay() === 0;
                    const hasCustomActivity = !!body.customActivity;
                    
                    if (isSunday && rules.sunday) {
                        autoApprove = true;
                    } else if (isBackfill && rules.backfill) {
                        autoApprove = true;
                    } else if (hasCustomActivity && rules.customActivity) {
                        autoApprove = true;
                    } else if (!isSunday && !isBackfill && !hasCustomActivity && rules.normalOT) {
                        autoApprove = true;
                    }
                }
            }
            status = autoApprove ? 'approved' : 'pending';
        }

        const hasTrip = (deliveryProvince && deliveryProvince.trim() !== '') || body.calcMode === 'trip';
        const hasOT = (totalHours || 0) > 0 || !!hasLunchOT || (eveningOTHours || 0) > 0 || body.calcMode === 'hour';

        if (resolvedRole === 'admin' && status === 'approved' && hasTrip && hasOT) {
            // Tự động tách làm 2 bản ghi khi Admin tạo/duyệt trực tiếp
            const otRecord = {
                id: existingIdx >= 0 ? db.records[existingIdx].id : generateId(),
                userId,
                date,
                hasLunchOT: !!hasLunchOT,
                otStart: otStart || '',
                otEnd: otEnd || '',
                eveningOTHours: eveningOTHours || 0,
                totalHours: totalHours || 0,
                deliveryProvince: '',
                customActivity: body.calcMode === 'hour' ? (body.customActivity || '') : '',
                calcMode: body.calcMode === 'hour' ? (body.calcMode || '') : '',
                note: note || '',
                createdMonth: body.createdMonth || (isBackfill ? currentMonth : ''),
                isBackfill: isBackfill,
                status: 'approved',
                createdAt: existingIdx >= 0 ? db.records[existingIdx].createdAt : new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            const tripRecord = {
                id: generateId(),
                userId,
                date,
                hasLunchOT: false,
                otStart: '',
                otEnd: '',
                eveningOTHours: 0,
                totalHours: 0,
                deliveryProvince: deliveryProvince || '',
                customActivity: body.calcMode === 'trip' ? (body.customActivity || '') : '',
                calcMode: body.calcMode === 'trip' ? (body.calcMode || '') : '',
                note: note || '',
                createdMonth: body.createdMonth || (isBackfill ? currentMonth : ''),
                isBackfill: isBackfill,
                status: 'approved',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            if (existingIdx >= 0) {
                db.records[existingIdx] = otRecord;
            } else {
                db.records.push(otRecord);
            }
            db.records.push(tripRecord);
            saveDB(db);
            return sendJSON(res, existingIdx >= 0 ? 200 : 201, { record: otRecord, updated: existingIdx >= 0, split: true });
        }

        const record = {
            id: existingIdx >= 0 ? db.records[existingIdx].id : generateId(),
            userId,
            date,
            hasLunchOT: !!hasLunchOT,
            otStart: otStart || '',
            otEnd: otEnd || '',
            eveningOTHours: eveningOTHours || 0,
            totalHours: totalHours || 0,
            deliveryProvince: deliveryProvince || '',
            customActivity: body.customActivity || '',
            calcMode: body.calcMode || '',
            note: note || '',
            createdMonth: body.createdMonth || (isBackfill ? currentMonth : ''),
            isBackfill: isBackfill,
            status: status,
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

            const recordMonth = record.date.substring(0, 7);
            const isClosed = db.closedMonths && db.closedMonths.includes(recordMonth);

            let resolvedRole = reqUserRole;
            if (!resolvedRole && reqUserId) {
                const u = db.users.find(usr => usr.id === reqUserId);
                if (u) resolvedRole = u.role;
            }

            if (isClosed && resolvedRole !== 'admin') {
                return sendError(res, 403, 'Tháng này đã chốt OT, bạn không thể xóa bản ghi!', req);
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
        const { date, hasLunchOT, otStart, otEnd, eveningOTHours, totalHours, note, deliveryProvince, customActivity, calcMode } = body;
        const idx = db.records.findIndex(r => r.id === recordId);
        if (idx < 0) return sendError(res, 404, 'Không tìm thấy bản ghi!');

        let resolvedRole = reqUserRole;
        if (!resolvedRole && reqUserId) {
            const u = db.users.find(usr => usr.id === reqUserId);
            if (u) resolvedRole = u.role;
        }

        // Check if month is closed
        const recordMonth = db.records[idx].date.substring(0, 7);
        const isClosed = db.closedMonths && db.closedMonths.includes(recordMonth);
        if (isClosed && resolvedRole !== 'admin') {
            return sendError(res, 403, 'Tháng này đã chốt OT, bạn không thể chỉnh sửa bản ghi!', req);
        }

        // Phân quyền: Nhân viên chỉ được sửa bản ghi của chính mình
        if (jwtPayload && reqUserRole === 'employee' && db.records[idx].userId !== reqUserId) {
            return sendError(res, 403, 'Bạn chỉ được sửa bản ghi của chính mình!', req);
        }

        const userExists = db.users.some(u => u.id === db.records[idx].userId);
        if (!userExists) {
            return sendError(res, 401, 'Tài khoản của bạn đã bị xóa khỏi hệ thống!');
        }

        const today = new Date(Date.now() + 7 * 3600000).toISOString().split('T')[0];
        if (date && date > today) {
            return sendError(res, 400, 'Không thể đăng ký tăng ca cho ngày tương lai!');
        }

        db.records[idx].date = date || db.records[idx].date;
        db.records[idx].hasLunchOT = hasLunchOT !== undefined ? !!hasLunchOT : db.records[idx].hasLunchOT;
        db.records[idx].otStart = otStart !== undefined ? otStart : db.records[idx].otStart;
        db.records[idx].otEnd = otEnd !== undefined ? otEnd : db.records[idx].otEnd;
        db.records[idx].eveningOTHours = eveningOTHours !== undefined ? eveningOTHours : db.records[idx].eveningOTHours;
        db.records[idx].totalHours = totalHours !== undefined ? totalHours : db.records[idx].totalHours;
        db.records[idx].deliveryProvince = deliveryProvince !== undefined ? deliveryProvince : (db.records[idx].deliveryProvince || '');
        db.records[idx].customActivity = customActivity !== undefined ? customActivity : (db.records[idx].customActivity || '');
        db.records[idx].calcMode = calcMode !== undefined ? calcMode : (db.records[idx].calcMode || '');
        db.records[idx].note = note !== undefined ? note : db.records[idx].note;
        const currentMonth = today.substring(0, 7);
        const currentRecDate = db.records[idx].date;
        const currentRecMonth = currentRecDate.substring(0, 7);
        const isMonthClosed = db.closedMonths && db.closedMonths.includes(currentRecMonth);
        const isPastMonth = currentRecMonth < currentMonth;
        const currentNote = db.records[idx].note;
        const isBackfill = !!body.isBackfill || isMonthClosed || isPastMonth || (currentNote && (currentNote.includes('[BÙ THÁNG TRƯỚC]') || currentNote.includes('[TĂNG THÁNG NÀY]')));

        db.records[idx].isBackfill = isBackfill;

        if (body.createdMonth !== undefined) {
            db.records[idx].createdMonth = body.createdMonth;
        } else if (isBackfill && !db.records[idx].createdMonth) {
            db.records[idx].createdMonth = currentMonth;
        }

        if (resolvedRole === 'admin') {
            if (body.status !== undefined) {
                db.records[idx].status = body.status;
            }
        } else {
            // Nhân viên sửa bản ghi: tính toán status tự động dựa trên luật tự duyệt của Team
            const employeeUser = db.users.find(u => u.id === db.records[idx].userId);
            const userTeamName = employeeUser ? employeeUser.team : '';
            
            let autoApprove = false;
            if (userTeamName) {
                const team = (db.teams || []).find(t => (typeof t === 'string' ? t : t.name) === userTeamName);
                if (team && typeof team === 'object' && team.autoApproveRules) {
                    const rules = team.autoApproveRules;
                    const isSunday = new Date(db.records[idx].date + 'T00:00:00').getDay() === 0;
                    const hasCustomActivity = !!db.records[idx].customActivity;
                    
                    if (isSunday && rules.sunday) {
                        autoApprove = true;
                    } else if (isBackfill && rules.backfill) {
                        autoApprove = true;
                    } else if (hasCustomActivity && rules.customActivity) {
                        autoApprove = true;
                    } else if (!isSunday && !isBackfill && !hasCustomActivity && rules.normalOT) {
                        autoApprove = true;
                    }
                }
            }
            db.records[idx].status = autoApprove ? 'approved' : 'pending';
        }

        const statusToBeApproved = (body.status === 'approved') || (db.records[idx].status === 'approved');

        if (resolvedRole === 'admin' && statusToBeApproved) {
            const hasTrip = (db.records[idx].deliveryProvince && db.records[idx].deliveryProvince.trim() !== '') || db.records[idx].calcMode === 'trip';
            const hasOT = (db.records[idx].totalHours || 0) > 0 || !!db.records[idx].hasLunchOT || (db.records[idx].eveningOTHours || 0) > 0 || db.records[idx].calcMode === 'hour';

            if (hasTrip && hasOT) {
                // Tách tự động bản ghi kết hợp thành 2 bản ghi độc lập
                const originalProvince = db.records[idx].deliveryProvince;
                db.records[idx].deliveryProvince = '';
                db.records[idx].customActivity = db.records[idx].calcMode === 'hour' ? (db.records[idx].customActivity || '') : '';
                db.records[idx].calcMode = db.records[idx].calcMode === 'hour' ? (db.records[idx].calcMode || '') : '';
                db.records[idx].status = 'approved';
                db.records[idx].updatedAt = new Date().toISOString();

                const tripRecord = {
                    id: generateId(),
                    userId: db.records[idx].userId,
                    date: db.records[idx].date,
                    hasLunchOT: false,
                    otStart: '',
                    otEnd: '',
                    eveningOTHours: 0,
                    totalHours: 0,
                    deliveryProvince: originalProvince,
                    customActivity: db.records[idx].calcMode === 'trip' ? (db.records[idx].customActivity || '') : '',
                    calcMode: db.records[idx].calcMode === 'trip' ? (db.records[idx].calcMode || '') : '',
                    note: db.records[idx].note,
                    createdMonth: db.records[idx].createdMonth,
                    isBackfill: db.records[idx].isBackfill,
                    status: 'approved',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };

                db.records.push(tripRecord);
                saveDB(db);
                return sendJSON(res, 200, { record: db.records[idx], split: true });
            }
        }

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
            if (reqUser && reqUser.role === 'admin' && !reqUser.isSuperAdmin && reqUser.team !== 'admin') {
                const adminTeam = reqUser.team || '';
                // Sub-admin: chỉ thống kê nhân viên thuộc team của mình
                employees = db.users.filter(u => u.role === 'employee' && u.team === adminTeam);
                // Thống kê bao gồm cả chính mình (admin) và nhân viên trong team
                allowedUserIds = [reqUserId, ...employees.map(u => u.id)];
            }
        }

        const approvedRecords = db.records.filter(r => {
            const rMonth = r.createdMonth || r.date.substring(0, 7);
            return rMonth === currentMonth && allowedUserIds.includes(r.userId) && (r.status === 'approved' || (!r.isBackfill && r.status !== 'pending' && r.status !== 'rejected'));
        });
        const pendingRecords = db.records.filter(r => {
            const rMonth = r.createdMonth || r.date.substring(0, 7);
            return rMonth === currentMonth && allowedUserIds.includes(r.userId) && r.status === 'pending';
        });
        const pendingUnlinksCount = employees.filter(u => u.pendingUnlink).length;

        return sendJSON(res, 200, {
            totalUsers: employees.length,
            pendingOT: pendingRecords.length,
            pendingUnlinks: pendingUnlinksCount,
            totalOTMonth: approvedRecords.filter(r => !r.customActivity).reduce((s, r) => s + r.totalHours, 0),
            totalTripsMonth: approvedRecords.filter(r => r.customActivity && r.customActivity.trim() !== '').length
        });
    }

    // --- TEAMS CONFIG ---
    if (urlPath === '/api/teams' && method === 'GET') {
        const defaultTeams = [];
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

        // Đồng bộ gán tên team tương ứng cho các Leader và xoá team cho các cựu Leader
        db.users.forEach(u => {
            if (u.role === 'admin') {
                const ledTeam = teams.find(t => {
                    if (t && typeof t === 'object') {
                        const ids = t.leaderIds || (t.leaderId ? [t.leaderId] : []);
                        return ids.includes(u.id);
                    }
                    return false;
                });
                if (ledTeam) {
                    u.team = ledTeam.name;
                } else {
                    u.team = u.isSuperAdmin ? 'admin' : '';
                }
            }
        });

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

        let buildTime = 0;
        try {
            // Ưu tiên đọc buildTime từ thư mục hotfixes trước
            let buildPath = updatesDir ? path.join(updatesDir, 'build.json') : null;
            if (!buildPath || !fs.existsSync(buildPath)) {
                buildPath = path.join(__dirname, 'build.json');
            }
            if (fs.existsSync(buildPath)) {
                const buildInfo = JSON.parse(fs.readFileSync(buildPath, 'utf-8'));
                buildTime = buildInfo.buildTime || 0;
            }
        } catch (e) {
            // Fallback: Sử dụng mtime của server.js nếu không có build.json
            try {
                const serverPath = path.join(__dirname, 'server.js');
                if (fs.existsSync(serverPath)) {
                    buildTime = fs.statSync(serverPath).mtime.getTime();
                }
            } catch (fsErr) {}
        }

        // Luôn tự sinh URL tải từ phiên bản hiện tại (không đọc từ config.json để tránh lỗi hardcode phiên bản cũ)
        const proto = req.headers['x-forwarded-proto'] || 'http';
        const baseUrl = `${proto}://${req.headers.host}`;
        const desktopDownloadUrl = `${baseUrl}/download/desktop`;
        const mobileDownloadUrl = `${baseUrl}/OT-Manager-mobile.apk`;
        return sendJSON(res, 200, { version, buildTime, desktopDownloadUrl, mobileDownloadUrl });
    }

    // --- VAPID PUBLIC KEY ---
    if (urlPath === '/api/notifications/vapid-public-key' && method === 'GET') {
        return sendJSON(res, 200, { publicKey: VAPID_PUBLIC_KEY });
    }

    // --- SUBSCRIBE FOR PUSH ---
    if (urlPath === '/api/notifications/subscribe' && method === 'POST') {
        try {
            const body = await parseBody(req);
            const { subscription, fcmToken } = body;
            
            // Lấy user đăng nhập hiện tại
            const user = db.users.find(u => u.id === reqUserId);
            if (!user) {
                return sendError(res, 404, 'Không tìm thấy người dùng.', req);
            }
            
            let updated = false;

            // 1. Xử lý Web Push cũ
            if (subscription && subscription.endpoint) {
                if (!user.pushSubscriptions) {
                    user.pushSubscriptions = [];
                }
                const exists = user.pushSubscriptions.some(sub => sub.endpoint === subscription.endpoint);
                if (!exists) {
                    user.pushSubscriptions.push(subscription);
                    updated = true;
                    logInfo(`[Web Push] Đăng ký thông báo mới thành công cho nhân viên ${user.username}`);
                }
            }

            // 2. Xử lý Firebase FCM mới
            if (fcmToken) {
                if (!user.fcmTokens) {
                    user.fcmTokens = [];
                }
                if (!user.fcmTokens.includes(fcmToken)) {
                    user.fcmTokens.push(fcmToken);
                    updated = true;
                    logInfo(`[FCM] Đăng ký token mới thành công cho nhân viên ${user.username}`);
                }
            }
            
            if (updated) {
                saveDB(db);
            }
            
            return sendJSON(res, 200, { success: true }, req);
        } catch (e) {
            logError('[Notifications Subscribe] Lỗi:', e.message);
            return sendError(res, 500, 'Lỗi lưu thông tin đăng ký thông báo.', req);
        }
    }

    // --- TEST PUSH NOTIFICATION ---
    if (urlPath === '/api/notifications/test' && method === 'POST') {
        try {
            const user = db.users.find(u => u.id === reqUserId);
            if (!user) {
                return sendError(res, 404, 'Không tìm thấy người dùng.', req);
            }
            
            const hasWebPush = user.pushSubscriptions && user.pushSubscriptions.length > 0;
            const hasFCM = user.fcmTokens && user.fcmTokens.length > 0;

            if (!hasWebPush && !hasFCM) {
                return sendError(res, 400, 'Thiết bị chưa được cấp quyền nhận thông báo (Thiếu Web Push và FCM tokens).', req);
            }
            
            const title = 'Kiểm tra thông báo 🔔';
            const bodyText = 'Thông báo đẩy từ hệ thống OT Manager đã hoạt động thành công!';
            const payload = JSON.stringify({
                title: title,
                body: bodyText,
                data: { url: '/mobile/' },
                actions: [
                    { action: 'log', title: 'Ghi nhận ngay' },
                    { action: 'skip', title: 'Bỏ qua' }
                ]
            });
            
            let successCount = 0;

            // 1. Gửi qua Firebase FCM
            const activeFcmTokens = [];
            if (fcmInitialized && hasFCM) {
                for (const token of user.fcmTokens) {
                    try {
                        const message = {
                            notification: { title, body: bodyText },
                            data: { url: '/mobile/' },
                            token: token
                        };
                        await admin.messaging().send(message);
                        successCount++;
                        activeFcmTokens.push(token);
                    } catch (err) {
                        if (err.code === 'messaging/registration-token-not-registered' || err.code === 'messaging/invalid-argument') {
                            logInfo(`[FCM Test] Xóa token không hợp lệ của ${user.username}`);
                        } else {
                            logError(`[FCM Test] Lỗi gửi token cho ${user.username}:`, err.message);
                            activeFcmTokens.push(token);
                        }
                    }
                }
            }

            // 2. Gửi qua Web Push (Dự phòng / Fallback)
            const activeSubscriptions = [];
            if (hasWebPush) {
                for (const sub of user.pushSubscriptions) {
                    try {
                        await webpush.sendNotification(sub, payload);
                        successCount++;
                        activeSubscriptions.push(sub);
                    } catch (err) {
                        if (err.statusCode === 410 || err.statusCode === 404) {
                            logInfo(`[Web Push Test] Xóa subscription hết hạn của nhân viên ${user.username}`);
                        } else {
                            logError(`[Web Push Test] Lỗi gửi thông báo cho ${user.username}:`, err.message);
                            activeSubscriptions.push(sub);
                        }
                    }
                }
            }
            
            // Cập nhật lại các token sạch nếu có xóa
            let dbUpdated = false;
            if (hasFCM && activeFcmTokens.length !== user.fcmTokens.length) {
                user.fcmTokens = activeFcmTokens;
                dbUpdated = true;
            }
            if (hasWebPush && activeSubscriptions.length !== user.pushSubscriptions.length) {
                user.pushSubscriptions = activeSubscriptions;
                dbUpdated = true;
            }
            if (dbUpdated) {
                saveDB(db);
            }
            
            return sendJSON(res, 200, { success: true, count: successCount }, req);
        } catch (e) {
            logError('[Notifications Test] Lỗi:', e.message);
            return sendError(res, 500, 'Lỗi kiểm tra gửi thông báo đẩy.', req);
        }
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
    }

    // --- CLOSED MONTHS ---
    if (urlPath === '/api/records/closed-months' && method === 'GET') {
        const closed = db.closedMonths || [];
        return sendJSON(res, 200, { closedMonths: closed });
    }

async function notifyEmployeesMonthClosed(month) {
    try {
        const db = await loadDB();
        const employees = db.users.filter(u => u.role === 'employee');
        
        const parts = month.split('-');
        const displayMonth = parts.length === 2 ? `${parts[1]}/${parts[0]}` : month;
        
        const payload = JSON.stringify({
            title: 'Thông báo chốt công 🔒',
            body: `Tháng ${displayMonth} đã được chốt công và khóa ghi nhận tăng ca.`,
            data: { url: '/mobile/' }
        });
        
        for (const emp of employees) {
            if (emp.pushSubscriptions && emp.pushSubscriptions.length > 0) {
                const activeSubscriptions = [];
                for (const sub of emp.pushSubscriptions) {
                    try {
                        await webpush.sendNotification(sub, payload);
                        activeSubscriptions.push(sub);
                    } catch (err) {
                        if (err.statusCode === 410 || err.statusCode === 404) {
                            console.log(`[Web Push Close Month] Xóa subscription hết hạn của nhân viên ${emp.username}`);
                        } else {
                            console.error(`[Web Push Close Month] Lỗi gửi thông báo cho ${emp.username}:`, err.message);
                            activeSubscriptions.push(sub);
                        }
                    }
                }
                
                if (activeSubscriptions.length !== emp.pushSubscriptions.length) {
                    emp.pushSubscriptions = activeSubscriptions;
                }
            }
        }
        saveDB(db);
        console.log(`[Web Push Close Month] Đã gửi thông báo chốt công tháng ${month} cho nhân viên.`);
    } catch (e) {
        console.error('[Web Push Close Month] Lỗi gửi thông báo:', e.message);
    }
}

    if (urlPath === '/api/records/close-month' && method === 'POST') {
        if (reqUserId) {
            const user = db.users.find(u => u.id === reqUserId);
            if (!user || user.role !== 'admin') {
                return sendError(res, 403, 'Bạn không có quyền chốt OT!', req);
            }
        }
        const body = await parseBody(req);
        const { month } = body;
        if (!month || !month.match(/^\d{4}-\d{2}$/)) {
            return sendError(res, 400, 'Tháng không hợp lệ (định dạng đúng: YYYY-MM)!');
        }
        if (!db.closedMonths) {
            db.closedMonths = [];
        }
        if (!db.closedMonths.includes(month)) {
            db.closedMonths.push(month);
            saveDB(db);
            // Gửi thông báo đẩy cho tất cả nhân viên
            notifyEmployeesMonthClosed(month);
        }
        return sendJSON(res, 200, { success: true, closedMonths: db.closedMonths });
    }

    // --- APPLY HOTFIX ONLINE ---
    if (urlPath === '/api/apply-hotfix' && method === 'POST') {
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
                const filesToDownload = ['index.html', 'app.js', 'style.css'];
                const downloadPromises = filesToDownload.map(file => {
                    return new Promise((resolve, reject) => {
                        const fileUrl = `${cloudUrl}/desktop/${file}`;
                        const destPath = path.join(updatesDir, file);
                        const fileStream = fs.createWriteStream(destPath);
                        
                        const client = cloudUrl.startsWith('https') ? https : http;
                        const options = cloudUrl.startsWith('https') ? { rejectUnauthorized: false } : {};
                        client.get(fileUrl, options, (response) => {
                            if (response.statusCode !== 200) {
                                fileStream.close();
                                return reject(new Error(`Tải file ${file} thất bại: HTTP ${response.statusCode}`));
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
        return;
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
            return sendJSON(res, 200, { success: true, message: `Đã dọn dẹp dữ liệu tháng ${month} thành công!` });
        } catch (err) {
            return sendError(res, 500, `Lỗi dọn dẹp: ${err.message}`);
        }
    }

    return sendError(res, 404, 'API not found');
}

// ==================== STATIC FILE SERVING ====================
function serveStatic(req, res, basePath, urlPath) {
    let subFilePath = urlPath === '/' ? '/index.html' : urlPath;
    
    // Nếu là thư mục desktop, kiểm tra xem có bản vá lỗi (hotfix) cục bộ trong userData không
    if (basePath.endsWith('desktop') && updatesDir) {
        const hotfixPath = path.join(updatesDir, subFilePath);
        if (fs.existsSync(hotfixPath)) {
            const ext = path.extname(hotfixPath).toLowerCase();
            const contentType = MIME_TYPES[ext] || 'application/octet-stream';
            fs.readFile(hotfixPath, (err, data) => {
                if (!err) {
                    res.writeHead(200, {
                        'Content-Type': contentType,
                        'Access-Control-Allow-Origin': '*',
                        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0'
                    });
                    return res.end(data);
                }
            });
            return;
        }
    }

    let filePath = path.join(basePath, subFilePath);

    // Security: prevent directory traversal
    const resolvedBasePath = path.resolve(basePath);
    const resolvedFilePath = path.resolve(filePath);
    const safeBasePath = resolvedBasePath.endsWith(path.sep) ? resolvedBasePath : resolvedBasePath + path.sep;
    if (!resolvedFilePath.startsWith(safeBasePath) && resolvedFilePath !== resolvedBasePath) {
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
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0'
        });
        res.end(data);
    });
}

// ==================== RATE LIMITER ====================
const ipRequestCounts = new Map();
setInterval(() => {
    ipRequestCounts.clear();
}, 60000);

function isRateLimited(ip) {
    const limit = 200; // max 200 requests per minute
    const current = ipRequestCounts.get(ip) || 0;
    if (current >= limit) {
        return true;
    }
    ipRequestCounts.set(ip, current + 1);
    return false;
}

// ==================== HTTP SERVER ====================
const server = http.createServer(async (req, res) => {
    try {
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
        if (isRateLimited(ip)) {
            res.writeHead(429, { 'Content-Type': 'text/plain; charset=utf-8' });
            return res.end('Too Many Requests (Quá tải yêu cầu)');
        }

        const method = req.method.toUpperCase();
    let urlPath;
    try {
        urlPath = decodeURIComponent(req.url.split('?')[0]);
    } catch (e) {
        console.error(`[Malformed URL] Failed to decode URL: ${req.url}`, e);
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('Bad Request: Malformed URI');
    }
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

    // ACME HTTP-01 challenge response handler
    if (urlPath.startsWith('/.well-known/acme-challenge/')) {
        const token = urlPath.replace('/.well-known/acme-challenge/', '');
        const keyAuth = global.activeAcmeChallenges ? global.activeAcmeChallenges[token] : null;
        if (keyAuth) {
            res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
            return res.end(keyAuth);
        } else {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            return res.end('Challenge not found');
        }
    }

    // Favicon handler: Serve favicon.png for /favicon.ico and /favicon.png
    if (urlPath === '/favicon.ico' || urlPath === '/favicon.png') {
        const faviconPath = path.join(__dirname, '..', 'favicon.png');
        fs.readFile(faviconPath, (err, data) => {
            if (err) {
                res.writeHead(404);
                return res.end();
            }
            res.writeHead(200, {
                'Content-Type': 'image/png',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'public, max-age=86400'
            });
            return res.end(data);
        });
        return;
    }

    // Favicon handler: Serve favicon.svg for /favicon.svg
    if (urlPath === '/favicon.svg') {
        const faviconPath = path.join(__dirname, '..', 'favicon.svg');
        fs.readFile(faviconPath, (err, data) => {
            if (err) {
                res.writeHead(404);
                return res.end();
            }
            res.writeHead(200, {
                'Content-Type': 'image/svg+xml',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'public, max-age=86400'
            });
            return res.end(data);
        });
        return;
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

    // Helper function to sign configuration profile using OpenSSL if cert/key are provided
    // HƯỚNG DẪN CẤU HÌNH KÝ SỐ PROFILE (.mobileconfig) CHO IOS:
    // 1. Sao chép chứng chỉ SSL của tên miền server vào thư mục "server/" dưới tên:
    //    - cert.pem      : File chứng chỉ chính (SSL Certificate)
    //    - key.pem       : File khóa riêng tư (Private Key) không mật khẩu bảo vệ
    //    - fullchain.pem : File chuỗi chứng chỉ trung gian (CA Chain / Bundle) - Tùy chọn
    // 2. Hoặc cấu hình các biến môi trường: IOS_CERT_PATH, IOS_KEY_PATH, IOS_CHAIN_PATH
    // 3. Yêu cầu hệ thống đã cài đặt OpenSSL (trên Windows mặc định sẽ thử tìm OpenSSL của Git).
    function signProfile(unsignedXml) {
        const sslPaths = getSSLPaths();
        const certPath = sslPaths.cert;
        const keyPath = sslPaths.key;
        const chainPath = sslPaths.chain;

        if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
            // No custom certificates configured, return unsigned XML directly
            return Buffer.from(unsignedXml);
        }

        try {
            const { execSync } = require('child_process');
            const tempUnsigned = path.join(os.tmpdir(), `unsigned_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.mobileconfig`);
            const tempSigned = path.join(os.tmpdir(), `signed_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.mobileconfig`);
            
            fs.writeFileSync(tempUnsigned, unsignedXml, 'utf-8');

            let cmd = `openssl smime -sign -in "${tempUnsigned}" -out "${tempSigned}" -signer "${certPath}" -inkey "${keyPath}"`;
            if (fs.existsSync(chainPath)) {
                cmd += ` -certfile "${chainPath}"`;
            }
            cmd += ` -outform der -nodetach`;

            try {
                execSync(cmd, { stdio: 'ignore' });
            } catch (err) {
                // Windows fallback (Git's OpenSSL)
                const gitOpenSsl = 'C:\\Program Files\\Git\\usr\\bin\\openssl.exe';
                if (process.platform === 'win32' && fs.existsSync(gitOpenSsl)) {
                    const winCmd = `"${gitOpenSsl}" smime -sign -in "${tempUnsigned}" -out "${tempSigned}" -signer "${certPath}" -inkey "${keyPath}"` + (fs.existsSync(chainPath) ? ` -certfile "${chainPath}"` : '') + ` -outform der -nodetach`;
                    execSync(winCmd, { stdio: 'ignore' });
                } else {
                    throw err;
                }
            }

            const signedData = fs.readFileSync(tempSigned);

            try { fs.unlinkSync(tempUnsigned); } catch (e) {}
            try { fs.unlinkSync(tempSigned); } catch (e) {}

            return signedData;
        } catch (e) {
            console.error('[iOS Profile] Ký số thất bại, trả về tệp cấu hình chưa ký:', e.message);
            return Buffer.from(unsignedXml);
        }
    }

    // Direct route for iOS Configuration Profile (.mobileconfig) Web Clip
    if (urlPath === '/download/ios-profile') {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const clientDeviceId = url.searchParams.get('d') || '';

        const protocol = req.headers['x-forwarded-proto'] || (req.socket.encrypted ? 'https' : 'http');
        let targetUrl = `${protocol}://${req.headers.host}/mobile/`;
        if (clientDeviceId) {
            targetUrl += `?device_id=${encodeURIComponent(clientDeviceId)}`;
        }
        
        let iconBase64 = '';
        try {
            const iconPath = path.join(__dirname, '..', 'mobile', 'icon-120.png');
            if (fs.existsSync(iconPath)) {
                iconBase64 = fs.readFileSync(iconPath).toString('base64');
            }
        } catch (err) {
            console.error('[iOS Profile] Lỗi đọc file icon:', err.message);
        }

        const plistXml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>ConsentText</key>
    <dict>
        <key>default</key>
        <string>Cài đặt ứng dụng OT Manager lên màn hình chính thiết bị của bạn.</string>
    </dict>
    <key>PayloadContent</key>
    <array>
        <dict>
            <key>FullScreen</key>
            <true/>
            <key>Icon</key>
            <data>${iconBase64}</data>
            <key>IsRemovable</key>
            <true/>
            <key>Label</key>
            <string>OT Manager</string>
            <key>PayloadDescription</key>
            <string>Cấu hình ứng dụng quản lý tăng ca OT Manager</string>
            <key>PayloadDisplayName</key>
            <string>OT Manager</string>
            <key>PayloadIdentifier</key>
            <string>com.otmanager.webclip</string>
            <key>PayloadType</key>
            <string>com.apple.webClip.managed</string>
            <key>PayloadUUID</key>
            <string>E71ADF2F-9A52-4752-9A2E-8FA3C56EF010</string>
            <key>PayloadVersion</key>
            <integer>1</integer>
            <key>Precomposed</key>
            <true/>
            <key>URL</key>
            <string>${targetUrl}</string>
        </dict>
    </array>
    <key>PayloadDescription</key>
    <string>Cài đặt ứng dụng OT Manager lên màn hình chính</string>
    <key>PayloadDisplayName</key>
    <string>OT Manager</string>
    <key>PayloadIdentifier</key>
    <string>com.otmanager.profile</string>
    <key>PayloadOrganization</key>
    <string>OT Manager</string>
    <key>PayloadRemovalDisallowed</key>
    <false/>
    <key>PayloadType</key>
    <string>Configuration</string>
    <key>PayloadUUID</key>
    <string>C0F8E3C5-B9A6-4F8E-9D6C-7B4A5F2E1D3C</string>
    <key>PayloadVersion</key>
    <integer>1</integer>
</dict>
</plist>`.trim();

        const finalData = signProfile(plistXml);

        res.writeHead(200, {
            'Content-Type': 'application/x-apple-aspen-config',
            'Content-Disposition': 'attachment; filename="OT-Manager.mobileconfig"',
            'Cache-Control': 'no-store, no-cache, must-revalidate',
            'Access-Control-Allow-Origin': '*'
        });
        return res.end(finalData);
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

        const redirectToAsset = (assetId) => {
            const downloadOptions = {
                hostname: 'api.github.com',
                path: `/repos/${owner}/${repo}/releases/assets/${assetId}`,
                method: 'GET',
                headers: {
                    'Authorization': `token ${token}`,
                    'User-Agent': 'Node.js-Server-App',
                    'Accept': 'application/octet-stream'
                }
            };

            const reqAsset = https.request(downloadOptions, (resAsset) => {
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
        };

        const fetchLatestRelease = () => {
            const latestOptions = {
                hostname: 'api.github.com',
                path: `/repos/${owner}/${repo}/releases/latest`,
                method: 'GET',
                headers: {
                    'Authorization': `token ${token}`,
                    'User-Agent': 'Node.js-Server-App',
                    'Accept': 'application/vnd.github.v3+json'
                }
            };

            const reqLatest = https.request(latestOptions, (resLatest) => {
                let bodyLatest = '';
                resLatest.on('data', chunk => bodyLatest += chunk);
                resLatest.on('end', () => {
                    if (resLatest.statusCode !== 200) {
                        res.writeHead(resLatest.statusCode, { 'Content-Type': 'text/plain; charset=utf-8' });
                        return res.end(`Lỗi GitHub API khi lấy thông tin Release mới nhất: ${resLatest.statusCode}`);
                    }
                    try {
                        const latestInfo = JSON.parse(bodyLatest);
                        const latestTagName = latestInfo.tag_name;
                        const latestVer = latestTagName.replace(/^[vV]/, '');
                        const latestAssetName = `ot-manager-Setup-${latestVer}.exe`;
                        
                        const latestAsset = latestInfo.assets.find(a => a.name === latestAssetName);
                        if (!latestAsset) {
                            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
                            return res.end(`Không tìm thấy file build ${latestAssetName} trong Release mới nhất ${latestTagName} trên GitHub.`);
                        }
                        
                        redirectToAsset(latestAsset.id);
                    } catch (e) {
                        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
                        res.end(`Lỗi xử lý thông tin Release mới nhất: ${e.message}`);
                    }
                });
            });

            reqLatest.on('error', (errLatest) => {
                res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end(`Lỗi kết nối GitHub khi lấy Release mới nhất: ${errLatest.message}`);
            });
            reqLatest.end();
        };

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
                    if (resGit.statusCode === 404) {
                        if (isCheckOnly) {
                            return sendJSON(res, 200, { ready: false, version: version });
                        }
                        console.log(`[Desktop Download] Release ${tag} không tìm thấy (404). Đang lấy Release mới nhất khả dụng...`);
                        return fetchLatestRelease();
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
                            if (isCheckOnly) {
                                return sendJSON(res, 200, { ready: false, version: version });
                            }
                            console.log(`[Desktop Download] Không tìm thấy asset ${assetName} trong Release ${tag}. Đang lấy Release mới nhất...`);
                            return fetchLatestRelease();
                        }

                        if (isCheckOnly) {
                            return sendJSON(res, 200, { ready: true, version: versionToFetch });
                        }

                        redirectToAsset(asset.id);

                    } catch (e) {
                        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
                        res.end(`Lỗi xử lý thông tin Release: ${e.message}`);
                    }
                });
            });

            reqGit.on('error', (err) => {
                console.error(`[Desktop Download] Lỗi kết nối GitHub API khi tải ${tag}: ${err.message}. Đang lấy Release mới nhất...`);
                return fetchLatestRelease();
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
    } catch (err) {
        console.error('[Server Error] Unhandled exception during request processing:', err);
        try {
            res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Internal Server Error: ' + err.message);
        } catch (e) {}
    }
});

// ==================== FIREBASE CLOUD MESSAGING & WEB PUSH SYSTEM ====================
const admin = require('firebase-admin');
let fcmInitialized = false;

try {
    let serviceAccount = null;
    if (process.env.FIREBASE_CONFIG_JSON) {
        serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG_JSON);
    } else {
        const keyPath = path.join(__dirname, 'firebase-key.json');
        if (fs.existsSync(keyPath)) {
            serviceAccount = require(keyPath);
        }
    }

    if (serviceAccount) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        fcmInitialized = true;
        logInfo('[Firebase] Khởi tạo Firebase Admin SDK thành công.');
    } else {
        logInfo('[Firebase] Không tìm thấy file key hoặc cấu hình môi trường, bỏ qua khởi chạy Firebase.');
    }
} catch (err) {
    logError('[Firebase] Lỗi khởi tạo Firebase Admin SDK:', err.message);
}

const webpush = require('web-push');

function initWebPush() {
    try {
        let configPath = path.join(__dirname, 'config.json');
        if (!fs.existsSync(configPath)) {
            configPath = path.join(__dirname, '..', 'config.json');
        }
        let config = {};
        if (fs.existsSync(configPath)) {
            config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        }
        
        if (!config.vapidPublicKey || !config.vapidPrivateKey) {
            const keys = webpush.generateVAPIDKeys();
            config.vapidPublicKey = keys.publicKey;
            config.vapidPrivateKey = keys.privateKey;
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
            logInfo('[Web Push] Đã tự sinh cặp khóa VAPID mới và lưu vào config.json');
        }
        
        webpush.setVapidDetails(
            'mailto:support@otmanager.id.vn',
            config.vapidPublicKey,
            config.vapidPrivateKey
        );
        
        return config.vapidPublicKey;
    } catch (err) {
        logError('[Web Push] Lỗi khởi tạo:', err.message);
        return null;
    }
}

const VAPID_PUBLIC_KEY = initWebPush();
let lastNotifiedDate = '';

function startDailyReminderJob() {
    setInterval(() => {
        try {
            const now = new Date();
            // Đổi sang múi giờ Việt Nam (UTC+7)
            const vnTime = new Date(now.getTime() + 7 * 3600000);
            const hours = vnTime.getUTCHours();
            const minutes = vnTime.getUTCMinutes();
            
            // Chỉ chạy vào lúc 22:00
            if (hours === 22 && minutes === 0) {
                const dateStr = vnTime.toISOString().split('T')[0]; // Định dạng YYYY-MM-DD
                
                // Tránh gửi lặp lại trong cùng 1 phút
                if (lastNotifiedDate === dateStr) return;
                lastNotifiedDate = dateStr;
                
                // 1. Kiểm tra ngày Chủ Nhật (getDay() === 0)
                const dayOfWeek = vnTime.getUTCDay(); // 0: Chủ Nhật, 1: Thứ 2...
                if (dayOfWeek === 0) {
                    logInfo('[Daily Reminder] Hôm nay là Chủ Nhật, bỏ qua nhắc nhở.');
                    return;
                }
                
                logInfo(`[Daily Reminder] Đang bắt đầu quét nhắc nhở OT lúc 22:00 cho ngày ${dateStr}...`);
                sendDailyPushReminders(dateStr);
            }
        } catch (e) {
            logError('[Daily Reminder] Lỗi chu kỳ nhắc nhở:', e.message);
        }
    }, 30000); // Kiểm tra mỗi 30 giây
}

async function sendDailyPushReminders(dateStr) {
    const db = await loadDB();
    const employees = db.users.filter(u => u.role === 'employee');
    
    let notifyCount = 0;
    for (const emp of employees) {
        // Kiểm tra xem nhân viên này đã có bản ghi nào ngày hôm nay chưa
        const hasRecord = db.records.some(r => r.userId === emp.id && r.date === dateStr);
        if (hasRecord) {
            continue; // Đã note rồi -> bỏ qua
        }
        
        const hasWebPush = emp.pushSubscriptions && emp.pushSubscriptions.length > 0;
        const hasFCM = emp.fcmTokens && emp.fcmTokens.length > 0;

        if (!hasWebPush && !hasFCM) {
            continue; // Không đăng ký nhận tin -> bỏ qua
        }

        const title = 'Nhắc nhở OT Manager 📝';
        const bodyText = `Hôm nay (${dateStr}) bạn chưa ghi nhận tăng ca. Hãy note giờ OT nhé!`;
        const payload = JSON.stringify({
            title: title,
            body: bodyText,
            data: { url: '/mobile/' },
            actions: [
                { action: 'log', title: 'Ghi nhận ngay' },
                { action: 'skip', title: 'Bỏ qua' }
            ]
        });

        let dbUpdated = false;

        // 1. Gửi qua Firebase FCM (Ưu tiên hàng đầu)
        if (fcmInitialized && hasFCM) {
            const activeFcmTokens = [];
            for (const token of emp.fcmTokens) {
                try {
                    const message = {
                        notification: { title, body: bodyText },
                        data: { url: '/mobile/' },
                        token: token
                    };
                    await admin.messaging().send(message);
                    notifyCount++;
                    activeFcmTokens.push(token);
                } catch (err) {
                    if (err.code === 'messaging/registration-token-not-registered' || err.code === 'messaging/invalid-argument') {
                        logInfo(`[Daily Reminder FCM] Xóa token không hợp lệ của ${emp.username}`);
                        dbUpdated = true;
                    } else {
                        logError(`[Daily Reminder FCM] Lỗi gửi token cho ${emp.username}:`, err.message);
                        activeFcmTokens.push(token);
                    }
                }
            }
            if (activeFcmTokens.length !== emp.fcmTokens.length) {
                emp.fcmTokens = activeFcmTokens;
            }
        }

        // 2. Gửi qua Web Push (Fallback)
        if (hasWebPush) {
            const activeSubscriptions = [];
            for (const sub of emp.pushSubscriptions) {
                try {
                    await webpush.sendNotification(sub, payload);
                    notifyCount++;
                    activeSubscriptions.push(sub);
                } catch (err) {
                    // Nếu lỗi do thiết bị không còn tồn tại hoặc hết hạn (410 Gone / 404 Not Found), xóa subscription đó
                    if (err.statusCode === 410 || err.statusCode === 404) {
                        logInfo(`[Daily Reminder Web Push] Xóa subscription hết hạn của nhân viên ${emp.username}`);
                        dbUpdated = true;
                    } else {
                        logError(`[Daily Reminder Web Push] Lỗi gửi thông báo cho ${emp.username}:`, err.message);
                        activeSubscriptions.push(sub); // Giữ lại nếu lỗi mạng khác
                    }
                }
            }
            if (activeSubscriptions.length !== emp.pushSubscriptions.length) {
                emp.pushSubscriptions = activeSubscriptions;
            }
        }

        // Lưu cập nhật nếu có dọn dẹp token hết hạn
        if (dbUpdated) {
            saveDB(db);
        }
    }
    logInfo(`[Daily Reminder] Hoàn thành quét nhắc nhở. Đã gửi thành công ${notifyCount} thông báo.`);
}

function getCloudUrl() {
    try {
        let configPath = path.join(__dirname, 'config.json');
        if (!fs.existsSync(configPath)) {
            configPath = path.join(__dirname, '..', 'config.json');
        }
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

// ==================== SSL AUTO-RENEWAL SYSTEM (LET'S ENCRYPT) ====================
function getSSLPaths() {
    // 1. Nếu có dữ liệu chứng chỉ truyền qua biến môi trường dạng text (tiện lợi cho Cloud như Render), ghi ra file trước
    const localCert = path.join(__dirname, 'cert.pem');
    const localKey = path.join(__dirname, 'key.pem');
    const localChain = path.join(__dirname, 'fullchain.pem');

    if (process.env.SSL_CERT_CONTENT && process.env.SSL_KEY_CONTENT) {
        try {
            if (!fs.existsSync(localCert) || fs.readFileSync(localCert, 'utf8') !== process.env.SSL_CERT_CONTENT) {
                fs.writeFileSync(localCert, process.env.SSL_CERT_CONTENT, 'utf8');
                console.log('[SSL Setup] Đã cập nhật cert.pem từ biến môi trường SSL_CERT_CONTENT');
            }
            if (!fs.existsSync(localKey) || fs.readFileSync(localKey, 'utf8') !== process.env.SSL_KEY_CONTENT) {
                fs.writeFileSync(localKey, process.env.SSL_KEY_CONTENT, 'utf8');
                console.log('[SSL Setup] Đã cập nhật key.pem từ biến môi trường SSL_KEY_CONTENT');
            }
            if (process.env.SSL_CHAIN_CONTENT) {
                if (!fs.existsSync(localChain) || fs.readFileSync(localChain, 'utf8') !== process.env.SSL_CHAIN_CONTENT) {
                    fs.writeFileSync(localChain, process.env.SSL_CHAIN_CONTENT, 'utf8');
                    console.log('[SSL Setup] Đã cập nhật fullchain.pem từ biến môi trường SSL_CHAIN_CONTENT');
                }
            }
        } catch (e) {
            console.error('[SSL Setup] Lỗi khi ghi chứng chỉ từ biến môi trường:', e.message);
        }
    }

    // Nếu có biến môi trường cấu hình đường dẫn cụ thể, ưu tiên dùng
    if (process.env.IOS_CERT_PATH && process.env.IOS_KEY_PATH) {
        return {
            cert: process.env.IOS_CERT_PATH,
            key: process.env.IOS_KEY_PATH,
            chain: process.env.IOS_CHAIN_PATH || ''
        };
    }
    
    // Kiểm tra xem thư mục persistent /data của Render Starter có tồn tại không
    const persistentDir = '/data/certs';
    if (fs.existsSync('/data')) {
        if (!fs.existsSync(persistentDir)) {
            try {
                fs.mkdirSync(persistentDir, { recursive: true });
            } catch (e) {
                console.error('[SSL Auto-Renew] Lỗi tạo thư mục /data/certs:', e.message);
            }
        }
        
        const persistentCert = path.join(persistentDir, 'cert.pem');
        const persistentKey = path.join(persistentDir, 'key.pem');
        const persistentChain = path.join(persistentDir, 'fullchain.pem');

        // Đồng bộ dữ liệu chứng chỉ từ môi trường vào persistent disk nếu có
        if (process.env.SSL_CERT_CONTENT && process.env.SSL_KEY_CONTENT) {
            try {
                if (!fs.existsSync(persistentCert) || fs.readFileSync(persistentCert, 'utf8') !== process.env.SSL_CERT_CONTENT) {
                    fs.writeFileSync(persistentCert, process.env.SSL_CERT_CONTENT, 'utf8');
                }
                if (!fs.existsSync(persistentKey) || fs.readFileSync(persistentKey, 'utf8') !== process.env.SSL_KEY_CONTENT) {
                    fs.writeFileSync(persistentKey, process.env.SSL_KEY_CONTENT, 'utf8');
                }
                if (process.env.SSL_CHAIN_CONTENT) {
                    if (!fs.existsSync(persistentChain) || fs.readFileSync(persistentChain, 'utf8') !== process.env.SSL_CHAIN_CONTENT) {
                        fs.writeFileSync(persistentChain, process.env.SSL_CHAIN_CONTENT, 'utf8');
                    }
                }
            } catch (e) {
                console.error('[SSL Setup] Lỗi ghi chứng chỉ môi trường vào /data/certs:', e.message);
            }
        }
        
        // Đồng bộ chứng chỉ hiện tại sang lưu trữ vĩnh viễn nếu chưa tồn tại
        if (!fs.existsSync(persistentCert) && fs.existsSync(localCert) && fs.existsSync(localKey)) {
            try {
                fs.copyFileSync(localCert, persistentCert);
                fs.copyFileSync(localKey, persistentKey);
                if (fs.existsSync(localChain)) {
                    fs.copyFileSync(localChain, persistentChain);
                }
                console.log('[SSL Auto-Renew] Đã đồng bộ chứng chỉ hiện có sang lưu trữ vĩnh viễn /data/certs');
            } catch (err) {
                console.error('[SSL Auto-Renew] Lỗi đồng bộ chứng chỉ sang /data/certs:', err.message);
            }
        }
        
        return {
            cert: persistentCert,
            key: persistentKey,
            chain: persistentChain
        };
    }
    
    // Mặc định chạy local hoặc không có disk persistent
    return {
        cert: localCert,
        key: localKey,
        chain: localChain
    };
}

function getCertExpiry(certPath) {
    try {
        if (!fs.existsSync(certPath)) return 0;
        const certData = fs.readFileSync(certPath);
        const cert = new crypto.X509Certificate(certData);
        return new Date(cert.validTo).getTime();
    } catch (err) {
        console.error('[SSL Auto-Renew] Lỗi khi đọc ngày hết hạn chứng chỉ:', err.message);
        return 0;
    }
}

async function renewSSL(domain) {
    if (!domain) {
        console.log('[SSL Auto-Renew] Bỏ qua gia hạn: Không phát hiện tên miền hợp lệ.');
        return false;
    }
    
    const acme = require('acme-client');
    const eabKid = process.env.ZEROSSL_EAB_KID || '2WmkpWu0d2mE8x5kq-Xk6A';
    const eabHmac = process.env.ZEROSSL_EAB_HMAC || 'dg7anWVfRmu_xw-6JlIGhPGSFerqQ-4DiUMVV51zumcp2U36muU2W1DNhVFlRG39uw19uac92cc9JSXRkrKfGQ';
    
    async function requestCertFromProvider(isZeroSSL) {
        let directoryUrl;
        let externalAccountBinding = undefined;
        
        if (isZeroSSL) {
            directoryUrl = 'https://acme.zerossl.com/v2/DV90';
            externalAccountBinding = {
                kid: eabKid,
                hmacKey: eabHmac
            };
            console.log(`[SSL Auto-Renew] Đang thử xin chứng chỉ từ ZeroSSL cho tên miền: ${domain}`);
        } else {
            directoryUrl = process.env.SSL_USE_STAGING === 'true' 
                ? acme.directory.letsencrypt.staging 
                : acme.directory.letsencrypt.production;
            console.log(`[SSL Auto-Renew] Đang thử xin chứng chỉ từ Let's Encrypt cho tên miền: ${domain}`);
        }
        
        console.log(`[SSL Auto-Renew] Đang kết nối tới ACME Directory: ${directoryUrl}`);
        
        const clientOptions = {
            directoryUrl: directoryUrl,
            accountKey: await acme.crypto.createPrivateKey()
        };
        
        if (externalAccountBinding) {
            clientOptions.externalAccountBinding = externalAccountBinding;
        }
        
        const client = new acme.Client(clientOptions);
        
        console.log('[SSL Auto-Renew] Đang tạo khóa riêng tư và CSR...');
        const [key, csr] = await acme.crypto.createCsr({
            commonName: domain,
        });
        
        global.activeAcmeChallenges = global.activeAcmeChallenges || {};
        
        const cert = await client.auto({
            csr: csr,
            email: process.env.SSL_EMAIL || `admin@${domain}`,
            termsOfServiceAgreed: true,
            challengePriority: ['http-01'],
            challengeCreateFn: async (authz, challenge, keyAuthorization) => {
                const token = challenge.token;
                global.activeAcmeChallenges[token] = keyAuthorization;
                console.log(`[SSL Auto-Renew] Đang lưu trữ token thử thách HTTP-01: ${token}`);
            },
            challengeRemoveFn: async (authz, challenge, keyAuthorization) => {
                const token = challenge.token;
                delete global.activeAcmeChallenges[token];
                console.log(`[SSL Auto-Renew] Đã dọn dẹp token thử thách HTTP-01: ${token}`);
            }
        });
        
        return { cert, key };
    }
    
    let result = null;
    let successProvider = '';
    
    if (eabKid && eabHmac) {
        try {
            result = await requestCertFromProvider(true);
            successProvider = 'ZeroSSL';
        } catch (zeroErr) {
            console.error(`[SSL Auto-Renew] Yêu cầu cấp chứng chỉ qua ZeroSSL thất bại:`, zeroErr.message || zeroErr);
            console.log(`[SSL Auto-Renew] Đang tự động chuyển hướng sang Let's Encrypt làm phương án dự phòng...`);
        }
    }
    
    if (!result) {
        try {
            result = await requestCertFromProvider(false);
            successProvider = "Let's Encrypt";
        } catch (leErr) {
            console.error(`[SSL Auto-Renew] Yêu cầu cấp chứng chỉ qua Let's Encrypt thất bại:`, leErr.message || leErr);
            return false;
        }
    }
    
    try {
        const { cert, key } = result;
        const sslPaths = getSSLPaths();
        const certPath = sslPaths.cert;
        const keyPath = sslPaths.key;
        const chainPath = sslPaths.chain;
        
        fs.writeFileSync(certPath, cert, 'utf8');
        fs.writeFileSync(keyPath, key.toString(), 'utf8');
        if (chainPath) {
            fs.writeFileSync(chainPath, cert, 'utf8');
        }
        
        console.log(`[SSL Auto-Renew] Tự động cấp mới chứng chỉ thành công bằng [${successProvider}] cho tên miền: ${domain}`);
        return true;
    } catch (err) {
        console.error(`[SSL Auto-Renew] Lỗi ghi chứng chỉ ra tệp tin:`, err.message || err);
        return false;
    }
}

async function checkAndRenewCertificates() {
    const sslPaths = getSSLPaths();
    const certPath = sslPaths.cert;
    
    // 1. Tự động xác định tên miền của ứng dụng
    let domain = process.env.SSL_DOMAIN || '';
    if (!domain) {
        const cloudUrl = getCloudUrl() || process.env.SERVER_URL || '';
        if (cloudUrl && !cloudUrl.includes('localhost') && !cloudUrl.includes('127.0.0.1')) {
            try {
                domain = new URL(cloudUrl).hostname;
            } catch (e) {}
        }
    }
    
    if (!domain) {
        console.log('[SSL Auto-Renew] Bỏ qua kiểm tra: Không tìm thấy tên miền công khai hợp lệ trong cấu hình.');
        return;
    }
    
    if (domain.endsWith('.onrender.com')) {
        console.log(`[SSL Auto-Renew] Tên miền con mặc định của Render (${domain}) không được Let's Encrypt hỗ trợ tự cấp SSL trực tiếp. Bỏ qua tự động gia hạn.`);
        return;
    }
    
    console.log(`[SSL Auto-Renew] Đang kiểm tra thời hạn chứng chỉ cho tên miền: ${domain}`);
    
    let needsRenew = false;
    const expiry = getCertExpiry(certPath);
    if (expiry === 0) {
        console.log('[SSL Auto-Renew] Không tìm thấy chứng chỉ hiện tại hoặc chứng chỉ không hợp lệ.');
        needsRenew = true;
    } else {
        const daysRemaining = Math.floor((expiry - Date.now()) / (1000 * 60 * 60 * 24));
        console.log(`[SSL Auto-Renew] Chứng chỉ hiện tại sẽ hết hạn sau ${daysRemaining} ngày.`);
        if (daysRemaining < 30) {
            console.log('[SSL Auto-Renew] Chứng chỉ sắp hết hạn (dưới 30 ngày). Kích hoạt tự động gia hạn...');
            needsRenew = true;
        }
    }
    
    if (needsRenew) {
        await renewSSL(domain);
    }
}

function startServer() {
    return new Promise((resolve, reject) => {
        const onError = (err) => {
            reject(err);
        };
        server.once('error', onError);

        server.listen(PORT, '0.0.0.0', () => {
            server.removeListener('error', onError);
            const activePort = server.address().port;
            const ip = getLocalIP();
            console.log(`✅ OT Manager Server đang chạy!`);
            console.log(`📱 Mobile (Nhân viên): http://${ip}:${activePort}`);
            console.log(`🖥️  Desktop: http://localhost:${activePort}/desktop/`);
            
            // Khởi tạo bảng PostgreSQL trước (nếu có config), sau đó nạp DB
            (async () => {
                await initPGTable();
                await loadDB();
            })().catch(err => {
                console.error('[Server] Lỗi khởi tạo/nạp Database lúc khởi động:', err.message);
            });
            
            // Khởi chạy đường hầm tunnel kết nối từ xa qua internet (chỉ chạy khi không ở môi trường Cloud)
            if (!process.env.PORT) {
                const cloudUrl = getCloudUrl();
                const isLocal = !cloudUrl || cloudUrl.includes('localhost') || cloudUrl.includes('127.0.0.1');
                if (isLocal) {
                    try {
                        startTunnel(activePort);
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


            // Tự động kiểm tra gia hạn SSL Let's Encrypt sau khi khởi động 5 giây
            setTimeout(() => {
                checkAndRenewCertificates().catch(err => {
                    console.error('[SSL Auto-Renew] Lỗi chạy tự động gia hạn SSL:', err.message || err);
                });
            }, 5000);

            // Thiết lập chu kỳ kiểm tra gia hạn hàng ngày (24 giờ)
            setInterval(() => {
                checkAndRenewCertificates().catch(err => {
                    console.error('[SSL Auto-Renew] Lỗi chạy chu kỳ gia hạn SSL định kỳ:', err.message || err);
                });
            }, 24 * 60 * 60 * 1000);

            // Bắt đầu chạy background job nhắc nhở OT
            startDailyReminderJob();

            resolve({ ip, port: activePort });
        });
    });
}

function stopServer() {
    logInfo('[Server] Đang tắt máy chủ OT Manager...');
    stopTunnel();
    closePGPool().catch(() => {});
    if (server) {
        server.close();
    }
}

// Lắng nghe các tín hiệu tắt hệ thống để ngắt kết nối an toàn (Graceful Shutdown)
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

function gracefulShutdown(signal) {
    logInfo(`[Server] Nhận tín hiệu ${signal}. Bắt đầu tắt hệ thống an toàn...`);
    stopServer();
    // Chờ 1 giây để các request cuối cùng và DB kết thúc rồi mới tắt tiến trình
    setTimeout(() => {
        logInfo('[Server] Tắt hệ thống hoàn tất. Tạm biệt!');
        process.exit(0);
    }, 1000);
}

// If run directly (not imported)
if (require.main === module) {
    startServer();
}

module.exports = { startServer, stopServer, getLocalIP, PORT };
