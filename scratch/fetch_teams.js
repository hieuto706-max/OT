const http = require('http');

http.get('http://127.0.0.1:3456/api/teams', (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
        console.log('HTTP status:', res.statusCode);
        console.log('Teams:', JSON.parse(data));
    });
}).on('error', (err) => {
    console.error('Error fetching teams:', err);
});
