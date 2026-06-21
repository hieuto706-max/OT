const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'mobile', 'index.html');
const content = fs.readFileSync(filePath, 'utf8');

const lines = content.split('\n');
lines.forEach((line, idx) => {
    if (line.includes('login') || line.includes('form')) {
        console.log(`${idx + 1}: ${line.trim()}`);
    }
});
