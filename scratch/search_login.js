const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'desktop', 'app.src.js');
const content = fs.readFileSync(filePath, 'utf8');

const lines = content.split('\n');
lines.forEach((line, idx) => {
    if (line.toLowerCase().includes('login') || line.toLowerCase().includes('submit') || line.toLowerCase().includes('username')) {
        console.log(`${idx + 1}: ${line.trim()}`);
    }
});
