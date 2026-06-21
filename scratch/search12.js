const fs = require('fs');
if (fs.existsSync('scratch/full_git_diff.txt')) {
    const diff = fs.readFileSync('scratch/full_git_diff.txt', 'utf8');
    const lines = diff.split('\n');
    let inSrcDiff = false;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith('diff --git a/desktop/app.src.js')) {
            inSrcDiff = true;
        } else if (line.startsWith('diff --git') && inSrcDiff) {
            break;
        }
        if (inSrcDiff) {
            console.log(line);
        }
    }
}
