const fs = require('fs');
const path = require('path');

function searchDir(dir) {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
        const fullPath = path.join(dir, file);
        if (file === 'node_modules' || file === '.git' || file === 'dist' || file === 'android-sdk' || file === 'temp_jdk') return;
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            searchDir(fullPath);
        } else if (file.endsWith('.js') || file.endsWith('.html') || file.endsWith('.css')) {
            const content = fs.readFileSync(fullPath, 'utf8');
            if (content.includes('admin-records-approved-body')) {
                console.log(`Found in: ${fullPath}`);
            }
        }
    });
}

searchDir('.');
