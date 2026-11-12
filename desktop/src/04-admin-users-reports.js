async function refreshAdminUsers(cachedUsers, cachedRecords) {
    try {
        const currentUser = JSON.parse(localStorage.getItem('ot_current_user') || 'null');
        const isSuperAdmin = currentUser && (currentUser.username === 'admin' || currentUser.isSuperAdmin);
        const isBelongToAdminTeam = currentUser && (currentUser.team === 'admin' || currentUser.username === 'admin' || currentUser.isSuperAdmin);

        let users;
        let records;

        if (cachedUsers && cachedRecords) {
            users = cachedUsers;
            records = cachedRecords;
        } else {
            const usersData = await api('/api/users');
            users = usersData.users;
            const currentMonth = getCurrentMonth();
            const recData = await api(`/api/records?month=${currentMonth}`);
            records = recData.records;
        }

        // Filter users
        const employees = users.filter(u => u.role === 'employee');
        const managers = users.filter(u => u.role === 'admin');

        // Render employees
        const tbodyEmp = document.getElementById('admin-users-body');
        tbodyEmp.innerHTML = employees.map((u, i) => {
            const userRecords = records.filter(r => r.userId === u.id);
            const totalOT = userRecords.reduce((sum, r) => sum + r.totalHours, 0);

            // Nút reset liên kết thiết bị
            let deviceUnlinkBtn = '';
            if (u.deviceId || u.browserDeviceId) {
                deviceUnlinkBtn = `
                    <button class="btn-reset btn-reset-mobile" onclick="showUnlinkOptions('${u.id}', '${u.fullname}', ${!!u.deviceId}, ${!!u.browserDeviceId})" title="Hủy liên kết thiết bị" style="margin-right: 4px;">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                            <path d="M18.36 6.64a9 9 0 1 1-12.73 0"/>
                            <line x1="12" y1="2" x2="12" y2="12"/>
                        </svg>
                        Hủy liên kết
                    </button>
                `;
            }
            let browserUnlinkBtn = '';
            let approveBtn = '';
            if (u.pendingUnlink) {
                approveBtn = `
                    <button class="btn-reset btn-reset-approve" onclick="approveUnlinkDevice('${u.id}', '${u.fullname}')" title="Duyệt yêu cầu huỷ liên kết" style="margin-right: 4px;">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                            <polyline points="20 6 9 17 4 12"/>
                        </svg>
                        Duyệt Huỷ
                    </button>
                    <button class="btn-reset btn-reset-reject" onclick="rejectUnlinkDevice('${u.id}', '${u.fullname}')" title="Từ chối yêu cầu huỷ liên kết" style="margin-right: 4px;">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                            <line x1="18" y1="6" x2="6" y2="18"/>
                            <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                        Từ Chối
                    </button>
                `;
            }

            const unlinkBadge = u.pendingUnlink ? `
                <span class="unlink-badge" style="display:inline-block; font-size:0.75rem; background:rgba(239, 68, 68, 0.15); color:#ef4444; border:1px solid rgba(239, 68, 68, 0.3); padding:2px 8px; border-radius:12px; font-weight:700; margin-left:8px; animation: blink-red 1.5s infinite; cursor:pointer;" onclick="approveUnlinkDevice('${u.id}', '${u.fullname}')" title="Bấm vào đây để phê duyệt huỷ liên kết thiết bị">
                    ⚠️ Xin huỷ liên kết
                </span>
            ` : '';

            return `<tr>
                <td>${i + 1}</td>
                <td><strong>${u.fullname}</strong>${unlinkBadge}</td>
                <td>${u.username}</td>
                <td><span style="font-weight:600; color:var(--text-secondary);">${u.team || 'Chưa phân team'}</span></td>
                <td><span class="tag tag-employee">Nhân viên</span></td>
                <td><span class="text-purple text-bold">${totalOT.toFixed(1)}h</span></td>
                <td><div class="action-buttons">
                    ${approveBtn}
                    ${deviceUnlinkBtn}
                    ${browserUnlinkBtn}
                    ${(!u.team || u.team !== 'admin' || isBelongToAdminTeam || (currentUser && currentUser.id === u.id)) ? `
                    <button class="btn-icon-only edit" onclick="editUserDialog('${u.id}')" title="Sửa" style="margin-right: 4px;">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                    </button>
                    ` : ''}
                    ${(!u.team || u.team !== 'admin' || isBelongToAdminTeam) ? `
                    <button class="btn-icon-only delete" onclick="deleteUser('${u.id}')" title="Xóa">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                            <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                    </button>
                    ` : ''}
                </div></td>
            </tr>`;
        }).join('') || `<tr class="empty-row">
            <td colspan="7" style="padding: 80px 16px; text-align: center; background: rgba(255,255,255,0.01); border: 1px dashed rgba(255,255,255,0.06); border-radius: 8px;">
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="48" height="48" style="color: var(--text-muted); opacity: 0.6;">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                        <circle cx="9" cy="7" r="4"/>
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                        <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                    </svg>
                    <span style="font-size: 15px; font-weight: 600; color: var(--text-secondary);">Không có nhân viên</span>
                    <span style="font-size: 13px; color: var(--text-muted);">Hiện tại chưa có nhân viên nào trong danh sách.</span>
                </div>
            </td>
        </tr>`;

        // Render managers (admins)
        const tbodyMgr = document.getElementById('admin-managers-body');
        tbodyMgr.innerHTML = managers.map((u, i) => {
            const userRecords = records.filter(r => r.userId === u.id);
            const totalOT = userRecords.reduce((sum, r) => sum + (r.totalHours || 0), 0);
            return `<tr>
                <td>${i + 1}</td>
                <td><strong>${u.fullname}</strong></td>
                <td>${u.username}</td>
                <td><span style="font-weight:600; color:var(--text-secondary);">${u.team === 'admin' ? 'admin' : (u.team || 'admin')}</span></td>
                <td><span class="tag tag-admin">Quản lý</span></td>
                <td><span class="text-purple text-bold">${totalOT.toFixed(1)}h</span></td>
                <td><div class="action-buttons">
                    ${(isSuperAdmin && (currentUser && currentUser.id !== u.id)) ? `
                    <button class="btn-icon-only edit" onclick="editUserDialog('${u.id}')" title="Sửa" style="margin-right: 4px;">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                    </button>
                    ` : ''}
                    ${(isSuperAdmin && !u.isSuperAdmin && u.username !== 'admin') ? `
                        <button class="btn-icon-only delete" onclick="deleteUser('${u.id}')" title="Xóa">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                                <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                            </svg>
                        </button>
                    ` : ''}
                </div></td>
            </tr>`;
        }).join('') || `<tr class="empty-row">
            <td colspan="7" style="padding: 80px 16px; text-align: center; background: rgba(255,255,255,0.01); border: 1px dashed rgba(255,255,255,0.06); border-radius: 8px;">
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="48" height="48" style="color: var(--text-muted); opacity: 0.6;">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                        <circle cx="12" cy="7" r="4"/>
                    </svg>
                    <span style="font-size: 15px; font-weight: 600; color: var(--text-secondary);">Không có quản lý</span>
                    <span style="font-size: 13px; color: var(--text-muted);">Không tìm thấy tài khoản quản lý nào.</span>
                </div>
            </td>
        </tr>`;

        // Render unassigned employees
        const tbodyUnassigned = document.getElementById('admin-users-unassigned-body');
        const unassigned = employees.filter(u => !u.team || u.team === 'unassigned');
        if (tbodyUnassigned) {
            tbodyUnassigned.innerHTML = unassigned.map((u, i) => {
                const userRecords = records.filter(r => r.userId === u.id);
                const totalOT = userRecords.reduce((sum, r) => sum + r.totalHours, 0);

                let deviceUnlinkBtn = '';
                if (u.deviceId || u.browserDeviceId) {
                    deviceUnlinkBtn = `
                        <button class="btn-reset btn-reset-mobile" onclick="showUnlinkOptions('${u.id}', '${u.fullname}', ${!!u.deviceId}, ${!!u.browserDeviceId})" title="Hủy liên kết thiết bị" style="margin-right: 4px;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                                <path d="M18.36 6.64a9 9 0 1 1-12.73 0"/>
                                <line x1="12" y1="2" x2="12" y2="12"/>
                            </svg>
                            Hủy liên kết
                        </button>
                    `;
                }
                let browserUnlinkBtn = '';
                let approveBtn = '';
                if (u.pendingUnlink) {
                    approveBtn = `
                        <button class="btn-reset btn-reset-approve" onclick="approveUnlinkDevice('${u.id}', '${u.fullname}')" title="Duyệt yêu cầu huỷ liên kết" style="margin-right: 4px;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                                <polyline points="20 6 9 17 4 12"/>
                            </svg>
                            Duyệt Huỷ
                        </button>
                        <button class="btn-reset btn-reset-reject" onclick="rejectUnlinkDevice('${u.id}', '${u.fullname}')" title="Từ chối yêu cầu huỷ liên kết" style="margin-right: 4px;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                                <line x1="18" y1="6" x2="6" y2="18"/>
                                <line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                            Từ Chối
                        </button>
                    `;
                }

                const unlinkBadge = u.pendingUnlink ? `
                    <span class="unlink-badge" style="display:inline-block; font-size:0.75rem; background:rgba(239, 68, 68, 0.15); color:#ef4444; border:1px solid rgba(239, 68, 68, 0.3); padding:2px 8px; border-radius:12px; font-weight:700; margin-left:8px; animation: blink-red 1.5s infinite; cursor:pointer;" onclick="approveUnlinkDevice('${u.id}', '${u.fullname}')" title="Bấm vào đây để phê duyệt huỷ liên kết thiết bị">
                        ⚠️ Xin huỷ liên kết
                    </span>
                ` : '';

                return `<tr>
                    <td>${i + 1}</td>
                    <td><strong>${u.fullname}</strong>${unlinkBadge}</td>
                    <td>${u.username}</td>
                    <td><span style="font-weight:600; color:var(--text-secondary);">${u.team || 'Chưa phân team'}</span></td>
                    <td><span class="tag tag-employee">Nhân viên</span></td>
                    <td><span class="text-purple text-bold">${totalOT.toFixed(1)}h</span></td>
                    <td><div class="action-buttons">
                        ${approveBtn}
                        ${deviceUnlinkBtn}
                        ${browserUnlinkBtn}
                        ${(!u.team || u.team !== 'admin' || isBelongToAdminTeam || (currentUser && currentUser.id === u.id)) ? `
                        <button class="btn-icon-only edit" onclick="editUserDialog('${u.id}')" title="Sửa" style="margin-right: 4px;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                        </button>
                        ` : ''}
                        ${(!u.team || u.team !== 'admin' || isBelongToAdminTeam) ? `
                        <button class="btn-icon-only delete" onclick="deleteUser('${u.id}')" title="Xóa">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                                <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                            </svg>
                        </button>
                        ` : ''}
                    </div></td>
                </tr>`;
            }).join('') || `<tr class="empty-row">
                <td colspan="7" style="padding: 80px 16px; text-align: center; background: rgba(255,255,255,0.01); border: 1px dashed rgba(255,255,255,0.06); border-radius: 8px;">
                    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px;">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="48" height="48" style="color: var(--text-muted); opacity: 0.6;">
                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                            <circle cx="9" cy="7" r="4"/>
                            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                        </svg>
                        <span style="font-size: 15px; font-weight: 600; color: var(--text-secondary);">Không có nhân viên chưa phân team</span>
                        <span style="font-size: 13px; color: var(--text-muted);">Tất cả nhân viên đã được phân bổ vào các nhóm làm việc.</span>
                    </div>
                </td>
            </tr>`;
        }

        // Show/hide unassigned warning alert
        const warningAlert = document.getElementById('unassigned-warning-alert');
        if (warningAlert) {
            if (unassigned.length > 0) {
                warningAlert.style.display = 'flex';
            } else {
                warningAlert.style.display = 'none';
            }
        }

        // Update badge for unassigned sub-tab
        const badgeUnassigned = document.getElementById('badge-sub-unassigned');
        if (badgeUnassigned) {
            if (unassigned.length > 0) {
                badgeUnassigned.textContent = unassigned.length;
                badgeUnassigned.style.display = 'inline-block';
            } else {
                badgeUnassigned.style.display = 'none';
            }
        }

    } catch (e) {}
}

