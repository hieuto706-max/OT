const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const config = require('./config');
const { updatesDir } = config;
const { logInfo, logError, hashPassword, verifyPassword, generateId, getCorsOrigin, getSecurityHeaders, signJWT, verifyJWT, authenticateToken, getLocalIP, sendMail } = require('./utils');
const { loadDB, saveDB, getPGPool, initPGTable, fetchGist, getDbPath, fetchUserFromPG, updateUserInCache } = require('./db');
const { VAPID_PUBLIC_KEY, sendPushNotification } = require('./notifications');
const webpush = require('web-push');

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
    if (config.GIST_ID && config.GITHUB_TOKEN) {
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

function getCurrentMonth() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

async function handleAPI(req, res, urlPath, method) {
    const isWrite = ['POST', 'PUT', 'DELETE'].includes(method.toUpperCase());
    const db = await loadDB(isWrite);

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
    // Bỏ qua auth cho: login, forgot-password, request-unlink, version, server-info, cloud-url, gist-status
    const publicEndpoints = [
        '/api/auth/login', 
        '/api/auth/forgot-password', 
        '/api/auth/request-unlink', 
        '/api/version', 
        '/api/server-info', 
        '/api/cloud-url', 
        '/api/gist-status', 
        '/api/apply-hotfix', 
        '/api/trigger-update', 
        '/api/notifications/vapid-public-key',
        '/api/auth/send-email-otp',
        '/api/auth/verify-email-otp'
    ];
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
        if (!username) return sendError(res, 400, 'Thiếu tên đăng nhập!', req);

        // Sync single user from PostgreSQL if configured
        if (config.DATABASE_URL) {
            try {
                const latestUser = await fetchUserFromPG(username);
                if (latestUser) {
                    updateUserInCache(latestUser);
                    const idx = db.users.findIndex(u => u.id === latestUser.id);
                    if (idx >= 0) {
                        db.users[idx] = latestUser;
                    } else {
                        db.users.push(latestUser);
                    }
                }
            } catch (e) {
                logError('[Login Sync] Lỗi đồng bộ user từ PG:', e.message);
            }
        }
        
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
        const requireEmailSetup = user.role === 'admin' && !user.email;
        return sendJSON(res, 200, { user: safeUser, token, requireEmailSetup }, req);
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

    if (urlPath === '/api/auth/send-email-otp' && method === 'POST') {
        const { username, email } = await parseBody(req);
        if (!username) return sendError(res, 400, 'Thiếu tên đăng nhập!', req);

        const user = db.users.find(u => u.username.toLowerCase() === username.toLowerCase());
        if (!user) return sendError(res, 404, 'Không tìm thấy tên đăng nhập trong hệ thống!', req);

        const targetEmail = email ? email.trim() : user.email;
        if (!targetEmail) {
            return sendError(res, 400, 'Tài khoản chưa được liên kết email. Vui lòng liên hệ Kỹ thuật hoặc Admin!', req);
        }

        // Kiểm tra xem email đã được tài khoản khác sử dụng chưa
        const isEmailUsed = db.users.some(u => u.username.toLowerCase() !== username.toLowerCase() && u.email && u.email.toLowerCase() === targetEmail.toLowerCase());
        if (isEmailUsed) {
            return sendError(res, 400, 'Địa chỉ Email này đã được đăng ký cho một tài khoản khác!', req);
        }

        // Sinh mã OTP 6 chữ số
        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        user.otpCode = otpCode;
        user.otpExpiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // hết hạn trong 5 phút
        saveDB(db);

        // Gửi email chứa OTP
        const subject = '[OT Manager] Mã OTP xác thực tài khoản';
        const text = `Mã OTP của bạn là: ${otpCode}. Mã có hiệu lực trong 5 phút. Vui lòng không chia sẻ mã này cho bất kỳ ai.`;
        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 12px; background-color: #ffffff;">
                <h2 style="color: #6366f1; text-align: center;">Xác thực tài khoản OT Manager</h2>
                <p>Xin chào <strong>${user.fullname || user.username}</strong>,</p>
                <p>Chúng tôi nhận được yêu cầu xác thực tài khoản/khôi phục mật khẩu từ bạn. Dưới đây là mã OTP xác thực của bạn:</p>
                <div style="text-align: center; margin: 30px 0;">
                    <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #1e1b4b; background-color: #f3f4f6; padding: 10px 20px; border-radius: 8px; border: 1px dashed #6366f1;">${otpCode}</span>
                </div>
                <p style="color: #ef4444; font-weight: bold;">Mã này có hiệu lực trong vòng 5 phút.</p>
                <p>Nếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua email hoặc liên hệ Admin.</p>
                <hr style="border: 0; border-top: 1px solid #f3f4f6; margin: 20px 0;" />
                <p style="font-size: 12px; color: #6b7280; text-align: center;">Đây là email tự động từ hệ thống OT Manager. Vui lòng không trả lời trực tiếp email này.</p>
            </div>
        `;

        const success = await sendMail(targetEmail, subject, text, html);
        if (!success) {
            return sendError(res, 500, 'Không thể gửi email OTP. Vui lòng kiểm tra lại cấu hình SMTP hoặc liên hệ Admin!', req);
        }

        return sendJSON(res, 200, { success: true, message: 'Mã OTP đã được gửi tới email của bạn!' }, req);
    }

    if (urlPath === '/api/auth/verify-email-otp' && method === 'POST') {
        const { username, email, otpCode } = await parseBody(req);
        if (!username || !email || !otpCode) {
            return sendError(res, 400, 'Thiếu thông tin xác thực!', req);
        }

        const user = db.users.find(u => u.username.toLowerCase() === username.toLowerCase());
        if (!user) return sendError(res, 404, 'Không tìm thấy tên đăng nhập trong hệ thống!', req);

        if (!user.otpCode || !user.otpExpiresAt) {
            return sendError(res, 400, 'Không tìm thấy mã OTP nào được yêu cầu hoặc mã đã hết hạn!', req);
        }

        if (new Date() > new Date(user.otpExpiresAt)) {
            return sendError(res, 400, 'Mã OTP đã hết hạn! Vui lòng yêu cầu mã mới.', req);
        }

        if (otpCode.trim() !== user.otpCode.trim()) {
            return sendError(res, 401, 'Mã OTP không chính xác!', req);
        }

        const isEmailUsed = db.users.some(u => u.username.toLowerCase() !== username.toLowerCase() && u.email && u.email.toLowerCase() === email.trim().toLowerCase());
        if (isEmailUsed) {
            return sendError(res, 400, 'Địa chỉ Email này đã được đăng ký cho một tài khoản khác!', req);
        }

        user.email = email.trim().toLowerCase();
        user.otpCode = null;
        user.otpExpiresAt = null;
        saveDB(db);

        return sendJSON(res, 200, { success: true, message: 'Xác thực và lưu email thành công!' }, req);
    }

    if (urlPath === '/api/auth/forgot-password' && method === 'POST') {
        const { username, otpCode, newPassword } = await parseBody(req);
        if (!username || !otpCode || !newPassword) {
            return sendError(res, 400, 'Thiếu Tên đăng nhập, Mã OTP xác thực hoặc Mật khẩu mới!', req);
        }
        const user = db.users.find(u => u.username.toLowerCase() === username.toLowerCase());
        if (!user) return sendError(res, 404, 'Không tìm thấy tên đăng nhập trong hệ thống!', req);
        
        if (!user.otpCode || !user.otpExpiresAt) {
            return sendError(res, 400, 'Không tìm thấy mã OTP nào được yêu cầu hoặc mã đã hết hạn!', req);
        }

        if (new Date() > new Date(user.otpExpiresAt)) {
            return sendError(res, 400, 'Mã OTP đã hết hạn! Vui lòng yêu cầu mã mới.', req);
        }
        
        if (otpCode.trim() !== user.otpCode.trim()) {
            return sendError(res, 401, 'Mã OTP xác thực không chính xác!', req);
        }
        
        if (newPassword.length < 4) {
            return sendError(res, 400, 'Mật khẩu mới phải có ít nhất 4 ký tự!', req);
        }
        
        user.password = hashPassword(newPassword);
        user.otpCode = null;
        user.otpExpiresAt = null;
        saveDB(db);
        return sendJSON(res, 200, { success: true, message: 'Đổi mật khẩu thành công! Bạn có thể đăng nhập bằng mật khẩu mới.' }, req);
    }

    if (urlPath === '/api/auth/register' && method === 'POST') {
        // Phân quyền: Chỉ Admin/Sub-Admin mới được tạo tài khoản
        if (jwtPayload && reqUserRole !== 'admin') {
            return sendError(res, 403, 'Chỉ quản trị viên mới được tạo tài khoản mới!', req);
        }

        const body = await parseBody(req);
        const { fullname, username, password, role, email } = body;
        if (!fullname || !username) return sendError(res, 400, 'Vui lòng điền đầy đủ thông tin!', req);
        if (username.length < 3) return sendError(res, 400, 'Tên đăng nhập phải có ít nhất 3 ký tự!', req);
        
        // Chỉ Super Admin mới được tạo tài khoản quản lý (admin role)
        if (role === 'admin') {
            const reqUser = db.users.find(u => u.id === reqUserId);
            const reqIsSuperAdmin = reqUser && (reqUser.isSuperAdmin || reqUser.username === 'admin');
            if (!reqIsSuperAdmin) {
                return sendError(res, 403, 'Chỉ Quản trị viên tối cao mới được tạo tài khoản quản lý!', req);
            }
        }

        const isEmployee = role !== 'admin';
        if (!isEmployee && (!password || password.length < 4)) {
            return sendError(res, 400, 'Mật khẩu quản trị viên phải có ít nhất 4 ký tự!', req);
        }

        if (db.users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
            return sendError(res, 409, 'Tên đăng nhập đã tồn tại!', req);
        }

        if (email && email.trim()) {
            const isEmailUsed = db.users.some(u => u.email && u.email.toLowerCase() === email.trim().toLowerCase());
            if (isEmailUsed) {
                return sendError(res, 400, 'Địa chỉ Email này đã được đăng ký cho một tài khoản khác!', req);
            }
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
            email: email ? email.trim() : null,
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
            const reqIsSuperAdmin = reqUser && (reqUser.isSuperAdmin || reqUser.username === 'admin');
            
            // Ẩn Super Admin đối với người dùng thông thường
            if (!reqIsSuperAdmin) {
                filteredUsers = filteredUsers.filter(u => !u.isSuperAdmin && u.username !== 'admin');
            }
            
            if (reqUser && reqUser.role === 'admin' && !reqUser.isSuperAdmin && reqUser.team !== 'admin') {
                const reqUserTeam = reqUser.team || '';
                // Sub-admin: chỉ xem các quản trị viên, nhân viên thuộc team mình, và nhân viên chưa phân team
                filteredUsers = filteredUsers.filter(u => u.role === 'admin' || (reqUserTeam && u.team === reqUserTeam) || !u.team);
            }
        }
        const safeUsers = filteredUsers.map(({ password, ...u }) => u);
        return sendJSON(res, 200, { users: safeUsers });
    }

    if (urlPath.startsWith('/api/users/') && method === 'GET') {
        const userId = urlPath.split('/api/users/')[1];
        const user = db.users.find(u => u.id === userId);
        if (!user) return sendError(res, 404, 'Không tìm thấy người dùng!');
        
        // Chỉ cho phép Super Admin hoặc chính chủ xem thông tin tài khoản Super Admin
        if (user.isSuperAdmin || user.username === 'admin') {
            if (reqUserId !== user.id) {
                return sendError(res, 403, 'Bạn không có quyền truy cập thông tin tài khoản này!');
            }
        }
        
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
        const { fullname, username, password, role, deviceId, browserDeviceId, pendingUnlink, team, email, otpCode } = body;
        const userIdx = db.users.findIndex(u => u.id === userId);
        if (userIdx < 0) return sendError(res, 404, 'Không tìm thấy người dùng!');

        const targetUser = db.users[userIdx];
        const reqUser = reqUserId ? db.users.find(u => u.id === reqUserId) : null;
        const reqIsSuperAdmin = reqUser && (reqUser.isSuperAdmin || reqUser.username === 'admin');

        // Chỉ có bản thân Super Admin mới được sửa tài khoản Super Admin
        if (targetUser.isSuperAdmin && reqUserId !== targetUser.id) {
            return sendError(res, 403, 'Chỉ có Quản trị viên tối cao mới được chỉnh sửa tài khoản này!');
        }

        // Các quản lý không được sửa thông tin của nhau, chỉ có superadmin mới được sửa thông tin quản lý
        if (targetUser.role === 'admin' && targetUser.id !== reqUserId && !reqIsSuperAdmin) {
            return sendError(res, 403, 'Chỉ có Quản trị viên tối cao mới được sửa thông tin của quản lý khác!');
        }

        // Chỉ có superadmin mới có quyền thay đổi vai trò của người khác thành quản lý (admin)
        if (role === 'admin' && targetUser.role !== 'admin' && !reqIsSuperAdmin) {
            return sendError(res, 403, 'Chỉ có Quản trị viên tối cao mới được phân quyền quản lý!');
        }

        // Phân quyền theo Team
        if (reqUserId && reqUser) {
            if (reqUser.role === 'admin' && !reqIsSuperAdmin && reqUser.team !== 'admin') {
                const reqUserTeam = reqUser.team || '';
                if (targetUser.id !== reqUserId && targetUser.team && targetUser.team !== reqUserTeam) {
                    return sendError(res, 403, 'Bạn không có quyền sửa tài khoản của team khác!');
                }
            }
        }

        // Kiểm tra OTP khi thay đổi email hoặc mật khẩu của quản lý (role = admin)
        if (targetUser.role === 'admin') {
            const isEmailChanged = email !== undefined && email !== targetUser.email;
            const isPasswordChanged = password !== undefined && password !== '';
            
            if (isEmailChanged || isPasswordChanged) {
                if (!otpCode) {
                    return sendError(res, 400, 'Thiếu mã OTP xác thực thay đổi!', req);
                }
                if (!targetUser.otpCode || !targetUser.otpExpiresAt) {
                    return sendError(res, 400, 'Yêu cầu xác thực OTP không tồn tại hoặc đã hết hạn!', req);
                }
                if (new Date() > new Date(targetUser.otpExpiresAt)) {
                    return sendError(res, 400, 'Mã OTP xác thực đã hết hạn! Vui lòng yêu cầu mã mới.', req);
                }
                if (otpCode.trim() !== targetUser.otpCode.trim()) {
                    return sendError(res, 400, 'Mã OTP xác thực không chính xác!', req);
                }
                // Xác thực thành công, xóa OTP để không tái sử dụng
                db.users[userIdx].otpCode = null;
                db.users[userIdx].otpExpiresAt = null;
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
        if (password) {
            db.users[userIdx].password = (targetUser.role === 'admin') ? hashPassword(password) : password;
        }
        if (deviceId !== undefined) db.users[userIdx].deviceId = deviceId;
        if (browserDeviceId !== undefined) db.users[userIdx].browserDeviceId = browserDeviceId;
        if (pendingUnlink !== undefined) db.users[userIdx].pendingUnlink = !!pendingUnlink;
        if (email !== undefined) {
            const cleanEmail = email ? email.trim().toLowerCase() : null;
            if (cleanEmail) {
                const isEmailUsed = db.users.some(u => u.id !== userId && u.email && u.email.toLowerCase() === cleanEmail);
                if (isEmailUsed) {
                    return sendError(res, 400, 'Địa chỉ Email này đã được đăng ký cho một tài khoản khác!', req);
                }
            }
            db.users[userIdx].email = cleanEmail;
        }
        
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
            const reqIsSuperAdmin = reqUser && (reqUser.isSuperAdmin || reqUser.username === 'admin');

            // Ẩn records của Super Admin đối với người dùng thông thường
            if (!reqIsSuperAdmin) {
                const superAdminIds = db.users.filter(u => u.isSuperAdmin || u.username === 'admin').map(u => u.id);
                records = records.filter(r => !superAdminIds.includes(r.userId));
            }

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
        return sendJSON(res, 200, { version, buildTime, desktopDownloadUrl, mobileDownloadUrl, databaseType: config.DATABASE_URL ? 'PostgreSQL' : 'Local db.json' });
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

module.exports = { handleAPI };
