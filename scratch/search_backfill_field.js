const fs = require('fs');
const path = require('path');

const paths = [
    path.join(__dirname, '..', 'desktop', 'app.src.js'),
    path.join(__dirname, '..', 'mobile', 'app.src.js')
];

paths.forEach(filePath => {
    if (!fs.existsSync(filePath)) return;
    console.log(`\n--- Searching in ${path.basename(filePath)} ---`);
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, idx) => {
        if (line.includes('isBackfill') || line.includes('compensate') || line.includes('paymentType')) {
            console.log(`${idx + 1}: ${line.trim()}`);
        }
    });
});
