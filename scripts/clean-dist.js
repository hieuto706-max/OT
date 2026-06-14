const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '..', 'dist');

console.log('Cleaning up old desktop installation files in dist/...');

if (fs.existsSync(distDir)) {
  try {
    const files = fs.readdirSync(distDir);
    let count = 0;
    files.forEach(file => {
      const ext = path.extname(file).toLowerCase();
      if (ext === '.exe' || ext === '.blockmap' || ext === '.yml') {
        const filePath = path.join(distDir, file);
        try {
          fs.unlinkSync(filePath);
          console.log(`Deleted: ${file}`);
          count++;
        } catch (err) {
          console.error(`Failed to delete ${file}:`, err.message);
        }
      }
    });
    console.log(`Cleanup completed. Deleted ${count} files.`);
  } catch (err) {
    console.error('Error reading dist directory:', err.message);
  }
} else {
  console.log('dist/ directory does not exist. No cleanup needed.');
}
