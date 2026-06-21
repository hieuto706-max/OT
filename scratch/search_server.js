const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'server', 'server.js');
const content = fs.readFileSync(filePath, 'utf8');

const lines = content.split('\n');
lines.forEach((line, idx) => {
    if (line.includes('cloud-url') || line.includes('cloudUrl')) {
        console.log(`${idx + 1}: ${line.trim()}`);
    }
});
