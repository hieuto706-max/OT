const fs = require('fs');
if (fs.existsSync('scratch/full_git_diff.txt')) {
    const diff = fs.readFileSync('scratch/full_git_diff.txt', 'utf8');
    const lines = diff.split('\n');
    lines.forEach((line, index) => {
        if (line.includes('desktop/app.src.js')) {
            console.log(`${index + 1}: ${line.trim()}`);
        }
    });
}
