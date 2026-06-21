const fs = require('fs');
const path = require('path');

const targetPath = path.join(__dirname, '..', 'desktop', 'app.src.js');
let code = fs.readFileSync(targetPath, 'utf8');

// Normalize line endings
code = code.replace(/\r\n/g, '\n');

// 1. Replace renderModalTeamsRows function
const renderTeamsRegex = /function renderModalTeamsRows\(\) \{[\s\S]*?\}\n\nfunction refreshModalTeamsView/g;
const newRenderTeams = `function renderModalTeamsRows() {
    if (!TEAMS || TEAMS.length === 0) {
        return '<tr class="empty-row"><td colspan="3" style="text-align:center;">Chưa có team nào được thiết lập</td></tr>';
    }
    return TEAMS.map((teamName, index) => \`
        <tr>
            <td style="text-align:center;">\${index + 1}</td>
            <td><strong>\${teamName}</strong></td>
            <td style="text-align:center;">
                <div style="display: flex; gap: 6px; justify-content: center; align-items: center;">
                    <button class="btn-icon-only edit" onclick="renameTeamFromModal('\${teamName}')" title="Đổi tên">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                    </button>
                    <button class="btn-icon-only delete" onclick="deleteTeamFromModal('\${teamName}')" title="Xóa">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                            <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2 2v2"/>
                        </svg>
                    </button>
                </div>
            </td>
        </tr>
    \`).join('');
}

function refreshModalTeamsView`;

if (renderTeamsRegex.test(code)) {
    code = code.replace(renderTeamsRegex, newRenderTeams);
    console.log('renderModalTeamsRows updated successfully.');
} else {
    console.error('Failed to locate renderModalTeamsRows via regex.');
}

// 2. Replace managers action buttons in refreshAdminUsers
const adminUsersRegex = /(\/\/ Render managers \(admins\)[\s\S]*?tbodyMgr\.innerHTML = managers\.map\([\s\S]*?<td><div class="action-buttons">)([\s\S]*?)(<\/div><\/td>)/g;
const newActionButtons = `
                    <button class="btn-icon-only edit" onclick="editUserDialog('\${u.id}')" title="Sửa" style="margin-right: 4px;">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                    </button>
                    \${u.username !== 'admin' ? \`
                        <button class="btn-icon-only delete" onclick="deleteUser('\${u.id}')" title="Xóa">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                                <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                            </svg>
                        </button>
                    \` : ''}
                `;

if (adminUsersRegex.test(code)) {
    code = code.replace(adminUsersRegex, `$1${newActionButtons}$3`);
    console.log('refreshAdminUsers action buttons updated successfully.');
} else {
    console.error('Failed to locate managers action buttons in refreshAdminUsers.');
}

// Convert back to original line endings and save
fs.writeFileSync(targetPath, code.replace(/\n/g, '\r\n'), 'utf8');
console.log('Finished updating app.src.js.');
