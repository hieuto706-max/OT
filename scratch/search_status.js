const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'desktop', 'app.src.js');
const content = fs.readFileSync(filePath, 'utf8');

const lines = content.split('\n');
lines.forEach((line, idx) => {
    const l = line.toLowerCase();
    if (l.includes('trạng thái') || l.includes('status') || l.includes('bù') || l.includes('compensation') || l.includes('paymenttype')) {
        console.log(`${idx + 1}: ${line.trim()}`);
    }
});
