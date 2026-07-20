const webpush = require('web-push');
const UserRepository = require('../repositories/userRepository');
const { VAPID_PUBLIC_KEY, fcmInitialized, admin } = require('../../notifications');
const { logInfo, logError } = require('../../utils');
const { sendJSON, sendError, parseBody } = require('../utils/http');

const NotificationController = {
    async handle(req, res, urlPath, method) {
        if (urlPath === '/api/notifications/vapid-public-key' && method === 'GET') {
            return this.getVapidPublicKey(req, res);
        }
        if (urlPath === '/api/notifications/subscribe' && method === 'POST') {
            return this.subscribe(req, res);
        }
        if (urlPath === '/api/notifications/test' && method === 'POST') {
            return this.test(req, res);
        }

        return sendError(res, 404, 'Endpoint không tồn tại');
    },

    async getVapidPublicKey(req, res) {
        return sendJSON(res, 200, { publicKey: VAPID_PUBLIC_KEY });
    },

    async subscribe(req, res) {
        const { userId: reqUserId } = req;
        try {
            const body = await parseBody(req);
            const { subscription, fcmToken } = body;
            
            // Lấy user đăng nhập hiện tại
            const user = await UserRepository.findById(reqUserId);
            if (!user) {
                return sendError(res, 404, 'Không tìm thấy người dùng.', req);
            }
            
            let updated = false;
            const updates = {};

            // 1. Xử lý Web Push cũ
            if (subscription && subscription.endpoint) {
                const pushSubscriptions = user.pushSubscriptions || [];
                const exists = pushSubscriptions.some(sub => sub.endpoint === subscription.endpoint);
                if (!exists) {
                    updates.pushSubscriptions = [...pushSubscriptions, subscription];
                    updated = true;
                    logInfo(`[Web Push] Đăng ký thông báo mới thành công cho nhân viên ${user.username}`);
                }
            }

            // 2. Xử lý Firebase FCM mới
            if (fcmToken) {
                const fcmTokens = user.fcmTokens || [];
                if (!fcmTokens.includes(fcmToken)) {
                    updates.fcmTokens = [...fcmTokens, fcmToken];
                    updated = true;
                    logInfo(`[FCM] Đăng ký token mới thành công cho nhân viên ${user.username}`);
                }
            }
            
            if (updated) {
                await UserRepository.update(user.id, updates);
            }
            
            return sendJSON(res, 200, { success: true }, req);
        } catch (e) {
            logError('[Notifications Subscribe] Lỗi:', e.message);
            return sendError(res, 500, 'Lỗi lưu thông tin đăng ký thông báo.', req);
        }
    },

    async test(req, res) {
        const { userId: reqUserId } = req;
        try {
            const user = await UserRepository.findById(reqUserId);
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
            const updates = {};
            if (hasFCM && activeFcmTokens.length !== user.fcmTokens.length) {
                updates.fcmTokens = activeFcmTokens;
                dbUpdated = true;
            }
            if (hasWebPush && activeSubscriptions.length !== user.pushSubscriptions.length) {
                updates.pushSubscriptions = activeSubscriptions;
                dbUpdated = true;
            }
            if (dbUpdated) {
                await UserRepository.update(user.id, updates);
            }
            
            return sendJSON(res, 200, { success: true, count: successCount }, req);
        } catch (e) {
            logError('[Notifications Test] Lỗi:', e.message);
            return sendError(res, 500, 'Lỗi kiểm tra gửi thông báo đẩy.', req);
        }
    }
};

module.exports = NotificationController;
