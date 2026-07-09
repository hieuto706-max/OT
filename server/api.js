const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');
const { logInfo, logError, hashPassword, verifyPassword, generateId, getCorsOrigin, getSecurityHeaders, signJWT, verifyJWT, authenticateToken, getLocalIP } = require('./utils');
const { loadDB, saveDB, getPGPool, initPGTable } = require('./db');
const { VAPID_PUBLIC_KEY, sendPushNotification } = require('./notifications');

const PORT = process.env.PORT || (process.versions.electron ? 0 : 8080);

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

function parseBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => { 
            body += chunk; 
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

function backupGistFile(fileName, data) {
    const https = require('https');
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
            path: `/gists/${config.GIST_ID}`,
            method: 'PATCH',
            headers: {
                'Authorization': `token ${config.GITHUB_TOKEN}`,
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

async function performCleanup(month) {
    const db = await loadDB();
    db.records = db.records.filter(r => {
        const recordMonth = r.createdMonth || r.date.substring(0, 7);
        return recordMonth > month;
    });
    saveDB(db);
    logInfo(`[Cleanup] ÄĂ£ dá»n dáº¹p dá»¯ liá»‡u cá»§a thĂ¡ng ${month} vĂ  cĂ¡c thĂ¡ng cÅ© hÆ¡n.`);
}

function getCurrentMonth() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// ==================== API ROUTES ====================
async function handleAPI(req, res, urlPath, method) {
    const db = await loadDB();

    // --- XÄ‚Â¡c thĂ¡Â»Â±c JWT Token ---
    const jwtPayload = authenticateToken(req);
    // Fallback: HĂ¡Â»â€” trĂ¡Â»Â£ cĂ†Â¡ chĂ¡ÂºÂ¿ cĂ…Â© (x-user-id header) Ă„â€˜Ă¡Â»Æ’ backward compatible trong giai Ă„â€˜oĂ¡ÂºÂ¡n chuyĂ¡Â»Æ’n Ă„â€˜Ă¡Â»â€¢i
    const reqUserId = jwtPayload ? jwtPayload.userId : req.headers['x-user-id'];
    const reqDeviceId = jwtPayload ? jwtPayload.deviceId : req.headers['x-device-id'];
    const reqUserRole = jwtPayload ? jwtPayload.role : null;
    const reqUserTeam = jwtPayload ? jwtPayload.team : null;

    // GĂ¡ÂºÂ¯n thÄ‚Â´ng tin user vÄ‚Â o request Ă„â€˜Ă¡Â»Æ’ cÄ‚Â¡c route sĂ¡Â»Â­ dĂ¡Â»Â¥ng
    req.user = jwtPayload || null;

    // --- PhÄ‚Â¢n quyĂ¡Â»Ân: CÄ‚Â¡c API nhĂ¡ÂºÂ¡y cĂ¡ÂºÂ£m yÄ‚Âªu cĂ¡ÂºÂ§u JWT ---
    // BĂ¡Â»Â qua auth cho: login, version, server-info, cloud-url, gist-status
    const publicEndpoints = ['/api/auth/login', '/api/auth/request-unlink', '/api/version', '/api/server-info', '/api/cloud-url', '/api/gist-status', '/api/apply-hotfix', '/api/trigger-update', '/api/notifications/vapid-public-key'];
    const isPublicEndpoint = publicEndpoints.some(ep => urlPath === ep || urlPath.startsWith(ep + '/'));

    if (!isPublicEndpoint && !jwtPayload && !req.headers['x-user-id']) {
        return sendError(res, 401, 'YÄ‚Âªu cĂ¡ÂºÂ§u xÄ‚Â¡c thĂ¡Â»Â±c! Vui lÄ‚Â²ng Ă„â€˜Ă„Æ’ng nhĂ¡ÂºÂ­p lĂ¡ÂºÂ¡i.', req);
    }

    // KiĂ¡Â»Æ’m tra xem tÄ‚Â i khoĂ¡ÂºÂ£n cÄ‚Â³ bĂ¡Â»â€¹ xÄ‚Â³a khĂ¡Â»Âi hĂ¡Â»â€¡ thĂ¡Â»â€˜ng hoĂ¡ÂºÂ·c bĂ¡Â»â€¹ hĂ¡Â»Â§y liÄ‚Âªn kĂ¡ÂºÂ¿t thiĂ¡ÂºÂ¿t bĂ¡Â»â€¹ khÄ‚Â´ng
    if (reqUserId && !urlPath.startsWith('/api/auth/')) {
        const user = db.users.find(u => u.id === reqUserId);
        if (!user) {
            return sendError(res, 401, 'TÄ‚Â i khoĂ¡ÂºÂ£n cĂ¡Â»Â§a bĂ¡ÂºÂ¡n Ă„â€˜Ä‚Â£ bĂ¡Â»â€¹ xÄ‚Â³a khĂ¡Â»Âi hĂ¡Â»â€¡ thĂ¡Â»â€˜ng!', req);
        }
        if (user.role === 'employee') {
            const matchesNative = user.deviceId && user.deviceId === reqDeviceId;
            let matchesBrowser = user.browserDeviceId && user.browserDeviceId === reqDeviceId;
            
            // TĂ¡Â»Â± Ă„â€˜Ă¡Â»â„¢ng chuyĂ¡Â»Æ’n Ă„â€˜Ă¡Â»â€¢i ID cĂ…Â© sang ID mĂ¡Â»â€ºi (Silent Migration) nĂ¡ÂºÂ¿u thiĂ¡ÂºÂ¿t bĂ¡Â»â€¹ gĂ¡Â»Â­i lÄ‚Âªn ID hĂ¡Â»Â£p lĂ¡Â»â€¡
            const isLegacyBrowserId = user.browserDeviceId && user.browserDeviceId.startsWith('web_') && user.browserDeviceId.length < 25;
            if (isLegacyBrowserId && !matchesNative && !matchesBrowser && reqDeviceId) {
                // KiĂ¡Â»Æ’m tra xem ID mĂ¡Â»â€ºi nÄ‚Â y Ă„â€˜Ä‚Â£ bĂ¡Â»â€¹ liÄ‚Âªn kĂ¡ÂºÂ¿t bĂ¡Â»Å¸i tÄ‚Â i khoĂ¡ÂºÂ£n khÄ‚Â¡c hay chĂ†Â°a
                const otherOwner = db.users.find(u => u.role === 'employee' && u.id !== user.id && u.browserDeviceId === reqDeviceId);
                if (!otherOwner) {
                    user.browserDeviceId = reqDeviceId;
                    saveDB(db);
                    matchesBrowser = true;
                }
            }

            if (!matchesNative && !matchesBrowser) {
                return sendError(res, 403, 'ThiĂ¡ÂºÂ¿t bĂ¡Â»â€¹ hoĂ¡ÂºÂ·c trÄ‚Â¬nh duyĂ¡Â»â€¡t nÄ‚Â y Ă„â€˜Ä‚Â£ bĂ¡Â»â€¹ hĂ¡Â»Â§y liÄ‚Âªn kĂ¡ÂºÂ¿t khĂ¡Â»Âi tÄ‚Â i khoĂ¡ÂºÂ£n!', req);
            }
        }
    }

    // KiĂ¡Â»Æ’m tra xem tÄ‚Â i khoĂ¡ÂºÂ£n cÄ‚Â³ bĂ¡Â»â€¹ xÄ‚Â³a khĂ¡Â»Âi hĂ¡Â»â€¡ thĂ¡Â»â€˜ng khÄ‚Â´ng (fallback qua query parameter)
    const url = new URL(req.url, `http://${req.headers.host}`);
    const queryUserId = url.searchParams.get('userId');
    if (queryUserId && !urlPath.startsWith('/api/auth/')) {
        const userExists = db.users.some(u => u.id === queryUserId);
        if (!userExists) {
            return sendError(res, 401, 'TÄ‚Â i khoĂ¡ÂºÂ£n cĂ¡Â»Â§a bĂ¡ÂºÂ¡n Ă„â€˜Ä‚Â£ bĂ¡Â»â€¹ xÄ‚Â³a khĂ¡Â»Âi hĂ¡Â»â€¡ thĂ¡Â»â€˜ng!', req);
        }
    }

    // --- AUTH ---
    if (urlPath === '/api/auth/login' && method === 'POST') {
        const { username, password, deviceId, isBrowser, clientSource } = await parseBody(req);
        
        // TÄ‚Â¬m user khÄ‚Â´ng phÄ‚Â¢n biĂ¡Â»â€¡t chĂ¡Â»Â¯ hoa chĂ¡Â»Â¯ thĂ†Â°Ă¡Â»Âng
        const user = db.users.find(u => u.username.toLowerCase() === username.toLowerCase());
        if (!user) return sendError(res, 401, 'Sai tÄ‚Âªn Ă„â€˜Ă„Æ’ng nhĂ¡ÂºÂ­p!', req);

        // NĂ¡ÂºÂ¿u lÄ‚Â  nhÄ‚Â¢n viÄ‚Âªn, chĂ¡Â»â€° cho phÄ‚Â©p Ă„â€˜Ă„Æ’ng nhĂ¡ÂºÂ­p qua app APK hoĂ¡ÂºÂ·c app WebClip iOS (truyĂ¡Â»Ân clientSource = 'mobile_app')
        if (user.role === 'employee') {
            if (isBrowser && clientSource !== 'mobile_app') {
                return sendError(res, 403, 'TÄ‚Â i khoĂ¡ÂºÂ£n nhÄ‚Â¢n viÄ‚Âªn khÄ‚Â´ng Ă„â€˜Ă†Â°Ă¡Â»Â£c phÄ‚Â©p Ă„â€˜Ă„Æ’ng nhĂ¡ÂºÂ­p trÄ‚Âªn trÄ‚Â¬nh duyĂ¡Â»â€¡t web thĂ†Â°Ă¡Â»Âng. Vui lÄ‚Â²ng sĂ¡Â»Â­ dĂ¡Â»Â¥ng Ă¡Â»Â©ng dĂ¡Â»Â¥ng di Ă„â€˜Ă¡Â»â„¢ng (APK hoĂ¡ÂºÂ·c iOS WebClip)!', req);
            }
            if (deviceId) {
                const targetDeviceField = isBrowser ? 'browserDeviceId' : 'deviceId';
                const currentBoundId = user[targetDeviceField];
                
                const isLegacyBrowserId = isBrowser && currentBoundId && currentBoundId.startsWith('web_') && currentBoundId.length < 25;
                const hasNoBinding = !currentBoundId || isLegacyBrowserId;

                if (hasNoBinding) {
                    // ChĂ†Â°a liÄ‚Âªn kĂ¡ÂºÂ¿t thiĂ¡ÂºÂ¿t bĂ¡Â»â€¹/trÄ‚Â¬nh duyĂ¡Â»â€¡t
                    const otherOwner = db.users.find(u => u.role === 'employee' && u.id !== user.id && u[targetDeviceField] === deviceId);
                    if (otherOwner) {
                        return sendError(res, 403, isBrowser ? 'TrÄ‚Â¬nh duyĂ¡Â»â€¡t nÄ‚Â y Ă„â€˜Ä‚Â£ Ă„â€˜Ă†Â°Ă¡Â»Â£c liÄ‚Âªn kĂ¡ÂºÂ¿t vĂ¡Â»â€ºi mĂ¡Â»â„¢t tÄ‚Â i khoĂ¡ÂºÂ£n khÄ‚Â¡c!' : 'ThiĂ¡ÂºÂ¿t bĂ¡Â»â€¹ nÄ‚Â y Ă„â€˜Ä‚Â£ Ă„â€˜Ă†Â°Ă¡Â»Â£c liÄ‚Âªn kĂ¡ÂºÂ¿t vĂ¡Â»â€ºi mĂ¡Â»â„¢t tÄ‚Â i khoĂ¡ÂºÂ£n khÄ‚Â¡c!', req);
                    }
                    user[targetDeviceField] = deviceId;
                    saveDB(db);
                } else if (currentBoundId !== deviceId) {
                    // ThiĂ¡ÂºÂ¿t bĂ¡Â»â€¹ khÄ‚Â´ng trÄ‚Â¹ng khĂ¡Â»â€ºp Ă¢ÂÂ¡Ă¯Â¸Â KhÄ‚Â³a vÄ‚Â  yÄ‚Âªu cĂ¡ÂºÂ§u liÄ‚Âªn hĂ¡Â»â€¡ QuĂ¡ÂºÂ£n lÄ‚Â½ Ă„â€˜Ă¡Â»Æ’ hĂ¡Â»Â§y liÄ‚Âªn kĂ¡ÂºÂ¿t
                    const errMsg = isBrowser ? 'TÄ‚Â i khoĂ¡ÂºÂ£n nÄ‚Â y Ă„â€˜Ä‚Â£ Ă„â€˜Ă†Â°Ă¡Â»Â£c liÄ‚Âªn kĂ¡ÂºÂ¿t vĂ¡Â»â€ºi trÄ‚Â¬nh duyĂ¡Â»â€¡t khÄ‚Â¡c. Vui lÄ‚Â²ng liÄ‚Âªn hĂ¡Â»â€¡ QuĂ¡ÂºÂ£n lÄ‚Â½ Ă„â€˜Ă¡Â»Æ’ hĂ¡Â»Â§y liÄ‚Âªn kĂ¡ÂºÂ¿t thiĂ¡ÂºÂ¿t bĂ¡Â»â€¹ cĂ…Â©.' : 'TÄ‚Â i khoĂ¡ÂºÂ£n nÄ‚Â y Ă„â€˜Ä‚Â£ Ă„â€˜Ă†Â°Ă¡Â»Â£c liÄ‚Âªn kĂ¡ÂºÂ¿t vĂ¡Â»â€ºi thiĂ¡ÂºÂ¿t bĂ¡Â»â€¹ khÄ‚Â¡c. Vui lÄ‚Â²ng liÄ‚Âªn hĂ¡Â»â€¡ QuĂ¡ÂºÂ£n lÄ‚Â½ Ă„â€˜Ă¡Â»Æ’ hĂ¡Â»Â§y liÄ‚Âªn kĂ¡ÂºÂ¿t thiĂ¡ÂºÂ¿t bĂ¡Â»â€¹ cĂ…Â©.';
                    return sendJSON(res, 403, { error: errMsg, code: 'device_locked' }, req);
                }
            }
            const { password: _, ...safeUser } = user;
            const token = signJWT({ userId: user.id, role: user.role, team: user.team || '', deviceId: deviceId || '' }, 7 * 24 * 3600);
            return sendJSON(res, 200, { user: safeUser, token }, req);
        }

        // NĂ¡ÂºÂ¿u lÄ‚Â  admin, yÄ‚Âªu cĂ¡ÂºÂ§u mĂ¡ÂºÂ­t khĂ¡ÂºÂ©u
        if (!verifyPassword(password || '', user.password)) {
            return sendError(res, 401, 'Sai mĂ¡ÂºÂ­t khĂ¡ÂºÂ©u!', req);
        }

        const { password: _, ...safeUser } = user;
        const token = signJWT({ userId: user.id, role: user.role, team: user.team || '' }, 24 * 3600);
        return sendJSON(res, 200, { user: safeUser, token }, req);
    }

    if (urlPath === '/api/auth/request-unlink' && method === 'POST') {
        const { username } = await parseBody(req);
        if (!username) return sendError(res, 400, 'ThiĂ¡ÂºÂ¿u tÄ‚Âªn Ă„â€˜Ă„Æ’ng nhĂ¡ÂºÂ­p!', req);
        const user = db.users.find(u => u.username.toLowerCase() === username.toLowerCase());
        if (!user) return sendError(res, 404, 'KhÄ‚Â´ng tÄ‚Â¬m thĂ¡ÂºÂ¥y tÄ‚Âªn Ă„â€˜Ă„Æ’ng nhĂ¡ÂºÂ­p trong hĂ¡Â»â€¡ thĂ¡Â»â€˜ng!', req);
        
        user.pendingUnlink = true;
        saveDB(db);
        return sendJSON(res, 200, { success: true, message: 'Ă„ÂÄ‚Â£ gĂ¡Â»Â­i yÄ‚Âªu cĂ¡ÂºÂ§u huĂ¡Â»Â· liÄ‚Âªn kĂ¡ÂºÂ¿t Ă„â€˜Ă¡ÂºÂ¿n QuĂ¡ÂºÂ£n trĂ¡Â»â€¹ viÄ‚Âªn!' }, req);
    }

    if (urlPath === '/api/auth/register' && method === 'POST') {
        // PhÄ‚Â¢n quyĂ¡Â»Ân: ChĂ¡Â»â€° Admin/Sub-Admin mĂ¡Â»â€ºi Ă„â€˜Ă†Â°Ă¡Â»Â£c tĂ¡ÂºÂ¡o tÄ‚Â i khoĂ¡ÂºÂ£n
        if (jwtPayload && reqUserRole !== 'admin') {
            return sendError(res, 403, 'ChĂ¡Â»â€° quĂ¡ÂºÂ£n trĂ¡Â»â€¹ viÄ‚Âªn mĂ¡Â»â€ºi Ă„â€˜Ă†Â°Ă¡Â»Â£c tĂ¡ÂºÂ¡o tÄ‚Â i khoĂ¡ÂºÂ£n mĂ¡Â»â€ºi!', req);
        }

        const body = await parseBody(req);
        const { fullname, username, password, role } = body;
        if (!fullname || !username) return sendError(res, 400, 'Vui lÄ‚Â²ng Ă„â€˜iĂ¡Â»Ân Ă„â€˜Ă¡ÂºÂ§y Ă„â€˜Ă¡Â»Â§ thÄ‚Â´ng tin!', req);
        if (username.length < 3) return sendError(res, 400, 'TÄ‚Âªn Ă„â€˜Ă„Æ’ng nhĂ¡ÂºÂ­p phĂ¡ÂºÂ£i cÄ‚Â³ Ä‚Â­t nhĂ¡ÂºÂ¥t 3 kÄ‚Â½ tĂ¡Â»Â±!', req);
        
        const isEmployee = role !== 'admin';
        if (!isEmployee && (!password || password.length < 4)) {
            return sendError(res, 400, 'MĂ¡ÂºÂ­t khĂ¡ÂºÂ©u quĂ¡ÂºÂ£n trĂ¡Â»â€¹ viÄ‚Âªn phĂ¡ÂºÂ£i cÄ‚Â³ Ä‚Â­t nhĂ¡ÂºÂ¥t 4 kÄ‚Â½ tĂ¡Â»Â±!', req);
        }

        if (db.users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
            return sendError(res, 409, 'TÄ‚Âªn Ă„â€˜Ă„Æ’ng nhĂ¡ÂºÂ­p Ă„â€˜Ä‚Â£ tĂ¡Â»â€œn tĂ¡ÂºÂ¡i!', req);
        }

        let userTeam = body.team || '';
        if (reqUserId) {
            const reqUser = db.users.find(u => u.id === reqUserId);
            if (reqUser && reqUser.role === 'admin' && !reqUser.isSuperAdmin && reqUser.team !== 'admin') {
                // NĂ¡ÂºÂ¿u lÄ‚Â  sub-admin tĂ¡ÂºÂ¡o, mĂ¡ÂºÂ·c Ă„â€˜Ă¡Â»â€¹nh gÄ‚Â¡n nhÄ‚Â¢n viÄ‚Âªn vÄ‚Â o team cĂ¡Â»Â§a sub-admin nÄ‚Â y
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
                // Sub-admin: chĂ¡Â»â€° xem cÄ‚Â¡c quĂ¡ÂºÂ£n trĂ¡Â»â€¹ viÄ‚Âªn, nhÄ‚Â¢n viÄ‚Âªn thuĂ¡Â»â„¢c team mÄ‚Â¬nh, vÄ‚Â  nhÄ‚Â¢n viÄ‚Âªn chĂ†Â°a phÄ‚Â¢n team
                filteredUsers = db.users.filter(u => u.role === 'admin' || (reqUserTeam && u.team === reqUserTeam) || !u.team);
            }
        }
        const safeUsers = filteredUsers.map(({ password, ...u }) => u);
        return sendJSON(res, 200, { users: safeUsers });
    }

    if (urlPath.startsWith('/api/users/') && method === 'GET') {
        const userId = urlPath.split('/api/users/')[1];
        const user = db.users.find(u => u.id === userId);
        if (!user) return sendError(res, 404, 'KhÄ‚Â´ng tÄ‚Â¬m thĂ¡ÂºÂ¥y ngĂ†Â°Ă¡Â»Âi dÄ‚Â¹ng!');
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
        if (!user) return sendError(res, 404, 'KhÄ‚Â´ng tÄ‚Â¬m thĂ¡ÂºÂ¥y ngĂ†Â°Ă¡Â»Âi dÄ‚Â¹ng!');
        if (user.isSuperAdmin) return sendError(res, 403, 'KhÄ‚Â´ng thĂ¡Â»Æ’ xÄ‚Â³a tÄ‚Â i khoĂ¡ÂºÂ£n QuĂ¡ÂºÂ£n trĂ¡Â»â€¹ viÄ‚Âªn tĂ¡Â»â€˜i cao!');

        // PhÄ‚Â¢n quyĂ¡Â»Ân theo Team
        if (reqUserId) {
            const reqUser = db.users.find(u => u.id === reqUserId);
            if (reqUser && reqUser.role === 'admin' && !reqUser.isSuperAdmin && reqUser.team !== 'admin') {
                const reqUserTeam = reqUser.team || '';
                if (user.team && user.team !== reqUserTeam) {
                    return sendError(res, 403, 'BĂ¡ÂºÂ¡n khÄ‚Â´ng cÄ‚Â³ quyĂ¡Â»Ân xÄ‚Â³a tÄ‚Â i khoĂ¡ÂºÂ£n cĂ¡Â»Â§a team khÄ‚Â¡c!');
                }
            }
        }

        db.users = db.users.filter(u => u.id !== userId);
        db.records = db.records.filter(r => r.userId !== userId);
        saveDB(db);
        return sendJSON(res, 200, { message: 'Ă„ÂÄ‚Â£ xÄ‚Â³a' });
    }

    if (urlPath.startsWith('/api/users/') && method === 'PUT') {
        const userId = urlPath.split('/api/users/')[1];
        const body = await parseBody(req);
        const { fullname, username, password, role, deviceId, browserDeviceId, pendingUnlink, team } = body;
        const userIdx = db.users.findIndex(u => u.id === userId);
        if (userIdx < 0) return sendError(res, 404, 'KhÄ‚Â´ng tÄ‚Â¬m thĂ¡ÂºÂ¥y ngĂ†Â°Ă¡Â»Âi dÄ‚Â¹ng!');

        const targetUser = db.users[userIdx];
        if (targetUser.isSuperAdmin && reqUserId !== targetUser.id) {
            return sendError(res, 403, 'ChĂ¡Â»â€° cÄ‚Â³ QuĂ¡ÂºÂ£n trĂ¡Â»â€¹ viÄ‚Âªn tĂ¡Â»â€˜i cao mĂ¡Â»â€ºi Ă„â€˜Ă†Â°Ă¡Â»Â£c chĂ¡Â»â€°nh sĂ¡Â»Â­a tÄ‚Â i khoĂ¡ÂºÂ£n nÄ‚Â y!');
        }

        // PhÄ‚Â¢n quyĂ¡Â»Ân theo Team
        if (reqUserId) {
            const reqUser = db.users.find(u => u.id === reqUserId);
            if (reqUser && reqUser.role === 'admin' && !reqUser.isSuperAdmin && reqUser.team !== 'admin') {
                const reqUserTeam = reqUser.team || '';
                if (targetUser.id !== reqUserId && targetUser.team && targetUser.team !== reqUserTeam) {
                    return sendError(res, 403, 'BĂ¡ÂºÂ¡n khÄ‚Â´ng cÄ‚Â³ quyĂ¡Â»Ân sĂ¡Â»Â­a tÄ‚Â i khoĂ¡ÂºÂ£n cĂ¡Â»Â§a team khÄ‚Â¡c!');
                }
            }
        }

        if (fullname) db.users[userIdx].fullname = fullname;
        if (username) {
            const lowercaseUsername = username.toLowerCase().trim();
            if (lowercaseUsername.length < 3) {
                return sendError(res, 400, 'TÄ‚Âªn Ă„â€˜Ă„Æ’ng nhĂ¡ÂºÂ­p phĂ¡ÂºÂ£i cÄ‚Â³ Ä‚Â­t nhĂ¡ÂºÂ¥t 3 kÄ‚Â½ tĂ¡Â»Â±!');
            }
            const existing = db.users.find(u => u.id !== userId && u.username.toLowerCase() === lowercaseUsername);
            if (existing) {
                return sendError(res, 409, 'TÄ‚Âªn Ă„â€˜Ă„Æ’ng nhĂ¡ÂºÂ­p Ă„â€˜Ä‚Â£ tĂ¡Â»â€œn tĂ¡ÂºÂ¡i!');
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
                    // Sub-admin chĂ¡Â»â€° Ă„â€˜Ă†Â°Ă¡Â»Â£c gÄ‚Â¡n vĂ¡Â»Â team cĂ¡Â»Â§a mÄ‚Â¬nh hoĂ¡ÂºÂ·c Ă„â€˜Ă¡Â»Æ’ trĂ¡Â»â€˜ng
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
                return sendError(res, 403, 'KhÄ‚Â´ng thĂ¡Â»Æ’ thay Ă„â€˜Ă¡Â»â€¢i vai trÄ‚Â² cĂ¡Â»Â§a QuĂ¡ÂºÂ£n trĂ¡Â»â€¹ viÄ‚Âªn tĂ¡Â»â€˜i cao!');
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

        // LĂ¡Â»Âc records theo team nĂ¡ÂºÂ¿u requester lÄ‚Â  Sub-admin
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
        if (!userId || !date) return sendError(res, 400, 'ThiĂ¡ÂºÂ¿u thÄ‚Â´ng tin!');

        // PhÄ‚Â¢n quyĂ¡Â»Ân: NhÄ‚Â¢n viÄ‚Âªn chĂ¡Â»â€° Ă„â€˜Ă†Â°Ă¡Â»Â£c tĂ¡ÂºÂ¡o bĂ¡ÂºÂ£n ghi cho chÄ‚Â­nh mÄ‚Â¬nh
        if (jwtPayload && reqUserRole === 'employee' && reqUserId !== userId) {
            return sendError(res, 403, 'BĂ¡ÂºÂ¡n chĂ¡Â»â€° Ă„â€˜Ă†Â°Ă¡Â»Â£c ghi nhĂ¡ÂºÂ­n tĂ„Æ’ng ca cho chÄ‚Â­nh mÄ‚Â¬nh!', req);
        }

        const userExists = db.users.some(u => u.id === userId);
        if (!userExists) {
            return sendError(res, 401, 'TÄ‚Â i khoĂ¡ÂºÂ£n cĂ¡Â»Â§a bĂ¡ÂºÂ¡n Ă„â€˜Ä‚Â£ bĂ¡Â»â€¹ xÄ‚Â³a khĂ¡Â»Âi hĂ¡Â»â€¡ thĂ¡Â»â€˜ng!');
        }

        const today = new Date(Date.now() + 7 * 3600000).toISOString().split('T')[0];
        if (date > today) {
            return sendError(res, 400, 'KhÄ‚Â´ng thĂ¡Â»Æ’ Ă„â€˜Ă„Æ’ng kÄ‚Â½ tĂ„Æ’ng ca cho ngÄ‚Â y tĂ†Â°Ă†Â¡ng lai!');
        }

        // Check for existing record on same date
        const existingIdx = db.records.findIndex(r => r.userId === userId && r.date === date);
        const recordMonth = date.substring(0, 7);
        const currentMonth = today.substring(0, 7);
        const isMonthClosed = db.closedMonths && db.closedMonths.includes(recordMonth);
        const isPastMonth = recordMonth < currentMonth;
        const isBackfill = !!body.isBackfill || isMonthClosed || isPastMonth || (note && (note.includes('[BÄ‚â„¢ THÄ‚ÂNG TRĂ†Â¯Ă¡Â»ÂC]') || note.includes('[TĂ„â€NG THÄ‚ÂNG NÄ‚â‚¬Y]')));

        let resolvedRole = reqUserRole;
        if (!resolvedRole && reqUserId) {
            const u = db.users.find(usr => usr.id === reqUserId);
            if (u) resolvedRole = u.role;
        }

        let status = 'approved';
        if (resolvedRole === 'admin') {
            status = body.status || 'approved';
        } else {
            // NhÄ‚Â¢n viÄ‚Âªn: KiĂ¡Â»Æ’m tra luĂ¡ÂºÂ­t tĂ¡Â»Â± Ă„â€˜Ă¡Â»â„¢ng duyĂ¡Â»â€¡t cĂ¡Â»Â§a Team
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
            // TĂ¡Â»Â± Ă„â€˜Ă¡Â»â„¢ng tÄ‚Â¡ch lÄ‚Â m 2 bĂ¡ÂºÂ£n ghi khi Admin tĂ¡ÂºÂ¡o/duyĂ¡Â»â€¡t trĂ¡Â»Â±c tiĂ¡ÂºÂ¿p
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
                return sendError(res, 401, 'TÄ‚Â i khoĂ¡ÂºÂ£n cĂ¡Â»Â§a bĂ¡ÂºÂ¡n Ă„â€˜Ä‚Â£ bĂ¡Â»â€¹ xÄ‚Â³a khĂ¡Â»Âi hĂ¡Â»â€¡ thĂ¡Â»â€˜ng!');
            }

            const recordMonth = record.date.substring(0, 7);
            const isClosed = db.closedMonths && db.closedMonths.includes(recordMonth);

            let resolvedRole = reqUserRole;
            if (!resolvedRole && reqUserId) {
                const u = db.users.find(usr => usr.id === reqUserId);
                if (u) resolvedRole = u.role;
            }

            if (isClosed && resolvedRole !== 'admin') {
                return sendError(res, 403, 'ThÄ‚Â¡ng nÄ‚Â y Ă„â€˜Ä‚Â£ chĂ¡Â»â€˜t OT, bĂ¡ÂºÂ¡n khÄ‚Â´ng thĂ¡Â»Æ’ xÄ‚Â³a bĂ¡ÂºÂ£n ghi!', req);
            }

            // PhÄ‚Â¢n quyĂ¡Â»Ân: NhÄ‚Â¢n viÄ‚Âªn chĂ¡Â»â€° Ă„â€˜Ă†Â°Ă¡Â»Â£c xÄ‚Â³a bĂ¡ÂºÂ£n ghi cĂ¡Â»Â§a chÄ‚Â­nh mÄ‚Â¬nh
            if (jwtPayload && reqUserRole === 'employee' && record.userId !== reqUserId) {
                return sendError(res, 403, 'BĂ¡ÂºÂ¡n chĂ¡Â»â€° Ă„â€˜Ă†Â°Ă¡Â»Â£c xÄ‚Â³a bĂ¡ÂºÂ£n ghi cĂ¡Â»Â§a chÄ‚Â­nh mÄ‚Â¬nh!', req);
            }
        }
        db.records = db.records.filter(r => r.id !== recordId);
        saveDB(db);
        return sendJSON(res, 200, { message: 'Ă„ÂÄ‚Â£ xÄ‚Â³a' });
    }

    if (urlPath.startsWith('/api/records/') && method === 'PUT') {
        const recordId = urlPath.split('/api/records/')[1];
        const body = await parseBody(req);
        const { date, hasLunchOT, otStart, otEnd, eveningOTHours, totalHours, note, deliveryProvince, customActivity, calcMode } = body;
        const idx = db.records.findIndex(r => r.id === recordId);
        if (idx < 0) return sendError(res, 404, 'KhÄ‚Â´ng tÄ‚Â¬m thĂ¡ÂºÂ¥y bĂ¡ÂºÂ£n ghi!');

        let resolvedRole = reqUserRole;
        if (!resolvedRole && reqUserId) {
            const u = db.users.find(usr => usr.id === reqUserId);
            if (u) resolvedRole = u.role;
        }

        // Check if month is closed
        const recordMonth = db.records[idx].date.substring(0, 7);
        const isClosed = db.closedMonths && db.closedMonths.includes(recordMonth);
        if (isClosed && resolvedRole !== 'admin') {
            return sendError(res, 403, 'ThÄ‚Â¡ng nÄ‚Â y Ă„â€˜Ä‚Â£ chĂ¡Â»â€˜t OT, bĂ¡ÂºÂ¡n khÄ‚Â´ng thĂ¡Â»Æ’ chĂ¡Â»â€°nh sĂ¡Â»Â­a bĂ¡ÂºÂ£n ghi!', req);
        }

        // PhÄ‚Â¢n quyĂ¡Â»Ân: NhÄ‚Â¢n viÄ‚Âªn chĂ¡Â»â€° Ă„â€˜Ă†Â°Ă¡Â»Â£c sĂ¡Â»Â­a bĂ¡ÂºÂ£n ghi cĂ¡Â»Â§a chÄ‚Â­nh mÄ‚Â¬nh
        if (jwtPayload && reqUserRole === 'employee' && db.records[idx].userId !== reqUserId) {
            return sendError(res, 403, 'BĂ¡ÂºÂ¡n chĂ¡Â»â€° Ă„â€˜Ă†Â°Ă¡Â»Â£c sĂ¡Â»Â­a bĂ¡ÂºÂ£n ghi cĂ¡Â»Â§a chÄ‚Â­nh mÄ‚Â¬nh!', req);
        }

        const userExists = db.users.some(u => u.id === db.records[idx].userId);
        if (!userExists) {
            return sendError(res, 401, 'TÄ‚Â i khoĂ¡ÂºÂ£n cĂ¡Â»Â§a bĂ¡ÂºÂ¡n Ă„â€˜Ä‚Â£ bĂ¡Â»â€¹ xÄ‚Â³a khĂ¡Â»Âi hĂ¡Â»â€¡ thĂ¡Â»â€˜ng!');
        }

        const today = new Date(Date.now() + 7 * 3600000).toISOString().split('T')[0];
        if (date && date > today) {
            return sendError(res, 400, 'KhÄ‚Â´ng thĂ¡Â»Æ’ Ă„â€˜Ă„Æ’ng kÄ‚Â½ tĂ„Æ’ng ca cho ngÄ‚Â y tĂ†Â°Ă†Â¡ng lai!');
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
        const isBackfill = !!body.isBackfill || isMonthClosed || isPastMonth || (currentNote && (currentNote.includes('[BÄ‚â„¢ THÄ‚ÂNG TRĂ†Â¯Ă¡Â»ÂC]') || currentNote.includes('[TĂ„â€NG THÄ‚ÂNG NÄ‚â‚¬Y]')));

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
            // NhÄ‚Â¢n viÄ‚Âªn sĂ¡Â»Â­a bĂ¡ÂºÂ£n ghi: tÄ‚Â­nh toÄ‚Â¡n status tĂ¡Â»Â± Ă„â€˜Ă¡Â»â„¢ng dĂ¡Â»Â±a trÄ‚Âªn luĂ¡ÂºÂ­t tĂ¡Â»Â± duyĂ¡Â»â€¡t cĂ¡Â»Â§a Team
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
                // TÄ‚Â¡ch tĂ¡Â»Â± Ă„â€˜Ă¡Â»â„¢ng bĂ¡ÂºÂ£n ghi kĂ¡ÂºÂ¿t hĂ¡Â»Â£p thÄ‚Â nh 2 bĂ¡ÂºÂ£n ghi Ă„â€˜Ă¡Â»â„¢c lĂ¡ÂºÂ­p
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
                // Sub-admin: chĂ¡Â»â€° thĂ¡Â»â€˜ng kÄ‚Âª nhÄ‚Â¢n viÄ‚Âªn thuĂ¡Â»â„¢c team cĂ¡Â»Â§a mÄ‚Â¬nh
                employees = db.users.filter(u => u.role === 'employee' && u.team === adminTeam);
                // ThĂ¡Â»â€˜ng kÄ‚Âª bao gĂ¡Â»â€œm cĂ¡ÂºÂ£ chÄ‚Â­nh mÄ‚Â¬nh (admin) vÄ‚Â  nhÄ‚Â¢n viÄ‚Âªn trong team
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
        // PhÄ‚Â¢n quyĂ¡Â»Ân: Admin vÄ‚Â  Sub-Admin Ă„â€˜Ă¡Â»Âu Ă„â€˜Ă†Â°Ă¡Â»Â£c cĂ¡ÂºÂ¥u hÄ‚Â¬nh team
        if (reqUserId) {
            const user = db.users.find(u => u.id === reqUserId);
            if (!user || user.role !== 'admin') {
                return sendError(res, 403, 'BĂ¡ÂºÂ¡n khÄ‚Â´ng cÄ‚Â³ quyĂ¡Â»Ân thiĂ¡ÂºÂ¿t lĂ¡ÂºÂ­p team!', req);
            }
        }
        const body = await parseBody(req);
        const { teams, oldName, newName, deletedTeam } = body;
        if (!teams || !Array.isArray(teams)) {
            return sendError(res, 400, 'Danh sÄ‚Â¡ch team khÄ‚Â´ng hĂ¡Â»Â£p lĂ¡Â»â€¡!');
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

        // Ă„ÂĂ¡Â»â€œng bĂ¡Â»â„¢ gÄ‚Â¡n tÄ‚Âªn team tĂ†Â°Ă†Â¡ng Ă¡Â»Â©ng cho cÄ‚Â¡c Leader vÄ‚Â  xoÄ‚Â¡ team cho cÄ‚Â¡c cĂ¡Â»Â±u Leader
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
                message: 'ChĂ¡ÂºÂ¡y chĂ¡ÂºÂ¿ Ă„â€˜Ă¡Â»â„¢ local (dĂ¡Â»Â¯ liĂ¡Â»â€¡u lĂ†Â°u cĂ¡Â»Â¥c bĂ¡Â»â„¢ an toÄ‚Â n).'
            });
        }

        if (!hasCredentials) {
            return sendJSON(res, 200, {
                status: 'error',
                message: 'ChĂ†Â°a cĂ¡ÂºÂ¥u hÄ‚Â¬nh GIST_ID hoĂ¡ÂºÂ·c GITHUB_TOKEN trÄ‚Âªn Render.'
            });
        }

        try {
            await fetchGist();
            return sendJSON(res, 200, {
                status: 'success',
                message: 'KĂ¡ÂºÂ¿t nĂ¡Â»â€˜i GitHub Gist thÄ‚Â nh cÄ‚Â´ng!'
            });
        } catch (e) {
            return sendJSON(res, 200, {
                status: 'error',
                message: `LĂ¡Â»â€”i kĂ¡ÂºÂ¿t nĂ¡Â»â€˜i Gist: ${e.message}`
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
            console.error('[Version API] LĂ¡Â»â€”i Ă„â€˜Ă¡Â»Âc phiÄ‚Âªn bĂ¡ÂºÂ£n:', e.message);
        }

        let buildTime = 0;
        try {
            // Ă†Â¯u tiÄ‚Âªn Ă„â€˜Ă¡Â»Âc buildTime tĂ¡Â»Â« thĂ†Â° mĂ¡Â»Â¥c hotfixes trĂ†Â°Ă¡Â»â€ºc
            let buildPath = updatesDir ? path.join(updatesDir, 'build.json') : null;
            if (!buildPath || !fs.existsSync(buildPath)) {
                buildPath = path.join(__dirname, 'build.json');
            }
            if (fs.existsSync(buildPath)) {
                const buildInfo = JSON.parse(fs.readFileSync(buildPath, 'utf-8'));
                buildTime = buildInfo.buildTime || 0;
            }
        } catch (e) {
            // Fallback: SĂ¡Â»Â­ dĂ¡Â»Â¥ng mtime cĂ¡Â»Â§a server.js nĂ¡ÂºÂ¿u khÄ‚Â´ng cÄ‚Â³ build.json
            try {
                const serverPath = path.join(__dirname, 'server.js');
                if (fs.existsSync(serverPath)) {
                    buildTime = fs.statSync(serverPath).mtime.getTime();
                }
            } catch (fsErr) {}
        }

        // LuÄ‚Â´n tĂ¡Â»Â± sinh URL tĂ¡ÂºÂ£i tĂ¡Â»Â« phiÄ‚Âªn bĂ¡ÂºÂ£n hiĂ¡Â»â€¡n tĂ¡ÂºÂ¡i (khÄ‚Â´ng Ă„â€˜Ă¡Â»Âc tĂ¡Â»Â« config.json Ă„â€˜Ă¡Â»Æ’ trÄ‚Â¡nh lĂ¡Â»â€”i hardcode phiÄ‚Âªn bĂ¡ÂºÂ£n cĂ…Â©)
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
            
            // LĂ¡ÂºÂ¥y user Ă„â€˜Ă„Æ’ng nhĂ¡ÂºÂ­p hiĂ¡Â»â€¡n tĂ¡ÂºÂ¡i
            const user = db.users.find(u => u.id === reqUserId);
            if (!user) {
                return sendError(res, 404, 'KhÄ‚Â´ng tÄ‚Â¬m thĂ¡ÂºÂ¥y ngĂ†Â°Ă¡Â»Âi dÄ‚Â¹ng.', req);
            }
            
            let updated = false;

            // 1. XĂ¡Â»Â­ lÄ‚Â½ Web Push cĂ…Â©
            if (subscription && subscription.endpoint) {
                if (!user.pushSubscriptions) {
                    user.pushSubscriptions = [];
                }
                const exists = user.pushSubscriptions.some(sub => sub.endpoint === subscription.endpoint);
                if (!exists) {
                    user.pushSubscriptions.push(subscription);
                    updated = true;
                    logInfo(`[Web Push] Ă„ÂĂ„Æ’ng kÄ‚Â½ thÄ‚Â´ng bÄ‚Â¡o mĂ¡Â»â€ºi thÄ‚Â nh cÄ‚Â´ng cho nhÄ‚Â¢n viÄ‚Âªn ${user.username}`);
                }
            }

            // 2. XĂ¡Â»Â­ lÄ‚Â½ Firebase FCM mĂ¡Â»â€ºi
            if (fcmToken) {
                if (!user.fcmTokens) {
                    user.fcmTokens = [];
                }
                if (!user.fcmTokens.includes(fcmToken)) {
                    user.fcmTokens.push(fcmToken);
                    updated = true;
                    logInfo(`[FCM] Ă„ÂĂ„Æ’ng kÄ‚Â½ token mĂ¡Â»â€ºi thÄ‚Â nh cÄ‚Â´ng cho nhÄ‚Â¢n viÄ‚Âªn ${user.username}`);
                }
            }
            
            if (updated) {
                saveDB(db);
            }
            
            return sendJSON(res, 200, { success: true }, req);
        } catch (e) {
            logError('[Notifications Subscribe] LĂ¡Â»â€”i:', e.message);
            return sendError(res, 500, 'LĂ¡Â»â€”i lĂ†Â°u thÄ‚Â´ng tin Ă„â€˜Ă„Æ’ng kÄ‚Â½ thÄ‚Â´ng bÄ‚Â¡o.', req);
        }
    }

    // --- TEST PUSH NOTIFICATION ---
    if (urlPath === '/api/notifications/test' && method === 'POST') {
        try {
            const user = db.users.find(u => u.id === reqUserId);
            if (!user) {
                return sendError(res, 404, 'KhÄ‚Â´ng tÄ‚Â¬m thĂ¡ÂºÂ¥y ngĂ†Â°Ă¡Â»Âi dÄ‚Â¹ng.', req);
            }
            
            const hasWebPush = user.pushSubscriptions && user.pushSubscriptions.length > 0;
            const hasFCM = user.fcmTokens && user.fcmTokens.length > 0;

            if (!hasWebPush && !hasFCM) {
                return sendError(res, 400, 'ThiĂ¡ÂºÂ¿t bĂ¡Â»â€¹ chĂ†Â°a Ă„â€˜Ă†Â°Ă¡Â»Â£c cĂ¡ÂºÂ¥p quyĂ¡Â»Ân nhĂ¡ÂºÂ­n thÄ‚Â´ng bÄ‚Â¡o (ThiĂ¡ÂºÂ¿u Web Push vÄ‚Â  FCM tokens).', req);
            }
            
            const title = 'KiĂ¡Â»Æ’m tra thÄ‚Â´ng bÄ‚Â¡o Ä‘Å¸â€â€';
            const bodyText = 'ThÄ‚Â´ng bÄ‚Â¡o Ă„â€˜Ă¡ÂºÂ©y tĂ¡Â»Â« hĂ¡Â»â€¡ thĂ¡Â»â€˜ng OT Manager Ă„â€˜Ä‚Â£ hoĂ¡ÂºÂ¡t Ă„â€˜Ă¡Â»â„¢ng thÄ‚Â nh cÄ‚Â´ng!';
            const payload = JSON.stringify({
                title: title,
                body: bodyText,
                data: { url: '/mobile/' },
                actions: [
                    { action: 'log', title: 'Ghi nhĂ¡ÂºÂ­n ngay' },
                    { action: 'skip', title: 'BĂ¡Â»Â qua' }
                ]
            });
            
            let successCount = 0;

            // 1. GĂ¡Â»Â­i qua Firebase FCM
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
                            logInfo(`[FCM Test] XÄ‚Â³a token khÄ‚Â´ng hĂ¡Â»Â£p lĂ¡Â»â€¡ cĂ¡Â»Â§a ${user.username}`);
                        } else {
                            logError(`[FCM Test] LĂ¡Â»â€”i gĂ¡Â»Â­i token cho ${user.username}:`, err.message);
                            activeFcmTokens.push(token);
                        }
                    }
                }
            }

            // 2. GĂ¡Â»Â­i qua Web Push (DĂ¡Â»Â± phÄ‚Â²ng / Fallback)
            const activeSubscriptions = [];
            if (hasWebPush) {
                for (const sub of user.pushSubscriptions) {
                    try {
                        await webpush.sendNotification(sub, payload);
                        successCount++;
                        activeSubscriptions.push(sub);
                    } catch (err) {
                        if (err.statusCode === 410 || err.statusCode === 404) {
                            logInfo(`[Web Push Test] XÄ‚Â³a subscription hĂ¡ÂºÂ¿t hĂ¡ÂºÂ¡n cĂ¡Â»Â§a nhÄ‚Â¢n viÄ‚Âªn ${user.username}`);
                        } else {
                            logError(`[Web Push Test] LĂ¡Â»â€”i gĂ¡Â»Â­i thÄ‚Â´ng bÄ‚Â¡o cho ${user.username}:`, err.message);
                            activeSubscriptions.push(sub);
                        }
                    }
                }
            }
            
            // CĂ¡ÂºÂ­p nhĂ¡ÂºÂ­t lĂ¡ÂºÂ¡i cÄ‚Â¡c token sĂ¡ÂºÂ¡ch nĂ¡ÂºÂ¿u cÄ‚Â³ xÄ‚Â³a
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
            logError('[Notifications Test] LĂ¡Â»â€”i:', e.message);
            return sendError(res, 500, 'LĂ¡Â»â€”i kiĂ¡Â»Æ’m tra gĂ¡Â»Â­i thÄ‚Â´ng bÄ‚Â¡o Ă„â€˜Ă¡ÂºÂ©y.', req);
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
            console.error('[Cloud URL API] LĂ¡Â»â€”i:', e.message);
        }
        // Fallback: TrÄ‚Âªn Render, dÄ‚Â¹ng RENDER_EXTERNAL_URL nĂ¡ÂºÂ¿u config.json khÄ‚Â´ng cÄ‚Â³ serverUrl
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
                        return sendJSON(res, 400, { success: false, message: 'ThiĂ¡ÂºÂ¿u downloadUrl hoĂ¡ÂºÂ·c version trong request body' });
                    }
                    try {
                        global.startElectronUpdate(downloadUrl, version);
                    } catch (updateErr) {
                        console.error('[Server Update] LĂ¡Â»â€”i khi chĂ¡ÂºÂ¡y startElectronUpdate:', updateErr);
                        return sendJSON(res, 500, { success: false, message: `LĂ¡Â»â€”i kÄ‚Â­ch hoĂ¡ÂºÂ¡t tiĂ¡ÂºÂ¿n trÄ‚Â¬nh tĂ¡ÂºÂ£i: ${updateErr.message}` });
                    }
                    return sendJSON(res, 200, { success: true });
                } catch (e) {
                    console.error('[Server Update] LĂ¡Â»â€”i parse JSON:', e);
                    return sendJSON(res, 400, { success: false, message: `LĂ¡Â»â€”i parse JSON: ${e.message}` });
                }
            });
            return;
        } else {
            console.error('[Server Update] Electron update handler chĂ†Â°a Ă„â€˜Ă†Â°Ă¡Â»Â£c Ă„â€˜Ă„Æ’ng kÄ‚Â½ trÄ‚Âªn Main process');
            return sendJSON(res, 500, { success: false, message: 'Electron update handler chĂ†Â°a Ă„â€˜Ă†Â°Ă¡Â»Â£c Ă„â€˜Ă„Æ’ng kÄ‚Â½ trÄ‚Âªn Main process' });
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
            title: 'ThÄ‚Â´ng bÄ‚Â¡o chĂ¡Â»â€˜t cÄ‚Â´ng Ä‘Å¸â€â€™',
            body: `ThÄ‚Â¡ng ${displayMonth} Ă„â€˜Ä‚Â£ Ă„â€˜Ă†Â°Ă¡Â»Â£c chĂ¡Â»â€˜t cÄ‚Â´ng vÄ‚Â  khÄ‚Â³a ghi nhĂ¡ÂºÂ­n tĂ„Æ’ng ca.`,
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
                            console.log(`[Web Push Close Month] XÄ‚Â³a subscription hĂ¡ÂºÂ¿t hĂ¡ÂºÂ¡n cĂ¡Â»Â§a nhÄ‚Â¢n viÄ‚Âªn ${emp.username}`);
                        } else {
                            console.error(`[Web Push Close Month] LĂ¡Â»â€”i gĂ¡Â»Â­i thÄ‚Â´ng bÄ‚Â¡o cho ${emp.username}:`, err.message);
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
        console.log(`[Web Push Close Month] Ă„ÂÄ‚Â£ gĂ¡Â»Â­i thÄ‚Â´ng bÄ‚Â¡o chĂ¡Â»â€˜t cÄ‚Â´ng thÄ‚Â¡ng ${month} cho nhÄ‚Â¢n viÄ‚Âªn.`);
    } catch (e) {
        console.error('[Web Push Close Month] LĂ¡Â»â€”i gĂ¡Â»Â­i thÄ‚Â´ng bÄ‚Â¡o:', e.message);
    }
}

    if (urlPath === '/api/records/close-month' && method === 'POST') {
        if (reqUserId) {
            const user = db.users.find(u => u.id === reqUserId);
            if (!user || user.role !== 'admin') {
                return sendError(res, 403, 'BĂ¡ÂºÂ¡n khÄ‚Â´ng cÄ‚Â³ quyĂ¡Â»Ân chĂ¡Â»â€˜t OT!', req);
            }
        }
        const body = await parseBody(req);
        const { month } = body;
        if (!month || !month.match(/^\d{4}-\d{2}$/)) {
            return sendError(res, 400, 'ThÄ‚Â¡ng khÄ‚Â´ng hĂ¡Â»Â£p lĂ¡Â»â€¡ (Ă„â€˜Ă¡Â»â€¹nh dĂ¡ÂºÂ¡ng Ă„â€˜Ä‚Âºng: YYYY-MM)!');
        }
        if (!db.closedMonths) {
            db.closedMonths = [];
        }
        if (!db.closedMonths.includes(month)) {
            db.closedMonths.push(month);
            saveDB(db);
            // GĂ¡Â»Â­i thÄ‚Â´ng bÄ‚Â¡o Ă„â€˜Ă¡ÂºÂ©y cho tĂ¡ÂºÂ¥t cĂ¡ÂºÂ£ nhÄ‚Â¢n viÄ‚Âªn
            notifyEmployeesMonthClosed(month);
        }
        return sendJSON(res, 200, { success: true, closedMonths: db.closedMonths });
    }

    // --- APPLY HOTFIX ONLINE ---
    if (urlPath === '/api/apply-hotfix' && method === 'POST') {
        if (!updatesDir) {
            return sendJSON(res, 500, { success: false, message: 'Ă¡Â»Â¨ng dĂ¡Â»Â¥ng khÄ‚Â´ng chĂ¡ÂºÂ¡y trong mÄ‚Â´i trĂ†Â°Ă¡Â»Âng Electron' });
        }
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const data = JSON.parse(body || '{}');
                const cloudUrl = data.cloudUrl;
                const buildTime = data.buildTime;
                if (!cloudUrl) {
                    return sendJSON(res, 400, { success: false, message: 'ThiĂ¡ÂºÂ¿u cloudUrl' });
                }
                
                // Ă„ÂĂ¡ÂºÂ£m bĂ¡ÂºÂ£o thĂ†Â° mĂ¡Â»Â¥c hotfixes tĂ¡Â»â€œn tĂ¡ÂºÂ¡i
                if (!fs.existsSync(updatesDir)) {
                    fs.mkdirSync(updatesDir, { recursive: true });
                }

                // TĂ¡ÂºÂ£i cÄ‚Â¡c tĂ¡Â»â€¡p tĂ¡Â»Â« cloud server
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
                                return reject(new Error(`TĂ¡ÂºÂ£i file ${file} thĂ¡ÂºÂ¥t bĂ¡ÂºÂ¡i: HTTP ${response.statusCode}`));
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

                // Ghi lĂ¡ÂºÂ¡i tĂ¡Â»â€¡p build.json mĂ¡Â»â€ºi vÄ‚Â o thĂ†Â° mĂ¡Â»Â¥c hotfixes
                fs.writeFileSync(
                    path.join(updatesDir, 'build.json'),
                    JSON.stringify({ buildTime: buildTime || Date.now() }, null, 2),
                    'utf8'
                );

                console.log(`[Hotfix] Ă„ÂÄ‚Â£ Ä‚Â¡p dĂ¡Â»Â¥ng thÄ‚Â nh cÄ‚Â´ng bĂ¡ÂºÂ£n vÄ‚Â¡ mĂ¡Â»â€ºi tĂ¡ÂºÂ¡i timestamp: ${buildTime}`);
                return sendJSON(res, 200, { success: true });
            } catch (err) {
                console.error('[Hotfix] LĂ¡Â»â€”i khi Ä‚Â¡p dĂ¡Â»Â¥ng bĂ¡ÂºÂ£n vÄ‚Â¡:', err.message);
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
            return sendError(res, 400, 'ThÄ‚Â¡ng khÄ‚Â´ng hĂ¡Â»Â£p lĂ¡Â»â€¡ (Ă„â€˜Ă¡Â»â€¹nh dĂ¡ÂºÂ¡ng Ă„â€˜Ä‚Âºng: YYYY-MM)!');
        }
        try {
            await performCleanup(month);
            return sendJSON(res, 200, { success: true, message: `Ă„ÂÄ‚Â£ dĂ¡Â»Ân dĂ¡ÂºÂ¹p dĂ¡Â»Â¯ liĂ¡Â»â€¡u thÄ‚Â¡ng ${month} thÄ‚Â nh cÄ‚Â´ng!` });
        } catch (err) {
            return sendError(res, 500, `LĂ¡Â»â€”i dĂ¡Â»Ân dĂ¡ÂºÂ¹p: ${err.message}`);
        }
    }

    return sendError(res, 404, 'API not found');
}

module.exports = { handleAPI };

