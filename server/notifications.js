const admin = require('firebase-admin');
const webpush = require('web-push');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const { logInfo, logError } = require('./utils');

// ==================== FIREBASE CLOUD MESSAGING SETUP ====================
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

// ==================== WEB PUSH SETUP ====================
function initWebPush() {
    try {
        let configPath = path.join(__dirname, 'config.json');
        if (!fs.existsSync(configPath)) {
            configPath = path.join(__dirname, '..', 'config.json');
        }
        let localConfig = {};
        if (fs.existsSync(configPath)) {
            localConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        }
        
        if (!localConfig.vapidPublicKey || !localConfig.vapidPrivateKey) {
            const keys = webpush.generateVAPIDKeys();
            localConfig.vapidPublicKey = keys.publicKey;
            localConfig.vapidPrivateKey = keys.privateKey;
            fs.writeFileSync(configPath, JSON.stringify(localConfig, null, 2), 'utf-8');
            logInfo('[Web Push] Đã tự sinh cặp khóa VAPID mới và lưu vào config.json');
        }
        
        webpush.setVapidDetails(
            'mailto:support@otmanager.id.vn',
            localConfig.vapidPublicKey,
            localConfig.vapidPrivateKey
        );
        
        return localConfig.vapidPublicKey;
    } catch (err) {
        logError('[Web Push] Lỗi khởi tạo:', err.message);
        return null;
    }
}

const VAPID_PUBLIC_KEY = initWebPush();

// ==================== NOTIFICATION HELPER ====================
async function sendPushNotification(user, title, bodyText, url = '/mobile/') {
    const hasWebPush = user.pushSubscriptions && user.pushSubscriptions.length > 0;
    const hasFCM = user.fcmTokens && user.fcmTokens.length > 0;
    if (!hasWebPush && !hasFCM) return { dbUpdated: false, notifySuccess: false };

    let dbUpdated = false;
    let notifySuccess = false;

    const payload = JSON.stringify({
        title: title,
        body: bodyText,
        data: { url: url },
        actions: [
            { action: 'log', title: 'Ghi nhận ngay' },
            { action: 'skip', title: 'Bỏ qua' }
        ]
    });

    // 1. Gửi qua Firebase FCM (Ưu tiên hàng đầu)
    if (fcmInitialized && hasFCM) {
        const activeFcmTokens = [];
        for (const token of user.fcmTokens) {
            try {
                const message = {
                    notification: { title, body: bodyText },
                    data: { url: url },
                    token: token
                };
                await admin.messaging().send(message);
                notifySuccess = true;
                activeFcmTokens.push(token);
            } catch (err) {
                if (err.code === 'messaging/registration-token-not-registered' || err.code === 'messaging/invalid-argument') {
                    logInfo(`[FCM] Xóa token không hợp lệ của ${user.username}`);
                    dbUpdated = true;
                } else {
                    logError(`[FCM] Lỗi gửi token cho ${user.username}:`, err.message);
                    activeFcmTokens.push(token);
                }
            }
        }
        if (activeFcmTokens.length !== user.fcmTokens.length) {
            user.fcmTokens = activeFcmTokens;
            dbUpdated = true;
        }
    }

    // 2. Gửi qua Web Push (Fallback)
    if (hasWebPush) {
        const activeSubscriptions = [];
        for (const sub of user.pushSubscriptions) {
            try {
                await webpush.sendNotification(sub, payload);
                notifySuccess = true;
                activeSubscriptions.push(sub);
            } catch (err) {
                if (err.statusCode === 410 || err.statusCode === 404) {
                    logInfo(`[Web Push] Xóa subscription hết hạn của nhân viên ${user.username}`);
                    dbUpdated = true;
                } else {
                    logError(`[Web Push] Lỗi gửi thông báo cho ${user.username}:`, err.message);
                    activeSubscriptions.push(sub);
                }
            }
        }
        if (activeSubscriptions.length !== user.pushSubscriptions.length) {
            user.pushSubscriptions = activeSubscriptions;
            dbUpdated = true;
        }
    }

    return { dbUpdated, notifySuccess };
}

// ==================== DAILY REMINDER JOB ====================
let lastNotifiedDate = '';

function startDailyReminderJob(loadDB, saveDB) {
    setInterval(async () => {
        try {
            const now = new Date();
            const vnTime = new Date(now.getTime() + 7 * 3600000);
            const hours = vnTime.getUTCHours();
            const minutes = vnTime.getUTCMinutes();
            
            if (hours === 22 && minutes === 0) {
                const dateStr = vnTime.toISOString().split('T')[0];
                
                if (lastNotifiedDate === dateStr) return;
                lastNotifiedDate = dateStr;
                
                const dayOfWeek = vnTime.getUTCDay();
                if (dayOfWeek === 0) {
                    logInfo('[Daily Reminder] Hôm nay là Chủ Nhật, bỏ qua nhắc nhở.');
                    return;
                }
                
                logInfo(`[Daily Reminder] Đang bắt đầu quét nhắc nhở OT lúc 22:00 cho ngày ${dateStr}...`);
                await sendDailyPushReminders(dateStr, loadDB, saveDB);
            }
        } catch (e) {
            logError('[Daily Reminder] Lỗi chu kỳ nhắc nhở:', e.message);
        }
    }, 30000);
}

async function sendDailyPushReminders(dateStr, loadDB, saveDB) {
    const db = await loadDB();
    const employees = db.users.filter(u => u.role === 'employee');
    
    let notifyCount = 0;
    for (const emp of employees) {
        const hasRecord = db.records.some(r => r.userId === emp.id && r.date === dateStr);
        if (hasRecord) {
            continue;
        }
        
        const title = 'Nhắc nhở OT Manager 📝';
        const bodyText = `Hôm nay (${dateStr}) bạn chưa ghi nhận tăng ca. Hãy note giờ OT nhé!`;
        
        const { dbUpdated, notifySuccess } = await sendPushNotification(emp, title, bodyText);
        if (notifySuccess) {
            notifyCount++;
        }
        if (dbUpdated) {
            saveDB(db);
        }
    }
    logInfo(`[Daily Reminder] Hoàn thành quét nhắc nhở. Đã gửi thành công ${notifyCount} thông báo.`);
}

module.exports = {
    VAPID_PUBLIC_KEY,
    sendPushNotification,
    startDailyReminderJob
};
