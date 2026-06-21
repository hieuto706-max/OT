const fs = require('fs');
const path = require('path');

const files = [
    path.join(__dirname, '..', 'desktop', 'style.css'),
    path.join(__dirname, '..', 'mobile', 'style.css')
];

files.forEach(f => {
    if (!fs.existsSync(f)) return;
    console.log(`\n--- ${path.basename(f)} ---`);
    const content = fs.readFileSync(f, 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, idx) => {
        if (line.includes('login-bg') || line.includes('screen-login') || line.includes('login-container')) {
            console.log(`${idx + 1}: ${line.trim()}`);
        }
    });
});
