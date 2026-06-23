const https = require('https');

const host = "otmanager.id.vn";
const key = "8b3522f293b6e8d0124c6ef930491cba";
const keyLocation = `https://${host}/${key}.txt`;

const payload = JSON.stringify({
    host: host,
    key: key,
    keyLocation: keyLocation,
    urlList: [
        `https://${host}/`,
        `https://${host}/app`
    ]
});

const options = {
    hostname: 'api.indexnow.org',
    path: '/indexnow',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(payload)
    }
};

console.log('Đang gửi danh sách URL lên IndexNow (Bing/Yandex)...');

const req = https.request(options, (res) => {
    let body = '';
    res.on('data', (chunk) => body += chunk);
    res.on('end', () => {
        if (res.statusCode === 200 || res.statusCode === 202) {
            console.log('✅ Gửi URL thành công! Bing/Yandex đã tiếp nhận danh sách và đang xử lý.');
        } else {
            console.error(`❌ Gửi thất bại. Mã lỗi HTTP từ IndexNow: ${res.statusCode}`);
            console.error(`Chi tiết: ${body}`);
        }
    });
});

req.on('error', (e) => {
    console.error(`❌ Lỗi kết nối API IndexNow: ${e.message}`);
});

req.write(payload);
req.end();
