const fs = require('fs');
const path = require('path');

const workspaceRoot = __dirname;
const backupDir = path.join(workspaceRoot, '.backup');

if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
}

const filesToBackup = [
    { src: path.join(workspaceRoot, 'desktop', 'style.css'), dest: path.join(backupDir, 'style.css.bak') },
    { src: path.join(workspaceRoot, 'desktop', 'index.html'), dest: path.join(backupDir, 'index.html.bak') },
    { src: path.join(workspaceRoot, 'docs', 'landing.css'), dest: path.join(backupDir, 'landing.css.bak') },
    { src: path.join(workspaceRoot, 'docs', 'index.html'), dest: path.join(backupDir, 'docs_index.html.bak') }
];

console.log('Bắt đầu sao lưu tệp...');
filesToBackup.forEach(file => {
    try {
        if (fs.existsSync(file.src)) {
            fs.copyFileSync(file.src, file.dest);
            console.log(`Đã sao lưu: ${file.src} -> ${file.dest}`);
        } else {
            console.warn(`Không tìm thấy tệp để sao lưu: ${file.src}`);
        }
    } catch (err) {
        console.error(`Lỗi sao lưu ${file.src}:`, err.message);
    }
});
console.log('Sao lưu hoàn tất!');
