const config = require('../../config');
const UserRepository = require('../repositories/userRepository');
const { hashPassword, verifyPassword, generateId, signJWT, sendMail, logError, logInfo } = require('../../utils');
const { sendJSON, sendError, parseBody } = require('../utils/http');

const AuthController = {
    async handle(req, res, urlPath, method) {
        if (urlPath === '/api/auth/login' && method === 'POST') {
            return this.login(req, res);
        }
        if (urlPath === '/api/auth/request-unlink' && method === 'POST') {
            return this.requestUnlink(req, res);
        }
        if (urlPath === '/api/auth/send-email-otp' && method === 'POST') {
            return this.sendEmailOtp(req, res);
        }
        if (urlPath === '/api/auth/verify-email-otp' && method === 'POST') {
            return this.verifyEmailOtp(req, res);
        }
        if (urlPath === '/api/auth/forgot-password' && method === 'POST') {
            return this.forgotPassword(req, res);
        }
        if (urlPath === '/api/auth/register' && method === 'POST') {
            return this.register(req, res);
        }

        return sendError(res, 404, 'Endpoint không tồn tại');
    },

    async login(req, res) {
        const { username, password, deviceId, isBrowser, clientSource } = await parseBody(req);
        if (!username) return sendError(res, 400, 'Thiếu tên đăng nhập!', req);

        // Sync single user from PostgreSQL in background (non-blocking để login nhanh hơn)
        if (config.DATABASE_URL) {
            const { fetchUserFromPG, updateUserInCache } = require('../../db');
            fetchUserFromPG(username).then(latestUser => {
                if (latestUser) updateUserInCache(latestUser);
            }).catch(e => logError('[Login Sync] Lỗi đồng bộ user từ PG:', e.message));
        }

        // Tìm user không phân biệt chữ hoa chữ thường
        const user = await UserRepository.findByUsername(username);
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
                    const users = await UserRepository.getAll();
                    const otherOwner = users.find(u => u.role === 'employee' && u.id !== user.id && u[targetDeviceField] === deviceId);
                    if (otherOwner) {
                        return sendError(res, 403, isBrowser ? 'Trình duyệt này đã được liên kết với một tài khoản khác!' : 'Thiết bị này đã được liên kết với một tài khoản khác!', req);
                    }
                    await UserRepository.update(user.id, { [targetDeviceField]: deviceId });
                } else if (currentBoundId !== deviceId) {
                    // Thiết bị không trùng khớp ➡️ Khóa và yêu cầu liên hệ Quản lý để hủy liên kết
                    const errMsg = isBrowser ? 'Tài khoản này đã được liên kết với trình duyệt khác. Vui lòng liên hệ Quản lý để hủy liên kết thiết bị cũ.' : 'Tài khoản này đã được liên kết với thiết bị khác. Vui lòng liên hệ Quản lý để hủy liên kết thiết bị cũ.';
                    return sendJSON(res, 403, { error: errMsg, code: 'device_locked' }, req);
                }
            }
            const { password: _, ...safeUser } = user;
            // Cập nhật lại safeUser sau khi đã cập nhật device
            if (deviceId) {
                const targetDeviceField = isBrowser ? 'browserDeviceId' : 'deviceId';
                safeUser[targetDeviceField] = deviceId;
            }
            const token = signJWT({ userId: user.id, role: user.role, team: user.team || '', deviceId: deviceId || '' }, 7 * 24 * 3600);
            return sendJSON(res, 200, { user: safeUser, token }, req);
        }

        // Nếu là admin, yêu cầu mật khẩu
        if (!(await verifyPassword(password || '', user.password))) {
            return sendError(res, 401, 'Sai mật khẩu!', req);
        }

        // Tự động nâng cấp mật khẩu cũ (100.000 vòng) sang chuẩn mới nhanh hơn (20.000 vòng)
        if (user.password.startsWith('pbkdf2$100000$')) {
            try {
                const newHash = hashPassword(password || '');
                await UserRepository.update(user.id, { password: newHash });
                user.password = newHash;
            } catch (e) {
                console.error('[Password Upgrade] Lỗi tự động nâng cấp mật khẩu:', e.message);
            }
        }

        const { password: _, ...safeUser } = user;
        const token = signJWT({ userId: user.id, role: user.role, team: user.team || '' }, 24 * 3600);
        const requireEmailSetup = user.role === 'admin' && !user.email;
        return sendJSON(res, 200, { user: safeUser, token, requireEmailSetup }, req);
    },

    async requestUnlink(req, res) {
        const { username } = await parseBody(req);
        if (!username) return sendError(res, 400, 'Thiếu tên đăng nhập!', req);
        const user = await UserRepository.findByUsername(username);
        if (!user) return sendError(res, 404, 'Không tìm thấy tên đăng nhập trong hệ thống!', req);
        
        const { loadDB } = require('../../db');
        const db = await loadDB();
        const settings = db.settings || { autoApproveUnlink: false };
        
        if (settings.autoApproveUnlink) {
            await UserRepository.update(user.id, { 
                deviceId: null, 
                browserDeviceId: null,
                pendingUnlink: false 
            });
            return sendJSON(res, 200, { 
                success: true, 
                autoApproved: true,
                message: 'Thiết bị cũ của bạn đã được hủy liên kết tự động thành công! Bạn có thể đăng nhập ngay trên thiết bị mới.' 
            }, req);
        } else {
            await UserRepository.update(user.id, { pendingUnlink: true });
            return sendJSON(res, 200, { 
                success: true, 
                autoApproved: false,
                message: 'Đã gửi yêu cầu huỷ liên kết thiết bị đến Quản trị viên!' 
            }, req);
        }
    },

    async sendEmailOtp(req, res) {
        const { username, email } = await parseBody(req);
        if (!username) return sendError(res, 400, 'Thiếu tên đăng nhập!', req);

        const user = await UserRepository.findByUsername(username);
        if (!user) return sendError(res, 404, 'Không tìm thấy tên đăng nhập trong hệ thống!', req);

        const targetEmail = email ? email.trim() : user.email;
        if (!targetEmail) {
            return sendError(res, 400, 'Tài khoản chưa được liên kết email. Vui lòng liên hệ Kỹ thuật hoặc Admin!', req);
        }

        // Kiểm tra xem email đã được tài khoản khác sử dụng chưa
        const isEmailUsed = await UserRepository.existsByEmail(targetEmail, user.id);
        if (isEmailUsed) {
            return sendError(res, 400, 'Địa chỉ Email này đã được đăng ký cho một tài khoản khác!', req);
        }

        // Sinh mã OTP 6 chữ số
        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        const otpExpiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // hết hạn trong 5 phút
        
        await UserRepository.update(user.id, { otpCode, otpExpiresAt });

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
    },

    async verifyEmailOtp(req, res) {
        const { username, email, otpCode } = await parseBody(req);
        if (!username || !email || !otpCode) {
            return sendError(res, 400, 'Thiếu thông tin xác thực!', req);
        }

        const user = await UserRepository.findByUsername(username);
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

        const isEmailUsed = await UserRepository.existsByEmail(email, user.id);
        if (isEmailUsed) {
            return sendError(res, 400, 'Địa chỉ Email này đã được đăng ký cho một tài khoản khác!', req);
        }

        await UserRepository.update(user.id, {
            email: email.trim().toLowerCase(),
            otpCode: null,
            otpExpiresAt: null
        });

        return sendJSON(res, 200, { success: true, message: 'Xác thực và lưu email thành công!' }, req);
    },

    async forgotPassword(req, res) {
        const { username, otpCode, newPassword } = await parseBody(req);
        if (!username || !otpCode || !newPassword) {
            return sendError(res, 400, 'Thiếu Tên đăng nhập, Mã OTP xác thực hoặc Mật khẩu mới!', req);
        }
        const user = await UserRepository.findByUsername(username);
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
        
        await UserRepository.update(user.id, {
            password: hashPassword(newPassword),
            otpCode: null,
            otpExpiresAt: null
        });
        return sendJSON(res, 200, { success: true, message: 'Đổi mật khẩu thành công! Bạn có thể đăng nhập bằng mật khẩu mới.' }, req);
    },

    async register(req, res) {
        const { userId: reqUserId, userRole: reqUserRole } = req;

        // Phân quyền: Chỉ Admin/Sub-Admin mới được tạo tài khoản
        if (reqUserRole !== 'admin') {
            return sendError(res, 403, 'Chỉ quản trị viên mới được tạo tài khoản mới!', req);
        }

        const body = await parseBody(req);
        const { fullname, username, password, role, email } = body;
        if (!fullname || !username) return sendError(res, 400, 'Vui lòng điền đầy đủ thông tin!', req);
        if (username.length < 3) return sendError(res, 400, 'Tên đăng nhập phải có ít nhất 3 ký tự!', req);
        
        // Chỉ Super Admin mới được tạo tài khoản quản lý (admin role)
        if (role === 'admin') {
            const reqUser = reqUserId ? await UserRepository.findById(reqUserId) : null;
            const reqIsSuperAdmin = reqUser && (reqUser.isSuperAdmin || reqUser.username === 'admin');
            if (!reqIsSuperAdmin) {
                return sendError(res, 403, 'Chỉ Quản trị viên tối cao mới được tạo tài khoản quản lý!', req);
            }
        }

        const isEmployee = role !== 'admin';
        if (!isEmployee && (!password || password.length < 4)) {
            return sendError(res, 400, 'Mật khẩu quản trị viên phải có ít nhất 4 ký tự!', req);
        }

        const isUserExists = await UserRepository.existsByUsername(username);
        if (isUserExists) {
            return sendError(res, 409, 'Tên đăng nhập đã tồn tại!', req);
        }

        if (email && email.trim()) {
            const isEmailUsed = await UserRepository.existsByEmail(email);
            if (isEmailUsed) {
                return sendError(res, 400, 'Địa chỉ Email này đã được đăng ký cho một tài khoản khác!', req);
            }
        }

        let userTeam = body.team || '';
        if (reqUserId) {
            const reqUser = await UserRepository.findById(reqUserId);
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
        await UserRepository.create(newUser);
        const { password: _, ...safeUser } = newUser;
        return sendJSON(res, 201, { user: safeUser }, req);
    }
};

module.exports = AuthController;
