const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const {
    calculateEveningOTHours,
    hashPassword,
    verifyPassword,
    encryptData,
    decryptData,
    signJWT,
    verifyJWT
} = require('../server/utils');
const { checkLimit, isBlocked, recordFailure, resetLimit, clearRateLimits } = require('../server/src/utils/rateLimiter');
const { sanitizeObject } = require('../server/src/utils/http');
const { handleAPI } = require('../server/api');
const { getHotCutoffMonth, getEffectiveRecordMonth } = require('../server/db');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');

test('calculateEveningOTHours - tính giờ OT chiều thường và tăng ca qua nửa đêm', () => {
    // Tăng ca cùng ngày
    assert.equal(calculateEveningOTHours('16:30', '20:30'), 4);
    assert.equal(calculateEveningOTHours('16:30', '21:00'), 4.5);

    // Tăng ca qua 00:00 đến rạng sáng hôm sau
    assert.equal(calculateEveningOTHours('16:30', '00:00'), 7.5);
    assert.equal(calculateEveningOTHours('16:30', '01:00'), 8.5);
    assert.equal(calculateEveningOTHours('16:30', '02:00'), 9.5);
    assert.equal(calculateEveningOTHours('22:00', '05:30'), 7.5);

    // Giờ không hợp lệ hoặc trùng nhau (chiều sớm hơn giờ bắt đầu nhưng sau 12:00 trưa)
    assert.equal(calculateEveningOTHours('16:30', '16:30'), 0);
    assert.equal(calculateEveningOTHours('16:30', '15:00'), 0);
    assert.equal(calculateEveningOTHours('16:30', '13:00'), 0);
    assert.equal(calculateEveningOTHours('', '20:00'), 0);
    assert.equal(calculateEveningOTHours('invalid', '20:00'), 0);
});

test('hashPassword & verifyPassword - băm PBKDF2 an toàn và tương thích ngược', async () => {
    const hashed = hashPassword('MatKhau@123');
    assert.ok(hashed.startsWith('pbkdf2$20000$'));
    assert.equal(await verifyPassword('MatKhau@123', hashed), true);
    assert.equal(await verifyPassword('SaiMatKhau', hashed), false);

    // Tương thích ngược mật khẩu cũ chưa băm
    assert.equal(await verifyPassword('legacy123', 'legacy123'), true);
    assert.equal(await verifyPassword('wrong', 'legacy123'), false);
});

test('encryptData & decryptData - mã hóa xác thực AES-256-GCM và đọc ngược AES-256-CBC cũ', () => {
    const prevKey = process.env.DB_ENCRYPTION_KEY;
    const testKeyHex = crypto.randomBytes(32).toString('hex');
    process.env.DB_ENCRYPTION_KEY = testKeyHex;

    try {
        const sample = JSON.stringify({ users: [{ username: 'nv01', fullname: 'Nguyễn Văn A' }] });
        const encrypted = encryptData(sample);
        assert.ok(encrypted.startsWith('enc_gcm:'));
        assert.equal(decryptData(encrypted), sample);

        // Kiểm tra chống giả mạo (tamper detection) của GCM
        const parts = encrypted.split(':');
        const tamperedTag = parts[2].slice(0, -2) + (parts[2].endsWith('00') ? 'ff' : '00');
        const tampered = `${parts[0]}:${parts[1]}:${tamperedTag}:${parts[3]}`;
        assert.equal(decryptData(tampered), tampered);

        // Kiểm tra tương thích ngược với dữ liệu cũ chuẩn AES-256-CBC (enc:<iv>:<hex>)
        const keyBuf = Buffer.from(testKeyHex, 'hex');
        const iv = crypto.randomBytes(16);
        const legacyCipher = crypto.createCipheriv('aes-256-cbc', keyBuf, iv);
        let legacyHex = legacyCipher.update(sample, 'utf8', 'hex');
        legacyHex += legacyCipher.final('hex');
        const legacyPayload = `enc:${iv.toString('hex')}:${legacyHex}`;
        assert.equal(decryptData(legacyPayload), sample);
    } finally {
        if (prevKey === undefined) delete process.env.DB_ENCRYPTION_KEY;
        else process.env.DB_ENCRYPTION_KEY = prevKey;
    }
});

