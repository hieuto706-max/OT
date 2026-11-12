const { authenticateToken } = require('./utils');
const UserRepository = require('./src/repositories/userRepository');
const { sendError } = require('./src/utils/http');
const { checkLimit } = require('./src/utils/rateLimiter');

// Import Controllers
const AuthController = require('./src/controllers/authController');
const UserController = require('./src/controllers/userController');
const RecordController = require('./src/controllers/recordController');
const TeamController = require('./src/controllers/teamController');
const NotificationController = require('./src/controllers/notificationController');
const SystemController = require('./src/controllers/systemController');

async function handleAPI(req, res, urlPath, method) {
    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
    const jwtPayload = authenticateToken(req);
    const actorId = (jwtPayload && jwtPayload.userId)
        || req.headers['x-user-id']
        || req.headers['x-device-id']
        || '';

    // --- 1. NAT-Friendly Rate Limiting (Tối ưu cho Kho 400+ nhân sự dùng chung 1 Wi-Fi) ---
    // Giới hạn gửi OTP tổng theo IP (kết hợp giới hạn 3 lần/tài khoản trong authController)
    if (urlPath === '/api/auth/send-email-otp' && method === 'POST') {
        if (!checkLimit(ip, 'otp_ip', 15, 10 * 60 * 1000)) {
            return sendError(res, 429, 'Quá nhiều yêu cầu gửi mã OTP từ mạng này. Vui lòng thử lại sau 10 phút!', req);
        }
    }
    // Chống lũ botnet ở cổng đăng nhập theo IP (1.200 lượt / 5 phút), chặn dò mật khẩu sai xử lý riêng theo tài khoản trong authController
    if (urlPath === '/api/auth/login' && method === 'POST') {
        if (!checkLimit(ip, 'login_ip_flood', 1200, 5 * 60 * 1000)) {
            return sendError(res, 429, 'Mạng hiện tại gửi quá nhiều yêu cầu đăng nhập cùng lúc. Vui lòng thử lại sau ít phút!', req);
        }
    }
    // Trần chống DDoS tổng cho cả cục Wi-Fi dùng chung 1 IP Public (5.000 API / phút)
    if (!checkLimit(ip, 'global_ip', 5000, 60 * 1000)) {
        return sendError(res, 429, 'Quá nhiều yêu cầu từ địa chỉ mạng này. Vui lòng thử lại sau!', req);
    }
    // Giới hạn riêng cho từng thiết bị / từng nhân viên (180 API / phút / người)
    if (actorId && !checkLimit(`${ip}:${String(actorId).slice(0, 80)}`, 'actor_api', 180, 60 * 1000)) {
        return sendError(res, 429, 'Thiết bị của bạn thao tác quá nhanh. Vui lòng thử lại sau ít giây!', req);
    }

    // --- 2. Xác thực JWT Token & Phân Quyền ---
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

    // Fallback: Hỗ trợ cơ chế cũ (x-user-id header) cho tài khoản nhân viên (employee)
    let reqUserId = jwtPayload ? jwtPayload.userId : req.headers['x-user-id'];
    let reqDeviceId = jwtPayload ? jwtPayload.deviceId : req.headers['x-device-id'];
    let reqUserRole = jwtPayload ? jwtPayload.role : null;
    let reqUserTeam = jwtPayload ? jwtPayload.team : null;

    if (!isPublicEndpoint && !jwtPayload) {
        if (req.headers['x-user-id']) {
            const tempUser = await UserRepository.findById(req.headers['x-user-id']);
            if (tempUser && tempUser.role === 'employee') {
                // Tương thích ngược: Chỉ cho phép nhân viên dùng header x-user-id
                reqUserId = tempUser.id;
                reqUserRole = tempUser.role;
                reqUserTeam = tempUser.team;
            } else {
                // Admin/Sub-admin bắt buộc phải có chữ ký token JWT hợp lệ
                return sendError(res, 401, 'Yêu cầu xác thực JWT! Vui lòng đăng nhập lại.', req);
            }
        } else {
            return sendError(res, 401, 'Yêu cầu xác thực! Vui lòng đăng nhập lại.', req);
        }
    }

    // Gắn thông tin user vào request để các route sử dụng
    req.user = jwtPayload || null;
    req.userId = reqUserId;
    req.userRole = reqUserRole;
    req.userTeam = reqUserTeam;
    req.deviceId = reqDeviceId;

    // Kiểm tra xem tài khoản có bị xóa khỏi hệ thống hoặc bị hủy liên kết thiết bị không
    if (reqUserId && !urlPath.startsWith('/api/auth/')) {
        const user = await UserRepository.findById(reqUserId);
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
                const users = await UserRepository.getAll();
                const otherOwner = users.find(u => u.role === 'employee' && u.id !== user.id && u.browserDeviceId === reqDeviceId);
                if (!otherOwner) {
                    await UserRepository.update(user.id, { browserDeviceId: reqDeviceId });
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
        const userExists = await UserRepository.existsById(queryUserId);
        if (!userExists) {
            return sendError(res, 401, 'Tài khoản của bạn đã bị xóa khỏi hệ thống!', req);
        }
    }

    // --- ROUTING DELEGATION ---
    if (urlPath.startsWith('/api/auth/')) {
        return AuthController.handle(req, res, urlPath, method);
    }
    if (urlPath === '/api/users' || urlPath.startsWith('/api/users/')) {
        return UserController.handle(req, res, urlPath, method);
    }
    if (urlPath === '/api/records' || urlPath.startsWith('/api/records/')) {
        return RecordController.handle(req, res, urlPath, method);
    }
    if (urlPath === '/api/teams') {
        return TeamController.handle(req, res, urlPath, method);
    }
    if (urlPath.startsWith('/api/notifications/')) {
        return NotificationController.handle(req, res, urlPath, method);
    }

    const systemEndpoints = [
        '/api/dashboard',
        '/api/stats',
        '/api/gist-status',
        '/api/version',
        '/api/server-info',
        '/api/cloud-url',
        '/api/trigger-update',
        '/api/apply-hotfix',
        '/api/settings'
    ];
    if (systemEndpoints.includes(urlPath)) {
        return SystemController.handle(req, res, urlPath, method);
    }

    return sendError(res, 404, 'API not found');
}

module.exports = { handleAPI };
