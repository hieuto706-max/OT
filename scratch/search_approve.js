const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'desktop', 'app.src.js');
const content = fs.readFileSync(filePath, 'utf8');

const lines = content.split('\n');
lines.forEach((line, idx) => {
    if (line.includes('approve') || line.includes('status') || line.includes('status-badge') || line.includes('api(')) {
        if (idx > 900 && idx < 1600) {
            console.log(`${idx + 1}: ${line.trim()}`);
        }
    }
});