test('signJWT & verifyJWT - ký, xác thực và chống sửa đổi chữ ký', () => {
    const token = signJWT({ userId: 'u_100', role: 'admin', team: 'Kỹ thuật' }, 3600);
    const decoded = verifyJWT(token);
    assert.ok(decoded);
    assert.equal(decoded.userId, 'u_100');
    assert.equal(decoded.role, 'admin');

    // Giả mạo chữ ký phải bị từ chối
    const tampered = token.slice(0, -3) + 'abc';
    assert.equal(verifyJWT(tampered), null);

    // Token hết hạn phải bị từ chối
    const expiredToken = signJWT({ userId: 'u_100', role: 'admin' }, -10);
    assert.equal(verifyJWT(expiredToken), null);
});

test('rateLimiter - giới hạn tần suất theo IP và action', () => {
    clearRateLimits();
    assert.equal(checkLimit('10.0.0.1', 'unit_test_login', 3, 60000), true);
    assert.equal(checkLimit('10.0.0.1', 'unit_test_login', 3, 60000), true);
    assert.equal(checkLimit('10.0.0.1', 'unit_test_login', 3, 60000), true);
    assert.equal(checkLimit('10.0.0.1', 'unit_test_login', 3, 60000), false);

    // IP khác không bị ảnh hưởng
    assert.equal(checkLimit('10.0.0.2', 'unit_test_login', 3, 60000), true);
    clearRateLimits();
});

