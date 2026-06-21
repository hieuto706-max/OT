const TEAMS = ["Team 1", "Team 2"];

function renderModalTeamsRows() {
    if (!TEAMS || TEAMS.length === 0) {
        return '<tr class="empty-row"><td colspan="3" style="text-align:center;">Chưa có team nào được thiết lập</td></tr>';
    }
    return TEAMS.map((teamName, index) => `
        <tr>
            <td style="text-align:center;">${index + 1}</td>
            <td><strong>${teamName}</strong></td>
            <td style="text-align:center;">
                <button class="btn-icon-only edit" onclick="renameTeamFromModal('${teamName}')" title="Đổi tên" style="margin-right: 4px; padding: 4px; border: 1px solid rgba(255, 255, 255, 0.05); background: rgba(255, 255, 255, 0.02); border-radius: 6px; cursor: pointer;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                </button>
                <button class="btn-icon-only delete" onclick="deleteTeamFromModal('${teamName}')" title="Xóa" style="padding: 4px; border: 1px solid rgba(255, 255, 255, 0.05); background: rgba(255, 255, 255, 0.02); border-radius: 6px; cursor: pointer;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2-2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2 2v2"/>
                    </svg>
                </button>
            </td>
        </tr>
    `).join('');
}

console.log(renderModalTeamsRows());
