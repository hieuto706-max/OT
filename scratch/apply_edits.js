const fs = require('fs');
const path = require('path');

const targetPath = path.join(__dirname, '..', 'desktop', 'app.src.js');
let code = fs.readFileSync(targetPath, 'utf8');

// Normalize line endings for reliable string matching
code = code.replace(/\r\n/g, '\n');

// 1. logout
const logoutTarget = [
    "function logout() {",
    "    localStorage.removeItem('ot_current_user');",
    "    localStorage.removeItem('ot_login_date');",
    "    localStorage.removeItem('ot_mobile_user');",
    "    localStorage.removeItem('ot_login_time');",
    "    localStorage.removeItem('ot_auth_token');",
    "    ",
    "    if (isElectron) {"
].join('\n');

const logoutReplacement = [
    "function logout() {",
    "    localStorage.removeItem('ot_current_user');",
    "    localStorage.removeItem('ot_login_date');",
    "    localStorage.removeItem('ot_mobile_user');",
    "    localStorage.removeItem('ot_login_time');",
    "    localStorage.removeItem('ot_auth_token');",
    "    ",
    "    sessionStorage.removeItem('ot_current_user');",
    "    sessionStorage.removeItem('ot_login_date');",
    "    sessionStorage.removeItem('ot_mobile_user');",
    "    sessionStorage.removeItem('ot_login_time');",
    "    sessionStorage.removeItem('ot_auth_token');",
    "    sessionStorage.removeItem('ot_session_temp');",
    "    ",
    "    if (isElectron) {"
].join('\n');

if (code.includes(logoutTarget)) {
    code = code.replace(logoutTarget, logoutReplacement);
    console.log('logout function updated successfully.');
} else {
    console.error('Failed to locate logout target.');
}

// 2. renderModalTeamsRows
const renderTeamsTarget = [
    "function renderModalTeamsRows() {",
    "    if (!TEAMS || TEAMS.length === 0) {",
    "        return '<tr class=\"empty-row\"><td colspan=\"3\" style=\"text-align:center;\">Chưa có team nào được thiết lập</td></tr>';",
    "    }",
    "    return TEAMS.map((teamName, index) => `",
    "        <tr>",
    "            <td style=\"text-align:center;\">${index + 1}</td>",
    "            <td><strong>${teamName}</strong></td>",
    "            <td style=\"text-align:center;\">",
    "                <button class=\"btn-icon-only edit\" onclick=\"renameTeamFromModal('${teamName}')\" title=\"Đổi tên\" style=\"margin-right: 4px; padding: 4px; border: 1px solid rgba(255, 255, 255, 0.05); background: rgba(255, 255, 255, 0.02); border-radius: 6px; cursor: pointer;\">",
    "                    <svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" width=\"14\" height=\"14\">",
    "                        <path d=\"M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7\"/>",
    "                        <path d=\"M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z\"/>",
    "                    </svg>",
    "                </button>",
    "                <button class=\"btn-icon-only delete\" onclick=\"deleteTeamFromModal('${teamName}')\" title=\"Xóa\" style=\"padding: 4px; border: 1px solid rgba(255, 255, 255, 0.05); background: rgba(255, 255, 255, 0.02); border-radius: 6px; cursor: pointer;\">",
    "                    <svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" width=\"14\" height=\"14\">",
    "                        <polyline points=\"3 6 5 6 21 6\"/><path d=\"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2\"/>",
    "                    </svg>",
    "                </button>",
    "            </td>",
    "        </tr>",
    "    \`).join('');",
    "}"
].join('\n');

