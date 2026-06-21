const http = require('http');

http.get('http://127.0.0.1:3456/desktop/app.js', (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
        console.log('HTTP status:', res.statusCode);
        console.log('Response length:', data.length);
        console.log('Served file length matches local file size:', data.length === 207281 || data.length === 204290);
        console.log('renameTeamFromModal exists in served file:', data.includes('renameTeamFromModal'));
    });
}).on('error', (err) => {
    console.error('Error fetching served app.js:', err);
});
