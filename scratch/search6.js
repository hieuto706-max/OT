const fs = require('fs');
const js = fs.readFileSync('desktop/app.src.js', 'utf8');
const lines = js.split('\n');
lines.forEach((line, index) => {
    if (line.includes('admin-records-')) {
        console.log(`${index + 1}: ${line.trim()}`);
    }
});
