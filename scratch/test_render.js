const fs = require('fs');
const path = require('path');

const srcPath = path.join(__dirname, '..', 'desktop', 'app.src.js');
let srcContent = fs.readFileSync(srcPath, 'utf8');

// We want to extract TEAMS and renderModalTeamsRows, and execute them.
// Let's create a JS environment where we run it.
const TEAMS = ['Team A', 'Team B'];

// Let's find function renderModalTeamsRows
const match = srcContent.match(/function renderModalTeamsRows\(\)[\s\S]*?join\(''\);\s*\n\}/);
if (!match) {
    console.error('Could not find renderModalTeamsRows definition');
    process.exit(1);
}

const renderFunc = new Function('TEAMS', match[0] + '\nreturn renderModalTeamsRows();');
try {
    const html = renderFunc(TEAMS);
    console.log('Result HTML:\n', html);
} catch (e) {
    console.error('Error running function:', e);
}
