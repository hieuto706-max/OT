const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'desktop', 'app.src.js');
const content = fs.readFileSync(filePath, 'utf8');

const lines = content.split('\n');
lines.forEach((line, idx) => {
    if (line.includes('emp-') || line.includes('employee-')) {
        if (line.includes('tab') || line.includes('render') || line.includes('inner')) {
            console.log(`${idx + 1}: ${line.trim()}`);
        }
    }
});
