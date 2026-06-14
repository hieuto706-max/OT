const http = require('http');
const fs = require('fs');
const path = require('path');

// Serve from ROOT directory (the full landing page + mobile subfolder)
const root = path.join(__dirname, '..');
const mime = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.apk': 'application/vnd.android.package-archive',
    '.ico': 'image/x-icon'
};

http.createServer((req, res) => {
    let urlPath = req.url.split('?')[0];
    if (urlPath === '/') urlPath = '/index.html';
    let filePath = path.join(root, urlPath);
    const ext = path.extname(filePath);
    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404);
            res.end('Not found: ' + urlPath);
            return;
        }
        res.writeHead(200, { 'Content-Type': mime[ext] || 'text/plain' });
        res.end(data);
    });
}).listen(8090, () => console.log('Server at http://localhost:8090 (root)'));