// SVG Chart Renderers for Report Redesign
function renderTeamBarChart(teamOTs) {
    const entries = Object.entries(teamOTs).sort((a, b) => b[1] - a[1]);
    const totalHours = entries.reduce((sum, e) => sum + e[1], 0);
    if (entries.length === 0 || totalHours === 0) {
        return `<div class="chart-empty">Chưa có dữ liệu đội nhóm</div>`;
    }
    const maxVal = Math.max(...entries.map(e => e[1])) || 1;
    const width = 400;
    const rowHeight = 24;
    const paddingLeft = 110;
    const paddingRight = 60;
    const chartHeight = entries.length * rowHeight + 20;
    
    let svgHtml = `<svg width="100%" height="${chartHeight}" viewBox="0 0 ${width} ${chartHeight}" style="font-family: inherit;">`;
    
    // Gradients definition
    svgHtml += `
        <defs>
            <linearGradient id="barGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#0dd98b" stop-opacity="0.6"/>
                <stop offset="100%" stop-color="#0dd98b" stop-opacity="0.95"/>
            </linearGradient>
        </defs>`;
        
    entries.forEach(([team, val], idx) => {
        const y = idx * rowHeight + 10;
        const barMaxWidth = width - paddingLeft - paddingRight;
        const barWidth = (val / maxVal) * barMaxWidth;
        const displayTeam = team.length > 14 ? team.substring(0, 12) + '..' : team;
        
        // Team label
        svgHtml += `<text x="${paddingLeft - 10}" y="${y + 15}" fill="var(--text-secondary)" font-size="11" font-weight="500" text-anchor="end">${displayTeam}</text>`;
        // Background bar track
        svgHtml += `<rect x="${paddingLeft}" y="${y + 4}" width="${barMaxWidth}" height="12" rx="4" fill="rgba(255,255,255,0.03)" />`;
        // Value bar
        svgHtml += `<rect x="${paddingLeft}" y="${y + 4}" width="${barWidth}" height="12" rx="4" fill="url(#barGrad)" />`;
        // Value text
        svgHtml += `<text x="${paddingLeft + barWidth + 8}" y="${y + 14}" fill="var(--accent-green)" font-size="11" font-weight="bold">${val.toFixed(1)}h</text>`;
    });
    
    svgHtml += `</svg>`;
    return svgHtml;
}

