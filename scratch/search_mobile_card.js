const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'mobile', 'style.css');
const content = fs.readFileSync(filePath, 'utf8');

const lines = content.split('\n');
lines.forEach((line, idx) => {
    if (line.includes('login-page-card') || line.includes('landing-left-side')) {
        console.log(`${idx + 1}: ${line.trim()}`);
    }
});