const renderTeamsReplacement = [
    "function renderModalTeamsRows() {",
    "    if (!TEAMS || TEAMS.length === 0) {",
    "        return '<tr class=\"empty-row\"><td colspan=\"3\" style=\"text-align:center;\">Chưa có team nào được thiết lập</td></tr>';",
    "    }",
    "    return TEAMS.map((teamName, index) => `",
    "        <tr>",
    "            <td style=\"text-align:center;\">${index + 1}</td>",
    "            <td><strong>${teamName}</strong></td>",
    "            <td style=\"text-align:center;\">",
    "                <div style=\"display: flex; gap: 6px; justify-content: center; align-items: center;\">",
    "                    <button class=\"btn-icon-only edit\" onclick=\"renameTeamFromModal('${teamName}')\" title=\"Đổi tên\">",
    "                        <svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" width=\"14\" height=\"14\">",
    "                            <path d=\"M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7\"/>",
    "                            <path d=\"M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z\"/>",
    "                        </svg>",
    "                    </button>",
    "                    <button class=\"btn-icon-only delete\" onclick=\"deleteTeamFromModal('${teamName}')\" title=\"Xóa\">",
    "                        <svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=" + '"currentColor" stroke-width="2" width="14" height="14">' + "\n" +
    "                            <polyline points=\"3 6 5 6 21 6\"/><path d=\"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2\"/>",
    "                        </svg>",
    "                    </button>",
    "                </div>",
    "            </td>",
    "        </tr>",
    "    \`).join('');",
    "}"
].join('\n');

if (code.includes(renderTeamsTarget)) {
    code = code.replace(renderTeamsTarget, renderTeamsReplacement);
    console.log('renderModalTeamsRows updated successfully.');
} else {
    console.error('Failed to locate renderModalTeamsRows target.');
}

// 3. refreshAdminUsers
const adminUsersTarget = [
    "                <td><div class=\"action-buttons\">",
    "                    ${u.username !== 'admin' ? `",
    "                        <button class=\"btn-icon-only edit\" onclick=\"editUserDialog('${u.id}')\" title=\"Sửa\" style=\"margin-right: 4px;\">",
    "                            <svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" width=\"16\" height=\"16\">",
    "                                <path d=\"M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7\"/>",
    "                                <path d=\"M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z\"/>",
    "                            </svg>",
    "                        </button>",
    "                        <button class=\"btn-icon-only delete\" onclick=\"deleteUser('${u.id}')\" title=\"Xóa\">",
    "                            <svg viewBox=\"0 0 24 24" + '" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"' + ">",
    "                                <polyline points=\"3 6 5 6 21 6\"/><path d=\"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2\"/>",
    "                            </svg>",
    "                        </button>",
    "                    ` : '<span class=\"text-muted\" style=\"font-size:12px\">Mặc định</span>'}",
    "                </div></td>"
].join('\n');

const adminUsersReplacement = [
    "                <td><div class=\"action-buttons\">",
    "                    <button class=\"btn-icon-only edit\" onclick=\"editUserDialog('${u.id}')\" title=\"Sửa\" style=\"margin-right: 4px;\">",
    "                        <svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" width=\"16\" height=\"16\">",
    "                            <path d=\"M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7\"/>",
    "                            <path d=\"M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z\"/>",
    "                        </svg>",
    "                    </button>",
    "                    ${u.username !== 'admin' ? `",
    "                        <button class=\"btn-icon-only delete\" onclick=\"deleteUser('${u.id}')\" title=\"Xóa\">",
    "                            <svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" width=\"16\" height=\"16\">",
    "                                <polyline points=\"3 6 5 6 21 6\"/><path d=\"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2\"/>",
    "                            </svg>",
    "                        </button>",
    "                    ` : ''}",
    "                </div></td>"
].join('\n');

if (code.includes(adminUsersTarget)) {
    code = code.replace(adminUsersTarget, adminUsersReplacement);
    console.log('refreshAdminUsers updated successfully.');
} else {
    console.error('Failed to locate refreshAdminUsers target.');
}

// 4. colspan and status rendering in refreshEmployeeRecords
const empRecordsTarget1 = [
    "        if (records.length === 0) {",
    "            tbody.innerHTML = '<tr class=\"empty-row\"><td colspan=\"8\">Chưa có dữ liệu tăng ca</td></tr>';"
].join('\n');

const empRecordsReplacement1 = [
    "        if (records.length === 0) {",
    "            tbody.innerHTML = '<tr class=\"empty-row\"><td colspan=\"9\">Chưa có dữ liệu tăng ca</td></tr>';"
].join('\n');

