const https = require('https');

function check(url) {
    console.log(`Checking ${url}...`);
    const req = https.get(url, { timeout: 10000 }, (res) => {
        console.log(`Status code: ${res.statusCode}`);
        console.log('Headers:', res.headers);
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
            console.log('Body snippet:', body.substring(0, 500));
        });
    });
    
    req.on('error', (e) => {
        console.error('Error:', e.message);
    });
    
    req.on('timeout', () => {
        console.error('Timeout!');
        req.destroy();
    });
}

check('https://new-folder-6471.onrender.com/OT-Manager-AppCon.apk');
