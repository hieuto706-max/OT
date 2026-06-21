const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'mobile', 'style.css');
const content = fs.readFileSync(filePath, 'utf8');

const lines = content.split('\n');
lines.forEach((line, idx) => {
    const l = line.toLowerCase();
    if (l.includes('#6366f1') || l.includes('99, 102, 241') || l.includes('rgba(99,102,241') || l.includes('#818cf8') || l.includes('rgba(124, 127, 255')) {
        console.log(`${idx + 1}: ${line.trim()}`);
    }
});
