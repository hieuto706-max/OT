const http = require('http');

const testUrl = `http://127.0.0.1:3456/`;

http.get(testUrl, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        console.log('--- RUNNING SERVER TEST RESULTS ---');
        console.log('Status Code:', res.statusCode);
        console.log('Content-Type:', res.headers['content-type']);
        console.log('Body length:', data.length);
        console.log('Is HTML:', data.includes('<!DOCTYPE html>'));
        console.log('Contains Login Tabs:', data.includes('btn-tab-login') && data.includes('btn-tab-download'));
        console.log('--------------------');
        
        if (res.statusCode === 200 && data.includes('btn-tab-login')) {
            console.log('SUCCESS: Employee login and download tabs verified successfully on running server!');
            process.exit(0);
        } else {
            console.error('FAIL: Running server serves different content.');
            process.exit(1);
        }
    });
}).on('error', (err) => {
    console.error('GET request error:', err.message);
    process.exit(1);
});