test('sanitizeObject - loại bỏ các khóa gây Prototype Pollution', () => {
    const rawJson = '{"fullname":"Test","__proto__":{"isAdmin":true},"nested":{"constructor":{"bad":1},"ok":42}}';
    const parsed = JSON.parse(rawJson);
    const clean = sanitizeObject(parsed);

    assert.equal(clean.fullname, 'Test');
    assert.equal(Object.prototype.hasOwnProperty.call(clean, '__proto__'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(clean.nested, 'constructor'), false);
    assert.equal(clean.nested.ok, 42);
    assert.equal(({}).isAdmin, undefined);
});

function createMockReqRes({ method = 'GET', url = '/', headers = {}, remoteAddress = '127.0.0.1', body = null }) {
    const req = new EventEmitter();
    req.method = method;
    req.url = url;
    req.headers = { host: 'localhost:8080', ...headers };
    req.socket = { remoteAddress };
    req.destroy = () => {};

    let statusCode = 200;
    let responseBody = '';
    const res = {
        writeHead(code) { statusCode = code; },
        end(chunk) { if (chunk) responseBody += chunk; },
        get statusCode() { return statusCode; },
        get json() { return responseBody ? JSON.parse(responseBody) : null; }
    };

    process.nextTick(() => {
        if (body !== null) {
            req.emit('data', typeof body === 'string' ? body : JSON.stringify(body));
        }
        req.emit('end');
    });

    return { req, res };
}

test('handleAPI RBAC & Security - chặn truy cập trái phép và kiểm tra Loopback/Whitelist', async () => {
    clearRateLimits();

    // 1. Chặn POST /api/teams không có token
    {
        const { req, res } = createMockReqRes({ method: 'POST', url: '/api/teams', body: { teams: [] } });
        await handleAPI(req, res, '/api/teams', 'POST');
        assert.equal(res.statusCode, 401);
    }

    // 2. Chặn GET /api/dashboard không có token
    {
        const { req, res } = createMockReqRes({ method: 'GET', url: '/api/dashboard' });
        await handleAPI(req, res, '/api/dashboard', 'GET');
        assert.equal(res.statusCode, 401);
    }

    // 3. Chặn POST /api/trigger-update từ IP ngoài (qua proxy x-forwarded-for)
    {
        const { req, res } = createMockReqRes({
            method: 'POST',
            url: '/api/trigger-update',
            headers: { 'x-forwarded-for': '203.0.113.99' },
            body: { downloadUrl: 'https://github.com/hieuto706-max/OT/releases/test.exe', version: '1.5.5' }
        });
        await handleAPI(req, res, '/api/trigger-update', 'POST');
        assert.equal(res.statusCode, 403);
    }

    // 4. Chặn domain không tin cậy trên /api/trigger-update kể cả từ localhost
    {
        global.startElectronUpdate = () => {};
        try {
            const { req, res } = createMockReqRes({
                method: 'POST',
                url: '/api/trigger-update',
                remoteAddress: '127.0.0.1',
                body: { downloadUrl: 'https://evil-attacker.example.com/malware.exe', version: '9.9.9' }
            });
            await handleAPI(req, res, '/api/trigger-update', 'POST');
            assert.equal(res.statusCode, 403);
        } finally {
            delete global.startElectronUpdate;
        }
    }

    clearRateLimits();
});

test('Hot/Cold Storage Tiering - tính mốc Hot Cache 3 tháng và tháng hiệu lực của bản ghi bù', () => {
    // Ngày 12/11/2026 giờ VN -> lùi 3 tháng là 2026-08
    const nov2026 = new Date('2026-11-12T05:00:00Z');
    assert.equal(getHotCutoffMonth(nov2026, 3), '2026-08');

    // Kiểm tra lùi qua mốc đầu năm: Tháng 02/2027 lùi 3 tháng -> 2026-11
    const feb2027 = new Date('2027-02-10T05:00:00Z');
    assert.equal(getHotCutoffMonth(feb2027, 3), '2026-11');

    // Bản ghi thường lấy theo date
    assert.equal(getEffectiveRecordMonth({ date: '2026-07-15', totalHours: 3 }), '2026-07');

    // Bản ghi bù tăng ca (isBackfill hoặc tag cũ) tính vào createdMonth
    assert.equal(
        getEffectiveRecordMonth({ date: '2026-07-20', isBackfill: true, createdMonth: '2026-10' }),
        '2026-10'
    );
    assert.equal(
        getEffectiveRecordMonth({ date: '2026-06-18', note: '[BÙ THÁNG TRƯỚC] Bù giờ tháng 06/2026', createdMonth: '2026-09' }),
        '2026-09'
    );
    assert.equal(getEffectiveRecordMonth(null), '');
});

test('Security & Modular Architecture v1.6.0 - xóa hoàn toàn lưu mật khẩu plaintext và kiểm tra 18 module nguồn', () => {
    const rootDir = path.join(__dirname, '..');

    // 1. Đảm bảo không còn lưu ot_saved_admin_pass dạng plaintext ở Web Portal
    const portalAuthSrc = fs.readFileSync(path.join(rootDir, 'docs', 'src', '03-portal-auth.js'), 'utf8');
    const landingBundleSrc = fs.readFileSync(path.join(rootDir, 'docs', 'landing.src.js'), 'utf8');
    assert.equal(portalAuthSrc.includes("setItem('ot_saved_admin_pass'"), false);
    assert.equal(landingBundleSrc.includes("setItem('ot_saved_admin_pass'"), false);
    assert.equal(portalAuthSrc.includes("removeItem('ot_saved_admin_pass')"), true);

    // 2. Kiểm tra đầy đủ cấu trúc module hóa cho Desktop (8), Mobile (6), Docs (4)
    const desktopModules = fs.readdirSync(path.join(rootDir, 'desktop', 'src')).filter(f => f.endsWith('.js'));
    const mobileModules = fs.readdirSync(path.join(rootDir, 'mobile', 'src')).filter(f => f.endsWith('.js'));
    const docsModules = fs.readdirSync(path.join(rootDir, 'docs', 'src')).filter(f => f.endsWith('.js'));
    assert.equal(desktopModules.length, 8);
    assert.equal(mobileModules.length, 6);
    assert.equal(docsModules.length, 4);

    // 3. Kiểm tra các nâng cấp Enterprise UI/UX trọng tâm có mặt trên HTML
    const desktopHtml = fs.readFileSync(path.join(rootDir, 'desktop', 'index.html'), 'utf8');
    const mobileHtml = fs.readFileSync(path.join(rootDir, 'mobile', 'index.html'), 'utf8');
    const docsHtml = fs.readFileSync(path.join(rootDir, 'docs', 'index.html'), 'utf8');

    assert.equal(desktopHtml.includes('id="btn-theme-toggle"'), true);
    assert.equal(desktopHtml.includes('id="btn-kpi-toggle"'), true);
    assert.equal(desktopHtml.includes('id="btn-expand-records"'), true);
    assert.equal(desktopHtml.includes('sub-tabs-inline'), true);
    assert.equal(desktopHtml.includes('id="desktop-wakeup-banner"'), true);
    assert.equal(mobileHtml.includes('id="ot-quick-time-chips"'), true);
    assert.equal(mobileHtml.includes('id="mobile-wakeup-banner"'), true);
    assert.equal(docsHtml.includes('id="cloud-wakeup-banner"'), true);
});

test('Warehouse 450+ Shared Wi-Fi Concurrency (v1.6.2) - 450 thiết bị chung 1 IP không bị chặn 429, cô lập máy spam riêng lẻ', async () => {
    clearRateLimits();
    const sharedWarehouseIp = '203.0.113.88';

    // 1. Giả lập 450 nhân viên trong kho bắt chung 1 cục Wi-Fi gọi API đồng thời (2 request/máy = 900 request chung 1 IP)
    for (let i = 1; i <= 450; i++) {
        for (let callIdx = 0; callIdx < 2; callIdx++) {
            const { req, res } = createMockReqRes({
                method: 'GET',
                url: '/api/version',
                headers: {
                    'x-forwarded-for': sharedWarehouseIp,
                    'x-device-id': `warehouse_phone_${i}`
                }
            });
            await handleAPI(req, res, '/api/version', 'GET');
            assert.equal(res.statusCode, 200, `Nhân viên #${i} trên Wi-Fi chung không được bị chặn 429`);
        }
    }

    // 2. Một thiết bị đơn lẻ cố tình spam vượt 180 req/phút phải bị chặn 429, nhưng nhân viên kế bên cùng Wi-Fi vẫn vào 200 bình thường
    for (let s = 0; s < 180; s++) {
        const { req, res } = createMockReqRes({
            method: 'GET',
            url: '/api/version',
            headers: {
                'x-forwarded-for': sharedWarehouseIp,
                'x-device-id': 'rogue_spammer_device'
            }
        });
        await handleAPI(req, res, '/api/version', 'GET');
        assert.equal(res.statusCode, 200);
    }
    {
        const { req, res } = createMockReqRes({
            method: 'GET',
            url: '/api/version',
            headers: {
                'x-forwarded-for': sharedWarehouseIp,
                'x-device-id': 'rogue_spammer_device'
            }
        });
        await handleAPI(req, res, '/api/version', 'GET');
        assert.equal(res.statusCode, 429);
    }
    {
        const { req, res } = createMockReqRes({
            method: 'GET',
            url: '/api/version',
            headers: {
                'x-forwarded-for': sharedWarehouseIp,
                'x-device-id': 'warehouse_phone_451'
            }
        });
        await handleAPI(req, res, '/api/version', 'GET');
        assert.equal(res.statusCode, 200);
    }

    // 3. Kiểm tra cơ chế chỉ đếm lỗi đăng nhập sai (recordFailure / isBlocked / resetLimit)
    const adminKey = `${sharedWarehouseIp}:admin`;
    for (let attempt = 1; attempt <= 8; attempt++) {
        recordFailure(adminKey, 'login_admin_fail', 8, 5 * 60 * 1000);
    }
    assert.equal(isBlocked(adminKey, 'login_admin_fail', 8), true);
    resetLimit(adminKey, 'login_admin_fail');
    assert.equal(isBlocked(adminKey, 'login_admin_fail', 8), false);

    clearRateLimits();
});



