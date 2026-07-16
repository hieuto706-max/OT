const crypto = require('crypto');
const nodemailer = require('nodemailer');

// ==================== STRUCTURED LOGGING ====================
function logInfo(message, ...args) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [INFO] ${message}`, ...args);
}

function logError(message, ...args) {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] [ERROR] ${message}`, ...args);
}

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
    
    try {
        return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(storedHash, 'hex'));
    } catch (e) {
        return false;
    }
}

// ==================== UNIQUE ID GENERATION ====================
function generateId() {
    return Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
}

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

        const mostRecent5AM = Math.floor(getMostRecent5AM() / 1000);
        if (payload.iat && payload.iat < mostRecent5AM) {
            return null;
        }

        return payload;
    } catch (e) {
        return null;
    }
}

function authenticateToken(req) {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    const token = authHeader.substring(7);
    return verifyJWT(token);
}

function getLocalIP() {
    const os = require('os');
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

// ==================== MAIL SERVICE ====================
async function sendMail(to, subject, text, html) {
    const config = require('./config');
    if (!config.SMTP_USER || !config.SMTP_PASS) {
        logError('[Mail] Bỏ qua gửi email vì thiếu SMTP_USER hoặc SMTP_PASS trong cấu hình.');
        return false;
    }
    
    try {
        const transporter = nodemailer.createTransport({
            host: config.SMTP_HOST,
            port: config.SMTP_PORT,
            secure: config.SMTP_SECURE,
            auth: {
                user: config.SMTP_USER,
                pass: config.SMTP_PASS
            }
        });

        const mailOptions = {
            from: config.SMTP_FROM,
            to,
            subject,
            text,
            html
        };

        const info = await transporter.sendMail(mailOptions);
        logInfo(`[Mail] Email đã gửi thành công tới: ${to}. MessageId: ${info.messageId}`);
        return true;
    } catch (e) {
        logError(`[Mail] Gửi email tới ${to} thất bại:`, e.message);
        return false;
    }
}

module.exports = {
    logInfo,
    logError,
    hashPassword,
    verifyPassword,
    generateId,
    encryptData,
    decryptData,
    getCorsOrigin,
    getSecurityHeaders,
    signJWT,
    verifyJWT,
    authenticateToken,
    getLocalIP,
    sendMail
};
