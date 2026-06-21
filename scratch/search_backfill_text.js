const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'index.html');
const content = fs.readFileSync(filePath, 'utf8');

const lines = content.split('\n');
lines.forEach((line, idx) => {
    const l = line.toLowerCase();
    if (l.includes('bù tăng ca') || l.includes('tích lũy') || l.includes('nghỉ bù') || l.includes('bù công')) {
        console.log(`${idx + 1}: ${line.trim()}`);
    }
});
