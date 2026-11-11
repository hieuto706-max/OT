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
const { checkLimit, clearRateLimits } = require('../server/src/utils/rateLimiter');
const { sanitizeObject } = require('../server/src/utils/http');
const { handleAPI } = require('../server/api');
const { EventEmitter } = require('node:events');

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

