const fs = require('fs');
const path = require('path');

const srcPath = path.join(__dirname, '..', 'desktop', 'app.src.js');
const jsPath = path.join(__dirname, '..', 'desktop', 'app.js');

console.log('srcPath exists:', fs.existsSync(srcPath));
console.log('jsPath exists:', fs.existsSync(jsPath));

const srcContent = fs.readFileSync(srcPath, 'utf8');
const jsContent = fs.readFileSync(jsPath, 'utf8');

console.log('srcContent length:', srcContent.length);
console.log('jsContent length:', jsContent.length);

// Let's see if we can find if renameTeamFromModal exists in srcContent
console.log('renameTeamFromModal in srcContent:', srcContent.includes('renameTeamFromModal'));

// Let's print a small chunk of srcContent around renderModalTeamsRows
const idx = srcContent.indexOf('function renderModalTeamsRows');
if (idx !== -1) {
    console.log('srcContent segment:\n', srcContent.substring(idx, idx + 400));
}
