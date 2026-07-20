const { authenticateToken } = require('./utils');
const UserRepository = require('./src/repositories/userRepository');
const { sendError } = require('./src/utils/http');

// Import Controllers
const AuthController = require('./src/controllers/authController');
const UserController = require('./src/controllers/userController');
const RecordController = require('./src/controllers/recordController');
const TeamController = require('./src/controllers/teamController');
const NotificationController = require('./src/controllers/notificationController');
const SystemController = require('./src/controllers/systemController');

async function handleAPI(req, res, urlPath, method) {
    // --- Xác thực JWT Token ---
    const jwtPayload = authenticateToken(req);
    // Fallback: Hỗ trợ cơ chế cũ (x-user-id header) để backward compatible trong giai đoạn chuyển đổi
    const reqUserId = jwtPayload ? jwtPayload.userId : req.headers['x-user-id'];
    const reqDeviceId = jwtPayload ? jwtPayload.deviceId : req.headers['x-device-id'];
    const reqUserRole = jwtPayload ? jwtPayload.role : null;
    const reqUserTeam = jwtPayload ? jwtPayload.team : null;

    // Gắn thông tin user vào request để các route sử dụng
    req.user = jwtPayload || null;
    req.userId = reqUserId;
    req.userRole = reqUserRole;
    req.userTeam = reqUserTeam;
    req.deviceId = reqDeviceId;

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
        '/api/apply-hotfix'
    ];
    if (systemEndpoints.includes(urlPath)) {
        return SystemController.handle(req, res, urlPath, method);
    }

    return sendError(res, 404, 'API not found');
}

module.exports = { handleAPI };
