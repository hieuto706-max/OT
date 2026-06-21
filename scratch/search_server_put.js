const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'server', 'server.js');
const content = fs.readFileSync(filePath, 'utf8');

const lines = content.split('\n');
lines.forEach((line, idx) => {
    if (line.includes('/api/records/') && (line.includes('PUT') || line.includes('update') || line.includes('status'))) {
        if (idx > 1000 && idx < 1250) {
            console.log(`${idx + 1}: ${line.trim()}`);
        }
    }
});
