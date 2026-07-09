/**
 * OT Manager Server
 * Cung cấp REST API cho cả desktop và mobile app
 * Entrypoint ứng dụng phục vụ file tĩnh và chuyển tiếp API
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { startTunnel, stopTunnel, updateRentry } = require('./tunnel');

const config = require('./config');
const { logInfo, logError, getCorsOrigin, getSecurityHeaders } = require('./utils');
const { getDbPath, initPGTable, loadDB, saveDB, closePGPool, onUpdate } = require('./db');
const { VAPID_PUBLIC_KEY, startDailyReminderJob } = require('./notifications');
const { handleAPI } = require('./api');

// ==================== GLOBAL ERROR HANDLERS ====================
process.on('uncaughtException', (err) => {
    console.error('⚠️ [CRITICAL] Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ [CRITICAL] Unhandled Rejection at:', promise, 'reason:', reason);
});

// ==================== CONFIGS & PARAMETERS ====================
const PORT = process.env.PORT || (process.versions.electron ? 0 : 8080);
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
            fs.rmSync(updatesDir, { recursive: true, force: true });
            logInfo(`[Hotfix] Đã dọn dẹp các hotfix cũ hơn build chính: ${internalBuildTime} >= ${hotfixBuildTime}`);
        }
    } catch (e) {
        logError('[Hotfix] Lỗi dọn dẹp hotfix cũ:', e.message);
    }
}

// ==================== SSE CLIENTS AND SYNCHRONIZATION ====================
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

// Lắng nghe sự kiện cập nhật DB để push SSE báo UI reload
onUpdate(() => {
    notifySseClients({ type: 'update' });
});

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

function getCloudUrl() {
    try {
        let configPath = path.join(__dirname, 'config.json');
        if (!fs.existsSync(configPath)) {
            configPath = path.join(__dirname, '..', 'config.json');
        }
        if (fs.existsSync(configPath)) {
            const localConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            if (localConfig.serverUrl) {
                let url = localConfig.serverUrl.trim();
                if (url.endsWith('/')) {
                    url = url.slice(0, -1);
                }
                return url;
            }
        }
    } catch (e) {
        logError('[Server] Lỗi đọc config.json:', e.message);
    }
    return null;
}

// ==================== SSL AUTO-RENEWAL SYSTEM (LET'S ENCRYPT) ====================
function getSSLPaths() {
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

    if (process.env.IOS_CERT_PATH && process.env.IOS_KEY_PATH) {
        return {
            cert: process.env.IOS_CERT_PATH,
            key: process.env.IOS_KEY_PATH,
            chain: process.env.IOS_CHAIN_PATH || ''
        };
    }
    
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

        if (process.env.SSL_CERT_CONTENT && process.env.SSL_KEY_CONTENT) {
            try {
                if (!fs.existsSync(persistentCert) || fs.readFileSync(persistentCert, 'utf8') !== process.env.SSL_CERT_CONTENT) {
                    fs.writeFileSync(persistentCert, process.env.SSL_CERT_CONTENT, 'utf8');
                }
                if (!fs.existsSync(persistentKey) || fs.readFileSync(persistentKey, 'utf8') !== process.env.SSL_KEY_CONTENT) {
                    fs.writeFileSync(persistentKey, process.env.SSL_KEY_CONTENT, 'utf8');
                }
            } catch (e) {
                console.error('[SSL Setup] Lỗi khi ghi chứng chỉ môi trường vào /data/certs:', e.message);
            }
        }
        
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

// ==================== STATIC FILE SERVING ====================
function serveStatic(req, res, basePath, urlPath) {
    let subFilePath = urlPath === '/' ? '/index.html' : urlPath;
    
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

    const filePath = path.join(basePath, subFilePath);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, data) => {
        if (err) {
            if (urlPath !== '/index.html' && (basePath.endsWith('desktop') || basePath.endsWith('mobile'))) {
                return serveStatic(req, res, basePath, '/index.html');
            }
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            return res.end('Không tìm thấy trang yêu cầu');
        }

        const headers = {
            'Content-Type': contentType,
            'Access-Control-Allow-Origin': '*',
        };
        if (ext === '.html' || ext === '.js' || ext === '.css' || ext === '.json' || ext === '.webmanifest') {
            headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0';
        } else {
            headers['Cache-Control'] = 'public, max-age=86400';
        }

        res.writeHead(200, headers);
        res.end(data);
    });
}

// iOS Profile Signer Helper
function signProfile(unsignedXml) {
    const sslPaths = getSSLPaths();
    const certPath = sslPaths.cert;
    const keyPath = sslPaths.key;
    const chainPath = sslPaths.chain;

    if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
        return Buffer.from(unsignedXml);
    }

    try {
        const execSync = require('child_process').execSync;
        const tempUnsigned = path.join(os.tmpdir(), `unsigned_${Date.now()}_${Math.random().toString(36).substring(7)}.mobileconfig`);
        const tempSigned = path.join(os.tmpdir(), `signed_${Date.now()}_${Math.random().toString(36).substring(7)}.mobileconfig`);

        fs.writeFileSync(tempUnsigned, unsignedXml, 'utf8');

        let cmd = `openssl smime -sign -in "${tempUnsigned}" -out "${tempSigned}" -signer "${certPath}" -inkey "${keyPath}" -certfile "${chainPath || certPath}" -outform der -nodetach`;
        execSync(cmd, { stdio: 'ignore' });

        const signedData = fs.readFileSync(tempSigned);
        
        try { fs.unlinkSync(tempUnsigned); } catch (e) {}
        try { fs.unlinkSync(tempSigned); } catch (e) {}

        console.log('[iOS Profile] Đã ký số thành công iOS Configuration Profile (.mobileconfig) bằng OpenSSL.');
        return signedData;
    } catch (e) {
        console.error('[iOS Profile] Ký số thất bại, trả về tệp cấu hình chưa ký:', e.message);
        return Buffer.from(unsignedXml);
    }
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

        // Favicon handlers
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

        // SSE event stream
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

        // Redirect API requests to handleAPI in api.js
        if (urlPath.startsWith('/api/')) {
            try {
                return await handleAPI(req, res, urlPath, method);
            } catch (e) {
                console.error('API Error:', e);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: 'Lỗi server: ' + e.message }));
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

        // Short download redirects
        const cleanPath = urlPath.endsWith('/') && urlPath.length > 1 ? urlPath.slice(0, -1) : urlPath;
        if (cleanPath === '/dl' || cleanPath === '/tai' || cleanPath === '/app') {
            const mobilePath = path.join(__dirname, '..', 'mobile');
            return serveStatic(req, res, mobilePath, '/download.html');
        }

        // Direct Android APK download
        if (urlPath === '/OT-Manager-mobile.apk' || (urlPath.startsWith('/OT-Manager-mobile') && urlPath.endsWith('.apk'))) {
            const mobileDir = path.join(__dirname, '..', 'mobile');
            fs.readdir(mobileDir, (err, files) => {
                if (err) {
                    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
                    return res.end('Lỗi server khi đọc thư mục mobile.');
                }
                
                const requestedFile = path.basename(urlPath);
                let apkFile = null;
                if (files.includes(requestedFile)) {
                    apkFile = requestedFile;
                } else {
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
                        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
                        'Pragma': 'no-cache',
                        'Expires': '0',
                        'Access-Control-Allow-Origin': '*',
                    });
                    res.end(data);
                });
            });
            return;
        }

        // Proxy download route for desktop Setup from Github Release
        if (urlPath === '/download/desktop') {
            const isCheckOnly = req.url.includes('check=true');
            const token = process.env.GITHUB_TOKEN;
            if (!token) {
                if (isCheckOnly) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ ready: false, message: 'Server chưa cấu hình GITHUB_TOKEN để tải bản Desktop.' }));
                }
                res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
                return res.end('Server chưa cấu hình GITHUB_TOKEN để tải bản Desktop.');
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
                                res.writeHead(200, { 'Content-Type': 'application/json' });
                                return res.end(JSON.stringify({ ready: false, version: version }));
                            }
                            console.log(`[Desktop Download] Release ${tag} không tìm thấy (404). Đang lấy Release mới nhất khả dụng...`);
                            return fetchLatestRelease();
                        }
                        if (resGit.statusCode !== 200) {
                            if (isCheckOnly) {
                                res.writeHead(200, { 'Content-Type': 'application/json' });
                                return res.end(JSON.stringify({ ready: false, error: `Lỗi GitHub API: ${resGit.statusCode}` }));
                            }
                            res.writeHead(resGit.statusCode, { 'Content-Type': 'text/plain; charset=utf-8' });
                            return res.end(`Lỗi GitHub API khi lấy thông tin Release: ${resGit.statusCode}. Chi tiết: ${body}`);
                        }

                        try {
                            const releaseInfo = JSON.parse(body);
                            const asset = releaseInfo.assets.find(a => a.name === assetName);
                            if (!asset) {
                                if (isCheckOnly) {
                                    res.writeHead(200, { 'Content-Type': 'application/json' });
                                    return res.end(JSON.stringify({ ready: false, version: version }));
                                }
                                console.log(`[Desktop Download] Không tìm thấy asset ${assetName} trong Release ${tag}. Đang lấy Release mới nhất...`);
                                return fetchLatestRelease();
                            }

                            if (isCheckOnly) {
                                res.writeHead(200, { 'Content-Type': 'application/json' });
                                return res.end(JSON.stringify({ ready: true, version: versionToFetch }));
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

        // Mobile app (served at /mobile/)
        if (urlPath.startsWith('/mobile')) {
            const mobileSubPath = urlPath.replace('/mobile', '') || '/';
            return serveStatic(req, res, path.join(__dirname, '..', 'mobile'), mobileSubPath);
        }

        // Root landing page (served at /)
        const rootPath = path.join(__dirname, '..', 'docs');
        return serveStatic(req, res, rootPath, urlPath);
    } catch (err) {
        console.error('[Server Error] Unhandled exception during request processing:', err);
        try {
            res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Internal Server Error: ' + err.message);
        } catch (e) {}
    }
});

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
            
            // Khởi tạo và nạp database
            (async () => {
                await initPGTable();
                await loadDB();
            })().catch(err => {
                console.error('[Server] Lỗi khởi tạo/nạp Database lúc khởi động:', err.message);
            });
            
            // Khởi chạy đường hầm tunnel
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

            // Tự động gia hạn SSL
            setTimeout(() => {
                checkAndRenewCertificates().catch(err => {
                    console.error('[SSL Auto-Renew] Lỗi chạy tự động gia hạn SSL:', err.message || err);
                });
            }, 5000);

            setInterval(() => {
                checkAndRenewCertificates().catch(err => {
                    console.error('[SSL Auto-Renew] Lỗi chạy chu kỳ gia hạn SSL định kỳ:', err.message || err);
                });
            }, 24 * 60 * 60 * 1000);

            // Chạy background job nhắc nhở
            startDailyReminderJob(loadDB, saveDB);

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

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

function gracefulShutdown(signal) {
    logInfo(`[Server] Nhận tín hiệu ${signal}. Bắt đầu tắt hệ thống an toàn...`);
    stopServer();
    setTimeout(() => {
        logInfo('[Server] Tắt hệ thống hoàn tất. Tạm biệt!');
        process.exit(0);
    }, 1000);
}

if (require.main === module) {
    startServer();
}

module.exports = { startServer, stopServer, getLocalIP, PORT };