if (code.includes(empRecordsTarget1)) {
    code = code.replace(empRecordsTarget1, empRecordsReplacement1);
    console.log('empRecords colspan updated successfully.');
} else {
    console.error('Failed to locate empRecords colspan target.');
}

const empRecordsTarget2 = [
    "        let totalLunchOT = 0, totalEveningOT = 0, totalHours = 0;",
    "        tbody.innerHTML = records.map(r => {",
    "            const lh = r.hasLunchOT ? OT_LUNCH_HOURS : 0;",
    "            totalLunchOT += lh;",
    "            totalEveningOT += r.eveningOTHours;",
    "            totalHours += r.totalHours;",
    "            return `<tr>",
    "                <td>${formatDate(r.date)}</td>",
    "                <td>${r.hasLunchOT ? '<span class=\"tag tag-yes\">✓ Có</span>' : '<span class=\"tag tag-no\">Không</span>'}</td>",
    "                <td>${r.eveningOTHours > 0 ? `<span class=\"text-green text-bold\">\${r.eveningOTHours.toFixed(1)}h</span>` : '<span style=\"color:var(--text-muted)\">—</span>'}</td>",
    "                <td>${r.otStart || '—'}</td>",
    "                <td>${r.otEnd || '—'}</td>",
    "                <td><span class=\"text-purple text-bold\">\${r.totalHours.toFixed(1)}</span></td>",
    "                <td>${r.note || '<span style=\"color:var(--text-muted)\">—</span>'}</td>",
    "                <td><div class=\"action-buttons\">"
].join('\n');

const empRecordsReplacement2 = [
    "        let totalLunchOT = 0, totalEveningOT = 0, totalHours = 0;",
    "        tbody.innerHTML = records.map(r => {",
    "            const lh = r.hasLunchOT ? OT_LUNCH_HOURS : 0;",
    "            totalLunchOT += lh;",
    "            totalEveningOT += r.eveningOTHours;",
    "            totalHours += r.totalHours;",
    "            ",
    "            let badgeClass = 'status-approved';",
    "            let badgeText = 'Đã duyệt';",
    "            if (r.isBackfill || (r.note && (r.note.includes('[BÙ THÁNG TRƯỚC]') || r.note.includes('[TĂNG THÁNG NÀY]')))) {",
    "                if (r.status === 'pending') {",
    "                    badgeClass = 'status-pending';",
    "                    badgeText = 'Chờ duyệt';",
    "                } else if (r.status === 'rejected') {",
    "                    badgeClass = 'status-rejected';",
    "                    badgeText = 'Từ chối';",
    "                }",
    "            }",
    "",
    "            return `<tr>",
    "                <td>${formatDate(r.date)}</td>",
    "                <td>${r.hasLunchOT ? '<span class=\"tag tag-yes\">✓ Có</span>' : '<span class=\"tag tag-no\">Không</span>'}</td>",
    "                <td>${r.eveningOTHours > 0 ? `<span class=\"text-green text-bold\">\${r.eveningOTHours.toFixed(1)}h</span>` : '<span style=\"color:var(--text-muted)\">—</span>'}</td>",
    "                <td>${r.otStart || '—'}</td>",
    "                <td>${r.otEnd || '—'}</td>",
    "                <td><span class=\"text-purple text-bold\">\${r.totalHours.toFixed(1)}</span></td>",
    "                <td><span class=\"status-badge ${badgeClass}\">${badgeText}</span></td>",
    "                <td>${r.note || '<span style=\"color:var(--text-muted)\">—</span>'}</td>",
    "                <td><div class=\"action-buttons\">"
].join('\n');

if (code.includes(empRecordsTarget2)) {
    code = code.replace(empRecordsTarget2, empRecordsReplacement2);
    console.log('empRecords rendering updated successfully.');
} else {
    console.error('Failed to locate empRecords rendering target.');
}

