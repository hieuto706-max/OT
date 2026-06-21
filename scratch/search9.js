const fs = require('fs');
if (fs.existsSync('scratch/full_git_diff.txt')) {
    const diff = fs.readFileSync('scratch/full_git_diff.txt', 'utf8');
    const lines = diff.split('\n');
    lines.forEach((line, index) => {
        if (line.includes('records-approved') || line.includes('admin-records-body') || line.includes('admin-records-')) {
            console.log(`${index + 1}: ${line.trim()}`);
        }
    });
} else {
    console.log('scratch/full_git_diff.txt not found');
}
