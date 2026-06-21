const fs = require('fs');
const path = require('path');

const files = [
    path.join(__dirname, '..', 'desktop', 'app.src.js'),
    path.join(__dirname, '..', 'mobile', 'app.src.js'),
    path.join(__dirname, '..', 'server', 'server.js')
];

files.forEach(f => {
    if (!fs.existsSync(f)) return;
    const content = fs.readFileSync(f, 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, idx) => {
        if (line.includes('rejectRecord')) {
            console.log(`${path.basename(f)}:${idx + 1}: ${line.trim()}`);
        }
    });
});
