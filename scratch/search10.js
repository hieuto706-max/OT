const fs = require('fs');
const js = fs.readFileSync('desktop/app.src.js', 'utf8');
const lines = js.split('\n');
lines.forEach((line, index) => {
    if (line.includes('pending') || line.includes('Approved') || line.includes('Rejected')) {
        console.log(`${index + 1}: ${line.trim()}`);
    }
});
