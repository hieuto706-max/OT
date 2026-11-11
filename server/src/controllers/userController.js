const UserRepository = require('../repositories/userRepository');
const TeamRepository = require('../repositories/teamRepository');
const { hashPassword } = require('../../utils');
const { sendJSON, sendError, parseBody } = require('../utils/http');

function stripSensitiveUserFields(user) {
    if (!user) return user;
    const { password, otpCode, otpExpiresAt, pushSubscriptions, fcmTokens, ...safeUser } = user;
    return safeUser;
}

const UserController = {
    async handle(req, res, urlPath, method) {
        if (urlPath === '/api/users' && method === 'GET') {
            return this.getAll(req, res);
        }
        if (urlPath.startsWith('/api/users/') && method === 'GET') {
            return this.getById(req, res, urlPath);
        }
        if (urlPath.startsWith('/api/users/') && method === 'DELETE') {
            return this.delete(req, res, urlPath);
        }
        if (urlPath.startsWith('/api/users/') && method === 'PUT') {
            return this.update(req, res, urlPath);
        }

        return sendError(res, 404, 'Endpoint không tồn tại', req);
    },

    async getAll(req, res) {
        const { userId: reqUserId } = req;
        const users = await UserRepository.getAll();
        const reqUser = reqUserId ? users.find(u => u.id === reqUserId) : null;
        if (!reqUser) {
            return sendError(res, 401, 'Yêu cầu xác thực!', req);
        }

        // Nhân viên chỉ được phép lấy thông tin của chính mình (phục vụ lưu cache ngoại tuyến)
        if (reqUser.role !== 'admin') {
            return sendJSON(res, 200, { users: [stripSensitiveUserFields(reqUser)] }, req);
        }

        let filteredUsers = users;
        const reqIsSuperAdmin = reqUser.isSuperAdmin || reqUser.username === 'admin';
        
        // Ẩn Super Admin đối với Sub-admin
        if (!reqIsSuperAdmin) {
            filteredUsers = filteredUsers.filter(u => !u.isSuperAdmin && u.username !== 'admin');
        }
        
        if (!reqIsSuperAdmin && reqUser.team !== 'admin') {
            const reqUserTeam = reqUser.team || '';
            // Sub-admin: chỉ xem các quản trị viên, nhân viên thuộc team mình, và nhân viên chưa phân team
            filteredUsers = filteredUsers.filter(u => u.role === 'admin' || (reqUserTeam && u.team === reqUserTeam) || !u.team);
        }

        const safeUsers = filteredUsers.map(stripSensitiveUserFields);
        return sendJSON(res, 200, { users: safeUsers }, req);
    },

    async getById(req, res, urlPath) {
        const { userId: reqUserId } = req;
        const userId = urlPath.split('/api/users/')[1];
        const reqUser = reqUserId ? await UserRepository.findById(reqUserId) : null;
        if (!reqUser) {
            return sendError(res, 401, 'Yêu cầu xác thực!', req);
        }

        // Nhân viên chỉ được phép xem thông tin của chính mình
        if (reqUser.role !== 'admin' && reqUserId !== userId) {
            return sendError(res, 403, 'Bạn chỉ được phép xem thông tin tài khoản của chính mình!', req);
        }

        const user = await UserRepository.findById(userId);
        if (!user) return sendError(res, 404, 'Không tìm thấy người dùng!', req);
        
        // Chỉ cho phép Super Admin hoặc chính chủ xem thông tin tài khoản Super Admin
        if (user.isSuperAdmin || user.username === 'admin') {
            if (reqUserId !== user.id && !(reqUser.isSuperAdmin || reqUser.username === 'admin')) {
                return sendError(res, 403, 'Bạn không có quyền truy cập thông tin tài khoản này!', req);
            }
        }
        
        const safeUser = stripSensitiveUserFields(user);
        let teamSettings = null;
        if (user.team) {
            const teams = await TeamRepository.getAll();
            const team = (teams || []).find(t => (typeof t === 'string' ? t : t.name) === user.team);
            if (team && typeof team === 'object') {
                teamSettings = team;
            }
        }
        
        const { loadDB } = require('../../db');
        const db = await loadDB(false);
        const settings = db.settings || {};
        
        return sendJSON(res, 200, { user: { ...safeUser, teamSettings, settings } }, req);
    },

    async delete(req, res, urlPath) {
        const { userId: reqUserId } = req;
        const userId = urlPath.split('/api/users/')[1];
        const reqUser = reqUserId ? await UserRepository.findById(reqUserId) : null;

        // Phân quyền nghiêm ngặt: Chỉ Admin/Sub-Admin mới được xóa tài khoản
        if (!reqUser || reqUser.role !== 'admin') {
            return sendError(res, 403, 'Chỉ quản trị viên mới có quyền xóa tài khoản!', req);
        }

        const user = await UserRepository.findById(userId);
        if (!user) return sendError(res, 404, 'Không tìm thấy người dùng!', req);
        if (user.isSuperAdmin || user.username === 'admin') {
            return sendError(res, 403, 'Không thể xóa tài khoản Quản trị viên tối cao!', req);
        }

        const reqIsSuperAdmin = reqUser.isSuperAdmin || reqUser.username === 'admin';
        if (user.role === 'admin' && !reqIsSuperAdmin) {
            return sendError(res, 403, 'Chỉ Quản trị viên tối cao mới được xóa tài khoản quản lý!', req);
        }

        // Phân quyền theo Team cho Sub-admin
        if (!reqIsSuperAdmin && reqUser.team !== 'admin') {
            const reqUserTeam = reqUser.team || '';
            if (user.team && user.team !== reqUserTeam) {
                return sendError(res, 403, 'Bạn không có quyền xóa tài khoản của team khác!', req);
            }
        }

        await UserRepository.delete(userId);
        return sendJSON(res, 200, { message: 'Đã xóa' }, req);
    },

    async update(req, res, urlPath) {
        const { userId: reqUserId } = req;
        const userId = urlPath.split('/api/users/')[1];
        const body = await parseBody(req);
        const { fullname, username, password, role, deviceId, browserDeviceId, pendingUnlink, team, email, otpCode } = body;

        const reqUser = reqUserId ? await UserRepository.findById(reqUserId) : null;
        if (!reqUser) {
            return sendError(res, 401, 'Yêu cầu xác thực!', req);
        }

        const targetUser = await UserRepository.findById(userId);
        if (!targetUser) return sendError(res, 404, 'Không tìm thấy người dùng!', req);

        // Nếu là nhân viên (employee): chỉ cho phép gửi yêu cầu xin hủy liên kết thiết bị (pendingUnlink: true) cho chính mình
        if (reqUser.role !== 'admin') {
            if (reqUserId !== userId) {
                return sendError(res, 403, 'Bạn không có quyền chỉnh sửa tài khoản của người khác!', req);
            }
            const allowedKeys = Object.keys(body).filter(k => k !== 'pendingUnlink');
            if (allowedKeys.length > 0 || pendingUnlink !== true) {
                return sendError(res, 403, 'Nhân viên chỉ được phép gửi yêu cầu xin hủy liên kết thiết bị!', req);
            }
            const updatedSelf = await UserRepository.update(userId, { pendingUnlink: true });
            return sendJSON(res, 200, { user: stripSensitiveUserFields(updatedSelf) }, req);
        }

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

        const updates = {};

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
                // Xác thực thành công, xóa OTP
                updates.otpCode = null;
                updates.otpExpiresAt = null;
            }
        }

        if (fullname) updates.fullname = fullname;
        if (username) {
            const lowercaseUsername = username.toLowerCase().trim();
            if (lowercaseUsername.length < 3) {
                return sendError(res, 400, 'Tên đăng nhập phải có ít nhất 3 ký tự!');
            }
            const isUserExists = await UserRepository.existsByUsernameExcluding(lowercaseUsername, userId);
            if (isUserExists) {
                return sendError(res, 409, 'Tên đăng nhập đã tồn tại!');
            }
            updates.username = username.trim();
        }
        if (password) {
            updates.password = (targetUser.role === 'admin') ? hashPassword(password) : password;
        }
        if (deviceId !== undefined) updates.deviceId = deviceId;
        if (browserDeviceId !== undefined) updates.browserDeviceId = browserDeviceId;
        if (pendingUnlink !== undefined) updates.pendingUnlink = !!pendingUnlink;
        if (email !== undefined) {
            const cleanEmail = email ? email.trim().toLowerCase() : null;
            if (cleanEmail) {
                const isEmailUsed = await UserRepository.existsByEmail(cleanEmail, userId);
                if (isEmailUsed) {
                    return sendError(res, 400, 'Địa chỉ Email này đã được đăng ký cho một tài khoản khác!', req);
                }
            }
            updates.email = cleanEmail;
        }
        
        if (team !== undefined) {
            if (reqUserId) {
                const reqUser = await UserRepository.findById(reqUserId);
                if (reqUser && reqUser.role === 'admin' && !reqUser.isSuperAdmin && reqUser.team !== 'admin') {
                    // Sub-admin chỉ được gán về team của mình hoặc để trống
                    const reqUserTeam = reqUser.team || '';
                    if (team && team !== reqUserTeam) {
                        updates.team = reqUserTeam;
                    } else {
                        updates.team = team;
                    }
                } else {
                    updates.team = team;
                }
            } else {
                updates.team = team;
            }
        }

        if (role) {
            if (targetUser.isSuperAdmin && role !== 'admin') {
                return sendError(res, 403, 'Không thể thay đổi vai trò của Quản trị viên tối cao!');
            }
            updates.role = role;
        }

        // Đảm bảo team của admin là 'admin' nếu trống
        const finalRole = updates.role || targetUser.role;
        const finalTeam = updates.team !== undefined ? updates.team : targetUser.team;
        if (finalRole === 'admin' && (!finalTeam || finalTeam === '')) {
            updates.team = 'admin';
        }

        const updatedUser = await UserRepository.update(userId, updates);
        return sendJSON(res, 200, { user: stripSensitiveUserFields(updatedUser) }, req);
    }
};

module.exports = UserController;