// 5. editUserDialog
const editDialogTarget = [
    "async function editUserDialog(userId) {",
    "    try {",
    "        const data = await api('/api/users');",
    "        const user = data.users.find(u => u.id === userId);",
    "        if (!user) return showToast('Không tìm thấy nhân viên', 'error');",
    "",
    "        const body = `",
    "        <form id=\"modal-form-edit-user\" class=\"login-form active\" style=\"text-align: left; padding: 0;\">",
    "            <div class=\"form-group\" style=\"margin-bottom: 15px;\">",
    "                <label style=\"display:block;margin-bottom:6px;font-weight:600;\">Họ và tên</label>",
    "                <input type=\"text\" id=\"modal-user-fullname\" value=\"${user.fullname}\" class=\"input-sm\" style=\"width:100%; box-sizing:border-box;\" required>",
    "            </div>",
    "            <div class=\"form-group\" id=\"modal-user-password-group\" style=\"margin-bottom: 15px;\">",
    "                <label style=\"display:block;margin-bottom:6px;font-weight:600;\">Mật khẩu mới (Để trống nếu giữ nguyên)</label>",
    "                <input type=\"password\" id=\"modal-user-password\" placeholder=\"Nhập mật khẩu mới nếu muốn đổi\" class=\"input-sm\" style=\"width:100%; box-sizing:border-box;\">",
    "            </div>",
    "            <div class=\"form-group\" style=\"margin-bottom: 15px;\">",
    "                <label style=\"display:block;margin-bottom:6px;font-weight:600;\">Vai trò</label>",
    "                <select id=\"modal-user-role\" class=\"input-sm\" style=\"width:100%; box-sizing:border-box;\">",
    "                    <option value=\"employee\" ${user.role === 'employee' ? 'selected' : ''}>Nhân viên (Điện thoại)</option>",
    "                    <option value=\"admin\" ${user.role === 'admin' ? 'selected' : ''}>Quản lý (Desktop)</option>",
    "                </select>",
    "            </div>",
    "            <div class=\"form-group\" id=\"modal-edit-user-manager-group\" style=\"margin-bottom: 0;\">",
    "                <label style=\"display:block;margin-bottom:6px;font-weight:600;\">Team</label>",
    "                <select id=\"modal-user-team\" class=\"input-sm\" style=\"width:100%; box-sizing:border-box;\">",
    "                    <option value=\"\">-- Chưa phân team --</option>",
    "                    ${TEAMS.map(teamName => `<option value=\"${teamName}\" ${user.team === teamName ? 'selected' : ''}>${teamName}</option>`).join('')}",
    "                </select>",
    "            </div>",
    "        </form>`;",
    "",
    "        showModal('Sửa thông tin nhân viên', body, [",
    "            { text: 'Hủy', class: 'btn-ghost' },",
    "            { text: 'Lưu', class: 'btn btn-primary btn-sm', action: async () => {",
    "                const fullname = document.getElementById('modal-user-fullname').value.trim();",
    "                const password = document.getElementById('modal-user-password').value;",
    "                const role = document.getElementById('modal-user-role').value;",
    "                const team = document.getElementById('modal-user-team') ? document.getElementById('modal-user-team').value : '';",
    "",
    "                if (!fullname) return showToast('Vui lòng điền họ tên!', 'error');",
    "",
    "                const payload = { fullname, role, team };"
].join('\n');