function renderTrendLineChart(dailyOTs, month) {
    const entries = Object.entries(dailyOTs).sort((a, b) => a[0].localeCompare(b[0]));
    const values = entries.map(e => e[1]);
    const maxVal = Math.max(...values) || 1;
    const width = 480;
    const height = 120;
    const paddingLeft = 30;
    const paddingRight = 15;
    const paddingTop = 15;
    const paddingBottom = 22;
    
    const chartWidth = width - paddingLeft - paddingRight;
    const chartHeight = height - paddingTop - paddingBottom;
    
    const allZero = values.every(v => v === 0);
    if (allZero) {
        return `<div class="chart-empty">Chưa có dữ liệu xu hướng ngày</div>`;
    }
    
    let points = [];
    entries.forEach(([date, val], idx) => {
        const x = paddingLeft + (idx / (entries.length - 1)) * chartWidth;
        const y = paddingTop + chartHeight - (val / maxVal) * chartHeight;
        points.push(`${x},${y}`);
    });
    
    const pointsStr = points.join(' ');
    // Area polygon points under the line chart
    const firstPoint = points[0].split(',');
    const lastPoint = points[points.length - 1].split(',');
    const areaPointsStr = `${firstPoint[0]},${paddingTop + chartHeight} ${pointsStr} ${lastPoint[0]},${paddingTop + chartHeight}`;
    
    let svgHtml = `<svg width="100%" height="100%" viewBox="0 0 ${width} ${height}" style="font-family: inherit;">`;
    
    // Gradients definition
    svgHtml += `
        <defs>
            <linearGradient id="areaGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stop-color="#a855f7" stop-opacity="0.25"/>
                <stop offset="100%" stop-color="#a855f7" stop-opacity="0.0"/>
            </linearGradient>
            <linearGradient id="lineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#0dd98b"/>
                <stop offset="50%" stop-color="#a855f7"/>
                <stop offset="100%" stop-color="#3b82f6"/>
            </linearGradient>
        </defs>`;
        
    // Horizontal gridlines
    for (let i = 0; i <= 4; i++) {
        const y = paddingTop + (i / 4) * chartHeight;
        const label = (maxVal - (i / 4) * maxVal).toFixed(1) + 'h';
        svgHtml += `<line x1="${paddingLeft}" y1="${y}" x2="${width - paddingRight}" y2="${y}" stroke="rgba(255,255,255,0.05)" stroke-width="1" stroke-dasharray="2,2" />`;
        svgHtml += `<text x="${paddingLeft - 8}" y="${y + 4}" fill="var(--text-muted)" font-size="9" text-anchor="end">${label}</text>`;
    }
    
    // Area under path
    svgHtml += `<polygon points="${areaPointsStr}" fill="url(#areaGrad)" />`;
    
    // Trend line
    svgHtml += `<polyline points="${pointsStr}" fill="none" stroke="url(#lineGrad)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />`;
    
    // Key days (label start, mid, end days)
    const labelY = height - 10;
    svgHtml += `<text x="${paddingLeft}" y="${labelY}" fill="var(--text-muted)" font-size="9" text-anchor="start">Ngày 1</text>`;
    svgHtml += `<text x="${paddingLeft + chartWidth / 2}" y="${labelY}" fill="var(--text-muted)" font-size="9" text-anchor="middle">Ngày 15</text>`;
    svgHtml += `<text x="${width - paddingRight}" y="${labelY}" fill="var(--text-muted)" font-size="9" text-anchor="end">Ngày ${entries.length}</text>`;
    
    svgHtml += `</svg>`;
    return svgHtml;
}

