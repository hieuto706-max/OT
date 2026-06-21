const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'server', 'server.js');
const content = fs.readFileSync(filePath, 'utf8');

const lines = content.split('\n');
lines.forEach((line, idx) => {
    if (line.includes('/api/records') || line.includes('isBackfill') || line.includes('status')) {
        if (idx > 700 && idx < 1000) {
            console.log(`${idx + 1}: ${line.trim()}`);
        }
    }
});
