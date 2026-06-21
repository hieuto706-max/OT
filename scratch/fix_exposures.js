const fs = require('fs');
const path = require('path');

const targetPath = path.join(__dirname, '..', 'desktop', 'app.src.js');
let code = fs.readFileSync(targetPath, 'utf8');

// Normalize line endings
code = code.replace(/\r\n/g, '\n');

// 1. Remove the old exposure lines from the DOMContentLoaded handler
const oldExposureBlock = `    // Expose global methods
    window.addTeamFromModal = addTeamFromModal;
    window.renameTeamFromModal = renameTeamFromModal;
    window.deleteTeamFromModal = deleteTeamFromModal;
});`;

const newCloseBlock = `});`;

if (code.includes(oldExposureBlock)) {
    code = code.replace(oldExposureBlock, newCloseBlock);
    console.log('Old exposure lines removed from DOMContentLoaded.');
} else {
    console.warn('Old exposure block not found or already removed.');
}

// 2. Append the new exposures at the bottom of the file
const bottomTarget = `window.editRecordDialog = editRecordDialog;
window.deleteRecord = deleteRecord;
window.resetUserDevice = resetUserDevice;
window.approveUnlinkDevice = approveUnlinkDevice;
window.editUserDialog = editUserDialog;
window.deleteUser = deleteUser;`;

const bottomReplacement = `window.editRecordDialog = editRecordDialog;
window.deleteRecord = deleteRecord;
window.resetUserDevice = resetUserDevice;
window.approveUnlinkDevice = approveUnlinkDevice;
window.editUserDialog = editUserDialog;
window.deleteUser = deleteUser;
window.addTeamFromModal = addTeamFromModal;
window.renameTeamFromModal = renameTeamFromModal;
window.deleteTeamFromModal = deleteTeamFromModal;`;

if (code.includes(bottomTarget)) {
    code = code.replace(bottomTarget, bottomReplacement);
    console.log('Exposures successfully added to the bottom of the file.');
} else {
    console.error('Failed to locate bottom target exposures.');
}

// Write back with original line endings
fs.writeFileSync(targetPath, code.replace(/\n/g, '\r\n'), 'utf8');
console.log('Finished fixing exposures.');
