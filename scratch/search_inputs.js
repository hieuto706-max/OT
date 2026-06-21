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
        if (line.includes('input') || line.includes('date') || line.includes('time')) {
            if (line.includes('{') || line.includes(':')) {
                console.log(`${idx + 1}: ${line.trim()}`);
            }
        }
    });
});
