const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const lines = html.split('\n');
lines.forEach((line, index) => {
    if (line.includes('tbody') || line.includes('admin-records-')) {
        console.log(`${index + 1}: ${line.trim()}`);
    }
});