// Expandable Detail Row Handler
window.toggleReportRow = function(row, userId) {
    const nextRow = row.nextElementSibling;
    const isExpanded = row.classList.contains('expanded');
    
    // Collapse all other detail rows first to keep layout clean
    document.querySelectorAll('.report-row.expanded').forEach(r => {
        if (r !== row) {
            r.classList.remove('expanded');
            if (r.nextElementSibling && r.nextElementSibling.classList.contains('detail-row')) {
                r.nextElementSibling.remove();
            }
        }
    });
    
    if (isExpanded) {
        row.classList.remove('expanded');
        if (nextRow && nextRow.classList.contains('detail-row')) {
            nextRow.remove();
        }
    } else {
        row.classList.add('expanded');
        const month = document.getElementById('report-filter-month').value;
        
        api(`/api/records?userId=${userId}&month=${month}`).then(data => {
            const detailedRecords = (data.records || []).filter(r => {
                const isBf = r.isBackfill || (r.note && (r.note.includes('[BÙ THÁNG TRƯỚC]') || r.note.includes('[TĂNG THÁNG NÀY]')));
                return isBf ? true : r.date.startsWith(month);
            });
            const holidays = (currentSystemSettings.holidays || "")
                .split(',')
                .map(d => d.trim())
                .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d));

            const detailRow = document.createElement('tr');
            detailRow.className = 'detail-row';
            
            let recordsHtml = '';
            if (detailedRecords.length === 0) {
                recordsHtml = '<div style="padding: 12px; color: var(--text-muted); text-align: center; font-style: italic;">Không có chi tiết tăng ca cho tháng này.</div>';
            } else {
                recordsHtml = `
                    <div class="report-detail-wrapper" style="padding: 16px 24px; background: rgba(0,0,0,0.18); margin: 6px 12px; border-radius: 8px;">
                        <h5 style="margin-top: 0; margin-bottom: 12px; color: var(--accent-green); font-size: 11px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase;">Chi tiết lịch sử làm thêm giờ</h5>
                        <table class="detail-table" style="width: 100%; border-collapse: collapse; font-size: 12px;">
                            <thead>
                                <tr style="border-bottom: 1px solid rgba(255,255,255,0.08); text-align: left;">
                                    <th style="color: var(--text-secondary); font-weight: 600;">Ngày làm việc</th>
                                    <th style="color: var(--text-secondary); font-weight: 600;">Hệ số</th>
                                    <th style="color: var(--text-secondary); font-weight: 600;">Giờ thực tế</th>
                                    <th style="color: var(--text-secondary); font-weight: 600;">Giờ quy đổi</th>
                                    <th style="color: var(--text-secondary); font-weight: 600;">Tuyến đường (Xe tỉnh)</th>
                                    <th style="color: var(--text-secondary); font-weight: 600;">Trạng thái</th>
                                    <th style="color: var(--text-secondary); font-weight: 600;">Ghi chú</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${detailedRecords.map(r => {
                                    const coef = getOTCoefficient(r.date, holidays);
                                    let coefText = '';
                                    if (coef === 3.0) {
                                        coefText = '<span style="font-weight:700;color:var(--accent-red);">3.0 (Lễ)</span>';
                                    } else if (coef === 2.0) {
                                        coefText = '<span style="font-weight:700;color:var(--accent-orange);">2.0 (CN)</span>';
                                    } else {
                                        coefText = '<span style="color:var(--text-secondary);">1.5 (Thường)</span>';
                                    }
                                    const actualHours = r.totalHours || 0;
                                    const eqHours = actualHours * coef;
                                    
                                    const province = escapeHTML(r.deliveryProvince || '-');
                                    const safeRecNote = escapeHTML(r.note || '');
                                    const statusText = r.status === 'approved' ? '<span class="tag tag-success">Đã duyệt</span>' : (r.status === 'pending' ? '<span class="tag tag-warning">Đang chờ</span>' : '<span class="tag tag-danger">Từ chối</span>');
                                    const isBackfillText = r.isBackfill ? '<span style="font-size: 9px; padding: 2px 5px; background: rgba(245,158,11,0.15); color: var(--accent-orange); border-radius: 4px; font-weight: 800; margin-left: 6px;">BÙ</span>' : '';
                                    return `
                                        <tr style="border-bottom: 1px solid rgba(255,255,255,0.04);">
                                            <td><strong>${formatDate(r.date)}</strong>${isBackfillText}</td>
                                            <td>${coefText}</td>
                                            <td><strong>${parseFloat(actualHours.toFixed(2))}</strong> giờ</td>
                                            <td><strong style="color:var(--accent-green);">${parseFloat(eqHours.toFixed(2))}</strong> giờ</td>
                                            <td><span style="color: var(--text-primary);">${province}</span></td>
                                            <td>${statusText}</td>
                                            <td style="max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${safeRecNote}">${safeRecNote || '-'}</td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                `;
            }
            
            const cell = document.createElement('td');
            cell.colSpan = 8;
            cell.innerHTML = recordsHtml;
            detailRow.appendChild(cell);
            
            row.parentNode.insertBefore(detailRow, row.nextSibling);
        }).catch(err => {
            console.error('Error fetching details:', err);
            showToast('Lỗi khi tải chi tiết', 'error');
        });
    }
};

async function refreshReport(cachedUsers, cachedRecords) {
    const month = document.getElementById('report-filter-month').value;
    const filterTeam = document.getElementById('report-filter-team') ? document.getElementById('report-filter-team').value : '';
    const searchVal = document.getElementById('report-search-name') ? document.getElementById('report-search-name').value : '';
    
    try {
        const currentUser = JSON.parse(localStorage.getItem('ot_current_user') || 'null');
        const isAdmin = currentUser && (currentUser.username === 'admin' || currentUser.isSuperAdmin);
        
        let users;
        if (cachedUsers) {
            users = cachedUsers.filter(u => u.role === 'employee');
        } else {
            const usersData = await api('/api/users');
            users = usersData.users.filter(u => u.role === 'employee');
        }
        
        if (isAdmin) {
            if (filterTeam) {
                users = users.filter(u => {
                    const userTeam = u.team || '';
                    if (filterTeam === 'unassigned') {
                        return userTeam === '' || userTeam === 'unassigned';
                    }
                    return userTeam === filterTeam;
                });
            }
        } else {
            const managerTeam = currentUser ? (currentUser.team || '') : '';
            users = users.filter(u => u.team && u.team === managerTeam);
        }

        let rawRecords;
        const currentMonth = getCurrentMonth();
        if (month === currentMonth && cachedRecords) {
            rawRecords = cachedRecords;
        } else {
            const recData = await api(`/api/records?month=${month}`);
            rawRecords = (recData.records || []).filter(r => {
                const isBf = r.isBackfill || (r.note && (r.note.includes('[BÙ THÁNG TRƯỚC]') || r.note.includes('[TĂNG THÁNG NÀY]')));
                return isBf ? true : r.date.startsWith(month);
            });
        }
        const records = rawRecords.filter(r => {
            const isBackfill = r.isBackfill || (r.note && (r.note.includes('[BÙ THÁNG TRƯỚC]') || r.note.includes('[TĂNG THÁNG NÀY]')));
            return r.status === 'approved' || (!isBackfill && r.status !== 'pending' && r.status !== 'rejected');
        });
        
        // --- 1. Compute Overall Dashboard KPI Stats & Charts (prior to search filtration) ---
        let totalOTHours = 0;
        let activeEmployeesSet = new Set();
        const teamOTs = {};
        const dailyOTs = {};
        
        // Initialize daily trend map
        const year = parseInt(month.substring(0, 4));
        const monthVal = parseInt(month.substring(5, 7));
        const daysInMonth = new Date(year, monthVal, 0).getDate();
        for (let d = 1; d <= daysInMonth; d++) {
            const dayStr = `${month}-${String(d).padStart(2, '0')}`;
            dailyOTs[dayStr] = 0;
        }

        users.forEach(u => {
            const ur = records.filter(r => r.userId === u.id);
            const lunchH = ur.filter(r => r.hasLunchOT).length * OT_LUNCH_HOURS;
            const eveningH = ur.reduce((s, r) => s + (r.eveningOTHours || 0), 0);
            const totalH = ur.reduce((s, r) => s + (r.totalHours || 0), 0);
            
            if (totalH > 0) {
                totalOTHours += totalH;
                activeEmployeesSet.add(u.id);
            }
            
            // Team stats
            const teamName = u.team === 'admin' ? 'admin' : (u.team || 'Chưa phân team');
            teamOTs[teamName] = (teamOTs[teamName] || 0) + totalH;
        });
        
        // Sum daily trend
        records.forEach(r => {
            const belongsToMatchingUser = users.some(u => u.id === r.userId);
            if (belongsToMatchingUser && dailyOTs[r.date] !== undefined) {
                dailyOTs[r.date] += (r.totalHours || 0);
            }
        });
        
        // Find top team
        let topTeam = '-';
        let maxTeamHours = 0;
        Object.entries(teamOTs).forEach(([team, val]) => {
            if (val > maxTeamHours) {
                maxTeamHours = val;
                topTeam = `${team} (${parseFloat(val.toFixed(2))}h)`;
            }
        });
        
        // Update DOM KPIs
        const activeCount = activeEmployeesSet.size;
        const avgHours = activeCount > 0 ? (totalOTHours / activeCount) : 0;
        
        document.getElementById('rep-stat-total-hours').textContent = `${parseFloat(totalOTHours.toFixed(2))}h`;
        document.getElementById('rep-stat-avg-hours').textContent = `${parseFloat(avgHours.toFixed(2))}h`;
        document.getElementById('rep-stat-active-users').textContent = activeCount.toString();
        const topTeamEl = document.getElementById('rep-stat-top-team');
        topTeamEl.textContent = topTeam;
        topTeamEl.title = topTeam;
        


        // --- 2. Filter list by search query & Calculate Row Data ---
        let filteredUsers = [...users];
        if (searchVal) {
            const query = searchVal.toLowerCase().trim();
            filteredUsers = filteredUsers.filter(u => u.fullname.toLowerCase().includes(query) || (u.team && u.team.toLowerCase().includes(query)));
        }
        
        const userReportData = filteredUsers.map(u => {
            const ur = records.filter(r => r.userId === u.id);
            const days = ur.length;
            const lunchH = ur.filter(r => r.hasLunchOT).length * OT_LUNCH_HOURS;
            const eveningH = ur.reduce((s, r) => s + (r.eveningOTHours || 0), 0);
            const totalH = ur.reduce((s, r) => s + (r.totalHours || 0), 0);
            return { user: u, days, lunchH, eveningH, totalH };
        });
        
        // --- 3. Sorting ---
        userReportData.sort((a, b) => {
            let valA, valB;
            if (reportSortColumn === 'name') {
                valA = a.user.fullname.toLowerCase();
                valB = b.user.fullname.toLowerCase();
            } else if (reportSortColumn === 'days') {
                valA = a.days;
                valB = b.days;
            } else { // 'total'
                valA = a.totalH;
                valB = b.totalH;
            }
            
            if (valA < valB) return reportSortOrder === 'asc' ? -1 : 1;
            if (valA > valB) return reportSortOrder === 'asc' ? 1 : -1;
            return 0;
        });

        // Update Sorting Indicators
        ['name', 'days', 'total'].forEach(col => {
            const ind = document.getElementById(`sort-ind-${col}`);
            if (ind) {
                ind.className = 'sort-indicator';
                if (reportSortColumn === col) {
                    ind.classList.add(reportSortOrder);
                }
            }
        });

        // --- 4. Render Table Body ---
        const tbody = document.getElementById('report-body');
        if (userReportData.length === 0) {
            tbody.innerHTML = '<tr class="empty-row"><td colspan="7">Không tìm thấy kết quả phù hợp</td></tr>';
            return;
        }

        tbody.innerHTML = userReportData.map((data, i) => {
            const { user: u, days, lunchH, eveningH, totalH } = data;
            const teamName = u.team === 'admin' ? 'admin' : (u.team || 'Chưa phân team');

            return `<tr class="report-row" onclick="toggleReportRow(this, '${u.id}')">
                <td>${i + 1}</td>
                <td>
                    <div class="employee-name-cell">
                        <svg class="chevron-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                        <strong>${u.fullname}</strong>
                    </div>
                </td>
                <td><span class="tag" style="background: rgba(156,163,175,0.1); color: var(--text-primary);">${teamName}</span></td>
                <td style="text-align: center;">${days} ngày</td>
                <td style="text-align: center;">${parseFloat(lunchH.toFixed(2))}h</td>
                <td style="text-align: center;">${parseFloat(eveningH.toFixed(2))}h</td>
                <td style="text-align: center;"><span class="text-purple text-bold" style="font-size: 13px;">${parseFloat(totalH.toFixed(2))}h</span></td>
            </tr>`;
        }).join('');
        
        // Vẽ biểu đồ phân tích trực quan
        try {
            renderAnalyticsCharts(teamOTs, dailyOTs);
        } catch (err) {
            console.error("Lỗi vẽ biểu đồ phân tích:", err);
        }
    } catch (e) {
        console.error('Lỗi khi vẽ báo cáo:', e);
    }
}

function renderAnalyticsCharts(teamOTs, dailyOTs) {
    // 1. Vẽ biểu đồ cột ngang theo Team
    const teamBarsContainer = document.getElementById('chart-teams-bars');
    if (teamBarsContainer) {
        const teamEntries = Object.entries(teamOTs).sort((a, b) => b[1] - a[1]); // Sắp xếp giảm dần
        const maxHours = teamEntries.length > 0 ? Math.max(...teamEntries.map(e => e[1])) : 0;
        
        if (teamEntries.length === 0 || maxHours === 0) {
            teamBarsContainer.innerHTML = '<div style="text-align: center; color: #71717a; padding: 20px 0; font-size: 0.9rem;">Không có dữ liệu tăng ca</div>';
        } else {
            teamBarsContainer.innerHTML = teamEntries.map(([team, hours]) => {
                const percent = maxHours > 0 ? (hours / maxHours) * 100 : 0;
                return `
                    <div class="chart-team-row">
                        <span class="chart-team-label" title="${team}">${team}</span>
                        <div class="chart-team-progress-wrapper">
                            <div class="chart-team-progress" style="width: ${percent}%;"></div>
                        </div>
                        <span class="chart-team-value">${parseFloat(hours.toFixed(2))}h</span>
                    </div>
                `;
            }).join('');
        }
    }

    // 2. Vẽ biểu đồ xu hướng theo ngày của tháng
    const daysTrendContainer = document.getElementById('chart-days-trend');
    if (daysTrendContainer) {
        const dailyEntries = Object.entries(dailyOTs).sort((a, b) => a[0].localeCompare(b[0])); // Ngày tăng dần
        const maxDailyHours = dailyEntries.length > 0 ? Math.max(...dailyEntries.map(e => e[1])) : 0;
        
        if (dailyEntries.length === 0 || maxDailyHours === 0) {
            daysTrendContainer.innerHTML = '<div style="text-align: center; color: #71717a; width: 100%; font-size: 0.9rem;">Không có dữ liệu biến động</div>';
        } else {
            daysTrendContainer.innerHTML = dailyEntries.map(([dateStr, hours]) => {
                const dayNum = parseInt(dateStr.substring(8, 10));
                const percent = maxDailyHours > 0 ? (hours / maxDailyHours) * 100 : 0;
                return `
                    <div class="chart-day-column">
                        <div class="chart-day-tooltip">Ngày ${dayNum}: ${parseFloat(hours.toFixed(2))}h</div>
                        <div class="chart-day-bar" style="--height: ${percent}%;"></div>
                        <span class="chart-day-label">${dayNum}</span>
                    </div>
                `;
            }).join('');
        }
    }
}

function deleteUser(userId) {
    showModal('Xóa nhân viên', 'Bạn có chắc muốn xóa nhân viên này?<br>Tất cả dữ liệu tăng ca cũng sẽ bị xóa.', [
        { text: 'Hủy', class: 'btn-ghost' },
        { text: 'Xóa', class: 'btn btn-danger btn-sm', action: async () => {
            try {
                await api(`/api/users/${userId}`, 'DELETE');
                await Promise.all([populateUserFilter(), refreshAdminUsers(), refreshAdminRecords(), refreshAdminStats(), refreshReport()]);
                showToast('Đã xóa nhân viên');
            } catch (e) { showToast(e.message, 'error'); }
        }}
    ]);
}

function deleteRecord(recordId, source) {
    showModal('Xóa bản ghi', 'Bạn có chắc muốn xóa bản ghi tăng ca này?', [
        { text: 'Hủy', class: 'btn-ghost' },
        { text: 'Xóa', class: 'btn btn-danger btn-sm', action: async () => {
            try {
                await api(`/api/records/${recordId}`, 'DELETE');
                if (source === 'admin') {
                    await Promise.all([refreshAdminRecords(), refreshAdminStats(), refreshReport()]);
                } else {
                    await refreshEmployeeRecords();
                }
                showToast('Đã xóa bản ghi');
            } catch (e) { showToast(e.message, 'error'); }
        }}
    ]);
}

async function approveRecord(recordId) {
    try {
        await api(`/api/records/${recordId}`, 'PUT', { status: 'approved' });
        showToast('Đã duyệt bản ghi tăng ca!');
        await Promise.all([refreshAdminRecords(), refreshAdminStats(), refreshReport()]);
    } catch (e) {
        showToast(e.message, 'error');
    }
}

async function rejectRecord(recordId) {
    showModal('Từ chối bản ghi', 'Bạn có chắc muốn từ chối bản ghi tăng ca này?', [
        { text: 'Hủy', class: 'btn-ghost' },
        { text: 'Từ chối', class: 'btn btn-danger btn-sm', action: async () => {
            try {
                await api(`/api/records/${recordId}`, 'PUT', { status: 'rejected' });
                await Promise.all([refreshAdminRecords(), refreshAdminStats(), refreshReport()]);
                showToast('Đã từ chối bản ghi');
            } catch (e) {
                showToast(e.message, 'error');
            }
        }}
    ]);
}

function updatePendingBulkActionsVisibility() {
    const chks = document.querySelectorAll('.chk-pending-record');
    const checkedChks = document.querySelectorAll('.chk-pending-record:checked');
    const selectAllChk = document.getElementById('chk-pending-select-all');
    
    if (selectAllChk) {
        selectAllChk.checked = chks.length > 0 && chks.length === checkedChks.length;
    }
    
    const bulkBar = document.getElementById('pending-bulk-actions');
    const countText = document.getElementById('pending-selected-count');
    
    if (bulkBar && countText) {
        if (checkedChks.length > 0) {
            bulkBar.style.display = 'flex';
            countText.textContent = `Đã chọn ${checkedChks.length} bản ghi`;
        } else {
            bulkBar.style.display = 'none';
        }
    }
}

async function bulkApproveRecords() {
    const checkedChks = document.querySelectorAll('.chk-pending-record:checked');
    const recordIds = Array.from(checkedChks).map(chk => chk.value);
    if (recordIds.length === 0) return;

    showModal('Duyệt hàng loạt', `Bạn có chắc chắn muốn duyệt ${recordIds.length} bản ghi đã chọn không?`, [
        { text: 'Hủy', class: 'btn-ghost' },
        { text: 'Duyệt', class: 'btn btn-primary btn-sm', action: async () => {
            try {
                showToast(`Đang duyệt ${recordIds.length} bản ghi...`, 'info');
                await Promise.all(recordIds.map(id => api(`/api/records/${id}`, 'PUT', { status: 'approved' })));
                showToast(`Đã duyệt thành công ${recordIds.length} bản ghi!`);
                await Promise.all([refreshAdminRecords(), refreshAdminStats(), refreshReport()]);
            } catch (e) {
                showToast(e.message, 'error');
            }
        }}
    ]);
}

async function bulkRejectRecords() {
    const checkedChks = document.querySelectorAll('.chk-pending-record:checked');
    const recordIds = Array.from(checkedChks).map(chk => chk.value);
    if (recordIds.length === 0) return;

    showModal('Từ chối hàng loạt', `Bạn có chắc chắn muốn từ chối ${recordIds.length} bản ghi đã chọn không?`, [
        { text: 'Hủy', class: 'btn-ghost' },
        { text: 'Từ chối', class: 'btn btn-danger btn-sm', action: async () => {
            try {
                showToast(`Đang từ chối ${recordIds.length} bản ghi...`, 'info');
                await Promise.all(recordIds.map(id => api(`/api/records/${id}`, 'PUT', { status: 'rejected' })));
                showToast(`Đã từ chối thành công ${recordIds.length} bản ghi!`);
                await Promise.all([refreshAdminRecords(), refreshAdminStats(), refreshReport()]);
            } catch (e) {
                showToast(e.message, 'error');
            }
        }}
    ]);
}

function updateRejectedBulkActionsVisibility() {
    const chks = document.querySelectorAll('.chk-rejected-record');
    const checkedChks = document.querySelectorAll('.chk-rejected-record:checked');
    const selectAllChk = document.getElementById('chk-rejected-select-all');
    
    if (selectAllChk) {
        selectAllChk.checked = chks.length > 0 && chks.length === checkedChks.length;
    }
    
    const bulkBar = document.getElementById('rejected-bulk-actions');
    const countText = document.getElementById('rejected-selected-count');
    
    if (bulkBar && countText) {
        if (checkedChks.length > 0) {
            bulkBar.style.display = 'flex';
            countText.textContent = `Đã chọn ${checkedChks.length} bản ghi`;
        } else {
            bulkBar.style.display = 'none';
        }
    }
}

async function bulkApproveRejectedRecords() {
    const checkedChks = document.querySelectorAll('.chk-rejected-record:checked');
    const recordIds = Array.from(checkedChks).map(chk => chk.value);
    if (recordIds.length === 0) return;

    showModal('Duyệt lại hàng loạt', `Bạn có chắc chắn muốn duyệt lại ${recordIds.length} bản ghi đã chọn không?`, [
        { text: 'Hủy', class: 'btn-ghost' },
        { text: 'Duyệt lại', class: 'btn btn-primary btn-sm', action: async () => {
            try {
                showToast(`Đang duyệt lại ${recordIds.length} bản ghi...`, 'info');
                await Promise.all(recordIds.map(id => api(`/api/records/${id}`, 'PUT', { status: 'approved' })));
                showToast(`Đã duyệt lại thành công ${recordIds.length} bản ghi!`);
                await Promise.all([refreshAdminRecords(), refreshAdminStats(), refreshReport()]);
            } catch (e) {
                showToast(e.message, 'error');
            }
        }}
    ]);
}

async function bulkDeleteRejectedRecords() {
    const checkedChks = document.querySelectorAll('.chk-rejected-record:checked');
    const recordIds = Array.from(checkedChks).map(chk => chk.value);
    if (recordIds.length === 0) return;

    showModal('Xóa hàng loạt', `Bạn có chắc chắn muốn xóa vĩnh viễn ${recordIds.length} bản ghi đã chọn không?`, [
        { text: 'Hủy', class: 'btn-ghost' },
        { text: 'Xóa', class: 'btn btn-danger btn-sm', action: async () => {
            try {
                showToast(`Đang xóa ${recordIds.length} bản ghi...`, 'info');
                await Promise.all(recordIds.map(id => api(`/api/records/${id}`, 'DELETE')));
                showToast(`Đã xóa thành công ${recordIds.length} bản ghi!`);
                await Promise.all([refreshAdminRecords(), refreshAdminStats(), refreshReport()]);
            } catch (e) {
                showToast(e.message, 'error');
            }
        }}
    ]);
}