const editDialogReplacement = [
    "async function editUserDialog(userId) {",
    "    try {",
    "        const data = await api('/api/users');",
    "        const user = data.users.find(u => u.id === userId);",
    "        if (!user) return showToast('Không tìm thấy nhân viên', 'error');",
    "",
    "        const body = `",
    "        <form id=\"modal-form-edit-user\" class=\"login-form active\" style=\"text-align: left; padding: 0;\">",
    "            <div class=\"form-group\" style=\"margin-bottom: 15px;\">",
    "                <label style=\"display:block;margin-bottom:6px;font-weight:600;\">Họ và tên</label>",
    "                <input type=\"text\" id=\"modal-user-fullname\" value=\"${user.fullname}\" class=\"input-sm\" style=\"width:100%; box-sizing:border-box;\" required>",
    "            </div>",
    "            <div class=\"form-group\" style=\"margin-bottom: 15px;\">",
    "                <label style=\"display:block;margin-bottom:6px;font-weight:600;\">Tên đăng nhập</label>",
    "                <input type=\"text\" id=\"modal-user-username\" value=\"${user.username}\" class=\"input-sm\" style=\"width:100%; box-sizing:border-box;\" ${user.username === 'admin' ? 'readonly style=\"background:var(--bg-glass); opacity:0.7; cursor:not-allowed;\"' : ''} required>",
    "            </div>",
    "            <div class=\"form-group\" id=\"modal-user-password-group\" style=\"margin-bottom: 15px;\">",
    "                <label style=\"display:block;margin-bottom:6px;font-weight:600;\">Mật khẩu mới (Để trống nếu giữ nguyên)</label>",
    "                <input type=\"password\" id=\"modal-user-password\" placeholder=\"Nhập mật khẩu mới nếu muốn đổi\" class=\"input-sm\" style=\"width:100%; box-sizing:border-box;\">",
    "            </div>",
    "            <div id=\"modal-edit-user-role-team-group\" style=\"${user.username === 'admin' ? 'display: none;' : ''}\">",
    "                <div class=\"form-group\" style=\"margin-bottom: 15px;\">",
    "                    <label style=\"display:block;margin-bottom:6px;font-weight:600;\">Vai trò</label>",
    "                    <select id=\"modal-user-role\" class=\"input-sm\" style=\"width:100%; box-sizing:border-box;\">",
    "                        <option value=\"employee\" ${user.role === 'employee' ? 'selected' : ''}>Nhân viên (Điện thoại)</option>",
    "                        <option value=\"admin\" ${user.role === 'admin' ? 'selected' : ''}>Quản lý (Desktop)</option>",
    "                    </select>",
    "                </div>",
    "                <div class=\"form-group\" id=\"modal-edit-user-manager-group\" style=\"margin-bottom: 0;\">",
    "                    <label style=\"display:block;margin-bottom:6px;font-weight:600;\">Team</label>",
    "                    <select id=\"modal-user-team\" class=\"input-sm\" style=\"width:100%; box-sizing:border-box;\">",
    "                        <option value=\"\">-- Chưa phân team --</option>",
    "                        ${TEAMS.map(teamName => `<option value=\"${teamName}\" ${user.team === teamName ? 'selected' : ''}>${teamName}</option>`).join('')}",
    "                    </select>",
    "                </div>",
    "            </div>",
    "        </form>`;",
    "",
    "        showModal('Sửa thông tin nhân viên', body, [",
    "            { text: 'Hủy', class: 'btn-ghost' },",
    "            { text: 'Lưu', class: 'btn btn-primary btn-sm', action: async () => {",
    "                const fullname = document.getElementById('modal-user-fullname').value.trim();",
    "                const username = document.getElementById('modal-user-username').value.trim();",
    "                const password = document.getElementById('modal-user-password').value;",
    "                const role = document.getElementById('modal-user-role') ? document.getElementById('modal-user-role').value : user.role;",
    "                const team = document.getElementById('modal-user-team') ? document.getElementById('modal-user-team').value : user.team;",
    "",
    "                if (!fullname || !username) return showToast('Vui lòng điền họ tên và tên đăng nhập!', 'error');",
    "                if (username.length < 3) return showToast('Tên đăng nhập tối thiểu 3 ký tự!', 'error');",
    "",
    "                const payload = { fullname, username, role, team };"
].join('\n');

if (code.includes(editDialogTarget)) {
    code = code.replace(editDialogTarget, editDialogReplacement);
    console.log('editUserDialog updated successfully.');
} else {
    console.error('Failed to locate editUserDialog target.');
}

// Convert back to original line endings if there were any
fs.writeFileSync(targetPath, code.replace(/\n/g, '\r\n'), 'utf8');
console.log('Edits written to file.');
