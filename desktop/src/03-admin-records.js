function initSseConnection() {
    if (window.sseSource) {
        window.sseSource.close();
    }
    
    const sse = new EventSource(`${API_BASE}/api/events`);
    window.sseSource = sse;
    
    sse.onmessage = function(event) {
        try {
            const data = JSON.parse(event.data);
            if (data.type === 'update') {
                const currentUser = JSON.parse(localStorage.getItem('ot_current_user') || 'null');
                if (currentUser && currentUser.role === 'admin') {
                    // Tự động làm mới dữ liệu khi có cập nhật từ điện thoại
                    refreshAdminRecords();
                    refreshAdminStats();
                    refreshReport();
                    refreshAdminUsers();
                }
            }
        } catch (e) {
            console.error('Lỗi xử lý sự kiện SSE:', e);
        }
    };
    
    sse.onerror = function() {
        console.warn('Mất kết nối SSE, đang thử kết nối lại...');
    };
}

async function loadMobileInfo() {
    try {
        const info = await api('/api/server-info');
        const el = document.getElementById('mobile-url');
        if (el) el.textContent = info.url;
        const el2 = document.getElementById('mobile-url-link');
        if (el2) el2.href = info.url;

        const qrContainer = document.getElementById('mobile-qr-container');
        const qrImg = document.getElementById('mobile-qr');
        if (qrContainer && qrImg && info.url) {
            qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(info.url)}`;
            qrContainer.style.display = 'flex';
        }
    } catch (e) {}
}

async function populateUserFilter(cachedUsers) {
    const select = document.getElementById('admin-filter-user');
    const adminOtUser = document.getElementById('admin-ot-user');
    try {
        let users;
        if (cachedUsers) {
            users = cachedUsers;
        } else {
            const data = await api('/api/users');
            users = data.users;
        }
        loadedUsers = users;
        users.sort((a, b) => a.fullname.localeCompare(b.fullname, 'vi'));

        const currentUser = JSON.parse(localStorage.getItem('ot_current_user') || 'null');
        const isSuperAdmin = currentUser && (currentUser.username === 'admin' || currentUser.isSuperAdmin);
        const managerTeam = currentUser ? (currentUser.team || '') : '';

        if (select) {
            select.innerHTML = '<option value="">Tất cả</option>';
            users.forEach(u => {
                if (isSuperAdmin) {
                    select.innerHTML += `<option value="${u.id}">${u.fullname}</option>`;
                } else {
                    if ((u.role === 'employee' && u.team === managerTeam) || (currentUser && u.id === currentUser.id)) {
                        select.innerHTML += `<option value="${u.id}">${u.fullname}</option>`;
                    }
                }
            });
        }
        if (adminOtUser) {
            adminOtUser.innerHTML = '<option value="">-- Chọn nhân viên --</option>';
            users.filter(u => u.role === 'employee').forEach(u => {
                if (isSuperAdmin) {
                    adminOtUser.innerHTML += `<option value="${u.id}">${u.fullname}</option>`;
                } else {
                    if (u.team === managerTeam) {
                        adminOtUser.innerHTML += `<option value="${u.id}">${u.fullname}</option>`;
                    }
                }
            });
        }
    } catch (e) {}
}

async function refreshAdminStats(cachedStats) {
    try {
        let stats = cachedStats;
        if (!stats) {
            const adminFilterMonthEl = document.getElementById('admin-filter-month');
            const month = adminFilterMonthEl ? adminFilterMonthEl.value : '';
            stats = await api(`/api/stats?month=${month}`);
        }
        document.getElementById('stat-total-users').textContent = stats.totalUsers;
        
        // Update Pending OT
        const pendingOTVal = stats.pendingOT || 0;
        document.getElementById('stat-pending-ot').textContent = pendingOTVal;
        const cardPendingOT = document.getElementById('stat-card-pending-ot');
        const dotPendingOT = document.getElementById('dot-pending-ot');
        if (cardPendingOT && dotPendingOT) {
            if (pendingOTVal > 0) {
                cardPendingOT.classList.add('has-pending');
                dotPendingOT.style.display = 'inline-block';
            } else {
                cardPendingOT.classList.remove('has-pending');
                dotPendingOT.style.display = 'none';
            }
        }

        // Update Pending Unlinks
        const pendingUnlinksVal = stats.pendingUnlinks || 0;
        document.getElementById('stat-pending-unlinks').textContent = pendingUnlinksVal;
        const cardPendingUnlinks = document.getElementById('stat-card-pending-unlinks');
        const dotPendingUnlinks = document.getElementById('dot-pending-unlinks');
        if (cardPendingUnlinks && dotPendingUnlinks) {
            if (pendingUnlinksVal > 0) {
                cardPendingUnlinks.classList.add('has-pending');
                dotPendingUnlinks.style.display = 'inline-block';
            } else {
                cardPendingUnlinks.classList.remove('has-pending');
                dotPendingUnlinks.style.display = 'none';
            }
        }

        // Update sidebar unlinks badge
        const badgePendingUnlinks = document.getElementById('badge-pending-unlinks');
        if (badgePendingUnlinks) {
            if (pendingUnlinksVal > 0) {
                badgePendingUnlinks.textContent = pendingUnlinksVal;
                badgePendingUnlinks.style.display = 'inline-block';
            } else {
                badgePendingUnlinks.style.display = 'none';
            }
        }

        // Update bell badge count
        const totalPending = pendingOTVal + pendingUnlinksVal;
        const bellBadge = document.getElementById('bell-badge-count');
        if (bellBadge) {
            if (totalPending > 0) {
                bellBadge.textContent = totalPending;
                bellBadge.style.display = 'block';
            } else {
                bellBadge.style.display = 'none';
            }
        }

        document.getElementById('stat-total-ot').textContent = stats.totalOTMonth.toFixed(1);
        const tripsEl = document.getElementById('stat-total-trips');
        if (tripsEl) tripsEl.textContent = stats.totalTripsMonth || 0;

        let statsLabel = 'Tổng chuyến xe (Đã duyệt)';
        if (isAdmin) {
            const hasCustomActivities = typeof TEAMS !== 'undefined' && TEAMS.some(t => typeof t === 'object' && t.customActivities && t.customActivities.length > 0);
            if (hasCustomActivities) {
                statsLabel = 'Tổng hoạt động khác (Đã duyệt)';
            }
        } else {
            const managerTeam = currentUser ? (currentUser.team || '') : '';
            if (managerTeam && typeof TEAMS !== 'undefined') {
                const teamObj = TEAMS.find(t => typeof t === 'object' && t.name === managerTeam);
                const hasCustomActivities = !!(teamObj && teamObj.customActivities && teamObj.customActivities.length > 0);
                if (hasCustomActivities) {
                    const activityNames = teamObj.customActivities.map(a => a.name).join(' / ');
                    statsLabel = `Tổng ${activityNames} (Đã duyệt)`;
                }
            }
        }

        const labelEl = document.getElementById('stat-total-trips-label');
        if (labelEl) labelEl.textContent = statsLabel;
    } catch (e) {}
}

async function refreshAdminRecords(cachedRecords, cachedUsers) {
    let month = document.getElementById('admin-filter-month').value;
    const dateFilter = document.getElementById('admin-filter-date') ? document.getElementById('admin-filter-date').value : '';
    const userId = document.getElementById('admin-filter-user').value;
    const searchUser = document.getElementById('admin-search-user').value.toLowerCase().trim();
    const searchNote = document.getElementById('admin-search-note').value.toLowerCase().trim();
    const filterTeam = document.getElementById('admin-filter-team') ? document.getElementById('admin-filter-team').value : '';

    if (dateFilter) {
        month = dateFilter.substring(0, 7);
    }

    try {
        let records;
        let users;

        const isDefaultFilter = !dateFilter && !userId && !searchUser && !searchNote && !filterTeam;
        const resetFilterBtn = document.getElementById('btn-reset-records-filter');
        if (resetFilterBtn) {
            resetFilterBtn.style.display = isDefaultFilter ? 'none' : 'inline-flex';
        }

        if (isDefaultFilter && cachedRecords && cachedUsers) {
            records = [...cachedRecords];
            users = cachedUsers;
            // Sắp xếp các bản ghi mới nhất lên đầu
            records.sort((a, b) => b.date.localeCompare(a.date));
        } else {
            const approvedTbody = document.getElementById('admin-records-approved-body');
            if (approvedTbody && (!loadedRecords || loadedRecords.length === 0 || month !== window._lastRenderedAdminMonth)) {
                approvedTbody.innerHTML = [1, 2, 3, 4].map(() => `
                    <tr>
                        <td><span class="skeleton-cell" style="width:120px;"></span></td>
                        <td><span class="skeleton-cell" style="width:70px;"></span></td>
                        <td><span class="skeleton-cell" style="width:80px;"></span></td>
                        <td><span class="skeleton-cell" style="width:45px;"></span></td>
                        <td><span class="skeleton-cell" style="width:45px;"></span></td>
                        <td><span class="skeleton-cell" style="width:90px;"></span></td>
                        <td><span class="skeleton-cell" style="width:50px;"></span></td>
                        <td><span class="skeleton-cell" style="width:65px;"></span></td>
                        <td><span class="skeleton-cell" style="width:140px;"></span></td>
                        <td><span class="skeleton-cell" style="width:70px;"></span></td>
                        <td><span class="skeleton-cell" style="width:60px;"></span></td>
                    </tr>
                `).join('');
            }

            let url = '/api/records?';
            if (month) url += `month=${month}&`;
            if (userId) url += `userId=${userId}&`;

            const data = await api(url);
            records = data.records;
            const usersData = await api('/api/users');
            users = usersData.users;
        }
        window._lastRenderedAdminMonth = month;
        loadedRecords = records;
        loadedUsers = users;
        const currentUser = JSON.parse(localStorage.getItem('ot_current_user') || 'null');
        const isAdmin = currentUser && (currentUser.username === 'admin' || currentUser.isSuperAdmin);

        let hasCustomActivities = false;
        let adminBtnText = 'Hoạt động khác';
        if (isAdmin) {
            if (filterTeam && filterTeam !== 'unassigned' && typeof TEAMS !== 'undefined') {
                const teamObj = TEAMS.find(t => typeof t === 'object' && t.name === filterTeam);
                hasCustomActivities = !!(teamObj && teamObj.customActivities && teamObj.customActivities.length > 0);
                if (hasCustomActivities) {
                    adminBtnText = teamObj.customActivities.map(a => a.name).join(' / ');
                }
            } else if (typeof TEAMS !== 'undefined') {
                hasCustomActivities = TEAMS.some(t => typeof t === 'object' && t.customActivities && t.customActivities.length > 0);
                if (hasCustomActivities) {
                    const allActs = [];
                    TEAMS.forEach(t => {
                        if (typeof t === 'object' && t.customActivities) {
                            t.customActivities.forEach(a => {
                                if (!allActs.includes(a.name)) allActs.push(a.name);
                            });
                        }
                    });
                    if (allActs.length > 0 && allActs.length <= 3) {
                        adminBtnText = allActs.join(' / ');
                    } else {
                        adminBtnText = 'Hoạt động khác';
                    }
                }
            }
        } else {
            const managerTeam = currentUser ? (currentUser.team || '') : '';
            if (managerTeam && typeof TEAMS !== 'undefined') {
                const teamObj = TEAMS.find(t => typeof t === 'object' && t.name === managerTeam);
                hasCustomActivities = !!(teamObj && teamObj.customActivities && teamObj.customActivities.length > 0);
                if (hasCustomActivities) {
                    adminBtnText = teamObj.customActivities.map(a => a.name).join(' / ');
                }
            }
        }

        const adminRecTypeSelector = document.getElementById('admin-rec-type-selector');
        const btnAdminRecTypeTrips = document.getElementById('btn-admin-rec-type-trips');
        if (hasCustomActivities) {
            if (adminRecTypeSelector) adminRecTypeSelector.style.display = 'inline-flex';
            if (btnAdminRecTypeTrips) {
                btnAdminRecTypeTrips.style.display = 'inline-block';
                btnAdminRecTypeTrips.textContent = adminBtnText;
            }
        } else {
            if (adminRecTypeSelector) adminRecTypeSelector.style.display = 'none';
            currentAdminRecType = 'ot';
        }

        const holidays = (currentSystemSettings.holidays || "")
            .split(',')
            .map(d => d.trim())
            .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d));

        const filteredRecords = records.filter(r => {
            const user = users.find(u => u.id === r.userId);
            const matchesUnifiedQuery = !searchUser || (
                (user && (
                    user.fullname.toLowerCase().includes(searchUser) ||
                    user.username.toLowerCase().includes(searchUser)
                )) ||
                (r.note && r.note.toLowerCase().includes(searchUser)) ||
                (r.deliveryProvince && r.deliveryProvince.toLowerCase().includes(searchUser)) ||
                (r.customActivity && r.customActivity.toLowerCase().includes(searchUser))
            );
            const matchesNote = !searchNote || (r.note && r.note.toLowerCase().includes(searchNote));
            const matchesUser = matchesUnifiedQuery;
            
            // Filter by Team
            let matchesTeam = true;
            if (isAdmin) {
                if (filterTeam) {
                    const userTeam = user ? (user.team || '') : '';
                    if (filterTeam === 'unassigned') {
                        matchesTeam = (userTeam === '' || userTeam === 'unassigned');
                    } else {
                        matchesTeam = (userTeam === filterTeam);
                    }
                }
            } else {
                // Manager: only see members of their own team (and themselves)
                const managerTeam = currentUser ? (currentUser.team || '') : '';
                const userTeam = user ? (user.team || '') : '';
                matchesTeam = (user && user.id === currentUser.id) || (userTeam && userTeam === managerTeam);
            }

            // Filter by Date
            const matchesDate = !dateFilter || r.date === dateFilter;

            return matchesUser && matchesNote && matchesTeam && matchesDate;
        });

        const approvedTbody = document.getElementById('admin-records-approved-body');
        const pendingTbody = document.getElementById('admin-records-pending-body');
        const rejectedTbody = document.getElementById('admin-records-rejected-body');

        // Apply Record Type Filter
        let recordsFiltered = [];
        if (currentAdminRecType === 'ot') {
            recordsFiltered = filteredRecords.filter(r => (!r.customActivity || r.customActivity.trim() === '') && (r.totalHours > 0 || r.isBackfill));
        } else {
            recordsFiltered = filteredRecords.filter(r => r.customActivity && r.customActivity.trim() !== '');
        }

        // Set Table Headers dynamically
        if (approvedTbody && approvedTbody.previousElementSibling) {
            if (currentAdminRecType === 'ot') {
                approvedTbody.previousElementSibling.innerHTML = `<tr>
                    <th>Nhân viên</th>
                    <th>Nhóm</th>
                    <th>Ngày</th>
                    <th>OT Trưa</th>
                    <th>OT Chiều</th>
                    <th>Khung giờ (Chiều)</th>
                    <th>Tổng OT (giờ)</th>
                    <th>Ghi chú</th>
                    <th>Trạng thái</th>
                    <th>Thao tác</th>
                </tr>`;
            } else {
                approvedTbody.previousElementSibling.innerHTML = `<tr>
                    <th>Nhân viên</th>
                    <th>Nhóm</th>
                    <th>Ngày</th>
                    <th>Hoạt động</th>
                    <th>Hình thức / Chi tiết</th>
                    <th>Ghi chú</th>
                    <th>Trạng thái</th>
                    <th>Thao tác</th>
                </tr>`;
            }
        }
        if (pendingTbody && pendingTbody.previousElementSibling) {
            if (currentAdminRecType === 'ot') {
                pendingTbody.previousElementSibling.innerHTML = `<tr>
                    <th style="width: 40px; text-align: center;"><input type="checkbox" id="chk-pending-select-all" style="width: 14px; height: 14px; margin: 0; cursor: pointer;"></th>
                    <th>Nhân viên</th>
                    <th>Nhóm</th>
                    <th>Ngày</th>
                    <th>OT Trưa</th>
                    <th>OT Chiều</th>
                    <th>Khung giờ (Chiều)</th>
                    <th>Tổng OT (giờ)</th>
                    <th>Ghi chú</th>
                    <th>Thao tác</th>
                </tr>`;
            } else {
                pendingTbody.previousElementSibling.innerHTML = `<tr>
                    <th style="width: 40px; text-align: center;"><input type="checkbox" id="chk-pending-select-all" style="width: 14px; height: 14px; margin: 0; cursor: pointer;"></th>
                    <th>Nhân viên</th>
                    <th>Nhóm</th>
                    <th>Ngày</th>
                    <th>Hoạt động</th>
                    <th>Hình thức / Chi tiết</th>
                    <th>Ghi chú</th>
                    <th>Thao tác</th>
                </tr>`;
            }
        }
        if (rejectedTbody && rejectedTbody.previousElementSibling) {
            if (currentAdminRecType === 'ot') {
                rejectedTbody.previousElementSibling.innerHTML = `<tr>
                    <th style="width: 40px; text-align: center;"><input type="checkbox" id="chk-rejected-select-all" style="width: 14px; height: 14px; margin: 0; cursor: pointer;"></th>
                    <th>Nhân viên</th>
                    <th>Nhóm</th>
                    <th>Ngày</th>
                    <th>OT Trưa</th>
                    <th>OT Chiều</th>
                    <th>Khung giờ (Chiều)</th>
                    <th>Tổng OT (giờ)</th>
                    <th>Ghi chú</th>
                    <th>Thao tác</th>
                </tr>`;
            } else {
                rejectedTbody.previousElementSibling.innerHTML = `<tr>
                    <th style="width: 40px; text-align: center;"><input type="checkbox" id="chk-rejected-select-all" style="width: 14px; height: 14px; margin: 0; cursor: pointer;"></th>
                    <th>Nhân viên</th>
                    <th>Nhóm</th>
                    <th>Ngày</th>
                    <th>Hoạt động</th>
                    <th>Hình thức / Chi tiết</th>
                    <th>Ghi chú</th>
                    <th>Thao tác</th>
                </tr>`;
            }
        }

        const approved = recordsFiltered.filter(r => r.status === 'approved' || (!r.isBackfill && r.status !== 'pending' && r.status !== 'rejected'));
        const pending = recordsFiltered.filter(r => r.status === 'pending');
        const rejected = recordsFiltered.filter(r => r.status === 'rejected');

        // Render Approved
        if (approved.length === 0) {
            const cols = (currentAdminRecType === 'ot') ? 10 : 8;
            approvedTbody.innerHTML = `
                <tr class="empty-row">
                    <td colspan="${cols}" style="padding: 80px 16px; text-align: center; background: rgba(255,255,255,0.01); border: 1px dashed rgba(255,255,255,0.06); border-radius: 8px;">
                        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="48" height="48" style="color: var(--text-muted); opacity: 0.6;">
                                <circle cx="12" cy="12" r="10"/>
                                <line x1="8" y1="12" x2="16" y2="12"/>
                            </svg>
                            <span style="font-size: 15px; font-weight: 600; color: var(--text-secondary);">Không có dữ liệu đã duyệt</span>
                            <span style="font-size: 13px; color: var(--text-muted);">Không tìm thấy bản ghi ${currentAdminRecType === 'ot' ? 'tăng ca' : 'hoạt động tùy chọn'} nào đã được duyệt trong tháng này.</span>
                        </div>
                    </td>
                </tr>
            `;
        } else {
            approvedTbody.innerHTML = approved.map(r => {
                const user = users.find(u => u.id === r.userId);
                const teamName = user ? (user.team === 'admin' ? 'admin' : (user.team || 'Chưa phân team')) : 'N/A';
                const isBackfill = r.isBackfill || (r.note && (r.note.includes('[BÙ THÁNG TRƯỚC]') || r.note.includes('[TĂNG THÁNG NÀY]')));
                const safeFullname = user ? escapeHTML(user.fullname) : 'N/A';
                const safeUsername = user ? escapeHTML(user.username) : 'N/A';
                const safeAvatar = user && user.fullname ? escapeHTML(user.fullname.charAt(0).toUpperCase()) : 'N';
                const employeeCell = `
                    <div class="user-profile-cell">
                        <div class="avatar-mini">${safeAvatar}</div>
                        <div class="user-details">
                            <span class="user-fullname">${safeFullname}</span>
                            <span class="user-username">@${safeUsername}</span>
                        </div>
                    </div>
                `;
                const teamBadge = `<span class="tag-team">${escapeHTML(teamName)}</span>`;
                const safeNote = escapeHTML(r.note);
                const noteDisplay = r.note ? `<span class="text-note" title="${safeNote}">${safeNote}</span>` : '<span class="text-muted">—</span>';

                if (currentAdminRecType === 'ot') {
                    const timeRange = (r.otStart || r.otEnd) ? `<span class="text-time">${escapeHTML(r.otStart) || '—'}</span> <span class="text-arrow">→</span> <span class="text-time">${escapeHTML(r.otEnd) || '—'}</span>` : '<span class="text-muted">—</span>';
                    const totalOtBadge = `<span class="badge-total-ot">${r.totalHours.toFixed(1)}h</span>`;
                    return `<tr>
                        <td>${employeeCell}</td>
                        <td>${teamBadge}</td>
                        <td><span class="text-date">${formatDate(r.date)}</span></td>
                        <td>${r.hasLunchOT ? '<span class="tag tag-yes">✓ Có</span>' : '<span class="tag tag-no">Không</span>'}</td>
                        <td>${r.eveningOTHours > 0 ? `<span class="text-green text-bold">${r.eveningOTHours.toFixed(1)}h</span>` : '<span class="text-muted">—</span>'}</td>
                        <td>${timeRange}</td>
                        <td>${totalOtBadge}</td>
                        <td>${noteDisplay}</td>
                        <td>${isBackfill ? '<span class="tag tag-yes" style="background:rgba(16,185,129,0.1); color:#10b981;">Bù tăng ca</span>' : '<span class="tag tag-no" style="background:rgba(99,102,241,0.1); color:#6366f1;">Thường</span>'}</td>
                        <td><div class="action-buttons">
                            <button class="btn-icon-only edit" onclick="editRecordDialog('${r.id}', 'admin')" title="Sửa" style="margin-right: 4px;">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                    <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                </svg>
                            </button>
                            <button class="btn-icon-only delete" onclick="deleteRecord('${r.id}', 'admin')" title="Xóa">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                                    <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2-2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                                </svg>
                            </button>
                        </div></td>
                    </tr>`;
                } else {
                    const detail = r.calcMode === 'trip' 
                        ? `<span class="tag" style="background: rgba(245,158,11,0.15); color: #f59e0b; border: 1px solid rgba(245,158,11,0.3); font-weight: 500;">🚚 ${escapeHTML(r.deliveryProvince || 'Chưa rõ')}</span>` 
                        : `<span class="tag" style="background: rgba(99,102,241,0.15); color: #6366f1; border: 1px solid rgba(99,102,241,0.3); font-weight: 500;">⏱️ ${r.totalHours.toFixed(1)}h</span>`;
                    
                    let badgeClass = 'status-approved';
                    let badgeText = 'Đã duyệt';
                    if (r.status === 'pending') {
                        badgeClass = 'status-pending';
                        badgeText = 'Chờ duyệt';
                    } else if (r.status === 'rejected') {
                        badgeClass = 'status-rejected';
                        badgeText = 'Từ chối';
                    }

                    return `<tr>
                        <td>${employeeCell}</td>
                        <td>${teamBadge}</td>
                        <td><span class="text-date">${formatDate(r.date)}</span></td>
                        <td><strong>${escapeHTML(r.customActivity)}</strong></td>
                        <td>${detail}</td>
                        <td>${noteDisplay}</td>
                        <td><span class="status-badge ${badgeClass}">${badgeText}</span></td>
                        <td><div class="action-buttons">
                            <button class="btn-icon-only edit" onclick="editRecordDialog('${r.id}', 'admin')" title="Sửa" style="margin-right: 4px;">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                    <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                </svg>
                            </button>
                            <button class="btn-icon-only delete" onclick="deleteRecord('${r.id}', 'admin')" title="Xóa">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                                    <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2-2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                                </svg>
                            </button>
                        </div></td>
                    </tr>`;
                }
            }).join('');
        }

        // Render Pending
        if (pending.length === 0) {
            const cols = (currentAdminRecType === 'ot') ? 10 : 8;
            pendingTbody.innerHTML = `
                <tr class="empty-row">
                    <td colspan="${cols}" style="padding: 80px 16px; text-align: center; background: rgba(255,255,255,0.01); border: 1px dashed rgba(255,255,255,0.06); border-radius: 8px;">
                        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="48" height="48" style="color: var(--accent-green-light); opacity: 0.8;">
                                <circle cx="12" cy="12" r="10"/>
                                <line x1="12" y1="8" x2="12" y2="12"/>
                                <line x1="12" y1="16" x2="12.01" y2="16"/>
                            </svg>
                            <span style="font-size: 15px; font-weight: 600; color: var(--text-primary);">Không có yêu cầu chờ duyệt</span>
                            <span style="font-size: 13px; color: var(--text-muted);">Tất cả yêu cầu ${currentAdminRecType === 'ot' ? 'tăng ca' : 'hoạt động tùy chọn'} đã được xử lý xong.</span>
                        </div>
                    </td>
                </tr>
            `;
        } else {
            pendingTbody.innerHTML = pending.map(r => {
                const user = users.find(u => u.id === r.userId);
                const teamName = user ? (user.team === 'admin' ? 'admin' : (user.team || 'Chưa phân team')) : 'N/A';
                const safeFullname = user ? escapeHTML(user.fullname) : 'N/A';
                const safeUsername = user ? escapeHTML(user.username) : 'N/A';
                const safeAvatar = user && user.fullname ? escapeHTML(user.fullname.charAt(0).toUpperCase()) : 'N';
                const employeeCell = `
                    <div class="user-profile-cell">
                        <div class="avatar-mini">${safeAvatar}</div>
                        <div class="user-details">
                            <span class="user-fullname">${safeFullname}</span>
                            <span class="user-username">@${safeUsername}</span>
                        </div>
                    </div>
                `;
                const teamBadge = `<span class="tag-team">${escapeHTML(teamName)}</span>`;
                const safeNote = escapeHTML(r.note);
                const noteDisplay = r.note ? `<span class="text-note" title="${safeNote}">${safeNote}</span>` : '<span class="text-muted">—</span>';

                if (currentAdminRecType === 'ot') {
                    const timeRange = (r.otStart || r.otEnd) ? `<span class="text-time">${escapeHTML(r.otStart) || '—'}</span> <span class="text-arrow">→</span> <span class="text-time">${escapeHTML(r.otEnd) || '—'}</span>` : '<span class="text-muted">—</span>';
                    const totalOtBadge = `<span class="badge-total-ot">${r.totalHours.toFixed(1)}h</span>`;
                    return `<tr>
                        <td style="text-align: center;"><input type="checkbox" class="chk-pending-record" value="${r.id}" style="width: 14px; height: 14px; margin: 0; cursor: pointer;" onchange="updatePendingBulkActionsVisibility()"></td>
                        <td>${employeeCell}</td>
                        <td>${teamBadge}</td>
                        <td><span class="text-date">${formatDate(r.date)}</span></td>
                        <td>${r.hasLunchOT ? '<span class="tag tag-yes">✓ Có</span>' : '<span class="tag tag-no">Không</span>'}</td>
                        <td>${r.eveningOTHours > 0 ? `<span class="text-green text-bold">${r.eveningOTHours.toFixed(1)}h</span>` : '<span class="text-muted">—</span>'}</td>
                        <td>${timeRange}</td>
                        <td>${totalOtBadge}</td>
                        <td>${noteDisplay}</td>
                        <td><div class="action-buttons">
                            <button class="btn btn-green btn-xs" onclick="approveRecord('${r.id}')" title="Duyệt" style="margin-right: 4px; padding: 4px 8px; font-size: 11px;">
                                ✓ Duyệt
                            </button>
                            <button class="btn btn-danger btn-xs" onclick="rejectRecord('${r.id}')" title="Từ chối" style="padding: 4px 8px; font-size: 11px;">
                                ✕ Từ chối
                            </button>
                        </div></td>
                    </tr>`;
                } else {
                    const detail = r.calcMode === 'trip' 
                        ? `<span class="tag" style="background: rgba(245,158,11,0.15); color: #f59e0b; border: 1px solid rgba(245,158,11,0.3); font-weight: 500;">🚚 ${escapeHTML(r.deliveryProvince || 'Chưa rõ')}</span>` 
                        : `<span class="tag" style="background: rgba(99,102,241,0.15); color: #6366f1; border: 1px solid rgba(99,102,241,0.3); font-weight: 500;">⏱️ ${r.totalHours.toFixed(1)}h</span>`;
                    return `<tr>
                        <td style="text-align: center;"><input type="checkbox" class="chk-pending-record" value="${r.id}" style="width: 14px; height: 14px; margin: 0; cursor: pointer;" onchange="updatePendingBulkActionsVisibility()"></td>
                        <td>${employeeCell}</td>
                        <td>${teamBadge}</td>
                        <td><span class="text-date">${formatDate(r.date)}</span></td>
                        <td><strong>${escapeHTML(r.customActivity)}</strong></td>
                        <td>${detail}</td>
                        <td>${noteDisplay}</td>
                        <td><div class="action-buttons">
                            <button class="btn btn-green btn-xs" onclick="approveRecord('${r.id}')" title="Duyệt" style="margin-right: 4px; padding: 4px 8px; font-size: 11px;">
                                ✓ Duyệt
                            </button>
                            <button class="btn btn-danger btn-xs" onclick="rejectRecord('${r.id}')" title="Từ chối" style="padding: 4px 8px; font-size: 11px;">
                                ✕ Từ chối
                            </button>
                        </div></td>
                    </tr>`;
                }
            }).join('');
        }

        // Render Rejected
        if (rejected.length === 0) {
            const cols = (currentAdminRecType === 'ot') ? 10 : 8;
            rejectedTbody.innerHTML = `
                <tr class="empty-row">
                    <td colspan="${cols}" style="padding: 80px 16px; text-align: center; background: rgba(255,255,255,0.01); border: 1px dashed rgba(255,255,255,0.06); border-radius: 8px;">
                        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="48" height="48" style="color: #ef4444; opacity: 0.7;">
                                <circle cx="12" cy="12" r="10"/>
                                <line x1="15" y1="9" x2="9" y2="15"/>
                                <line x1="9" y1="9" x2="15" y2="15"/>
                            </svg>
                            <span style="font-size: 15px; font-weight: 600; color: var(--text-secondary);">Không có bản ghi bị từ chối</span>
                            <span style="font-size: 13px; color: var(--text-muted);">Không có yêu cầu ${currentAdminRecType === 'ot' ? 'tăng ca' : 'hoạt động tùy chọn'} nào bị từ chối duyệt.</span>
                        </div>
                    </td>
                </tr>
            `;
        } else {
            rejectedTbody.innerHTML = rejected.map(r => {
                const user = users.find(u => u.id === r.userId);
                const teamName = user ? (user.team === 'admin' ? 'admin' : (user.team || 'Chưa phân team')) : 'N/A';
                const safeFullname = user ? escapeHTML(user.fullname) : 'N/A';
                const safeUsername = user ? escapeHTML(user.username) : 'N/A';
                const safeAvatar = user && user.fullname ? escapeHTML(user.fullname.charAt(0).toUpperCase()) : 'N';
                const employeeCell = `
                    <div class="user-profile-cell">
                        <div class="avatar-mini">${safeAvatar}</div>
                        <div class="user-details">
                            <span class="user-fullname">${safeFullname}</span>
                            <span class="user-username">@${safeUsername}</span>
                        </div>
                    </div>
                `;
                const teamBadge = `<span class="tag-team">${escapeHTML(teamName)}</span>`;
                const safeNote = escapeHTML(r.note);
                const noteDisplay = r.note ? `<span class="text-note" title="${safeNote}">${safeNote}</span>` : '<span class="text-muted">—</span>';
 
                if (currentAdminRecType === 'ot') {
                    const timeRange = (r.otStart || r.otEnd) ? `<span class="text-time">${escapeHTML(r.otStart) || '—'}</span> <span class="text-arrow">→</span> <span class="text-time">${escapeHTML(r.otEnd) || '—'}</span>` : '<span class="text-muted">—</span>';
                    const totalOtBadge = `<span class="badge-total-ot">${r.totalHours.toFixed(1)}h</span>`;
                    return `<tr>
                        <td style="text-align: center;"><input type="checkbox" class="chk-rejected-record" value="${r.id}" style="width: 14px; height: 14px; margin: 0; cursor: pointer;" onchange="updateRejectedBulkActionsVisibility()"></td>
                        <td>${employeeCell}</td>
                        <td>${teamBadge}</td>
                        <td><span class="text-date">${formatDate(r.date)}</span></td>
                        <td>${r.hasLunchOT ? '<span class="tag tag-yes">✓ Có</span>' : '<span class="tag tag-no">Không</span>'}</td>
                        <td>${r.eveningOTHours > 0 ? `<span class="text-green text-bold">${r.eveningOTHours.toFixed(1)}h</span>` : '<span class="text-muted">—</span>'}</td>
                        <td>${timeRange}</td>
                        <td>${totalOtBadge}</td>
                        <td>${noteDisplay}</td>
                        <td><div class="action-buttons" style="display: flex; align-items: center; gap: 8px;">
                            <button class="btn btn-primary btn-xs" onclick="approveRecord('${r.id}')" title="Duyệt lại" style="padding: 4px 8px; font-size: 11px;">
                                ✓ Duyệt lại
                            </button>
                            <button class="btn-icon-only delete" onclick="deleteRecord('${r.id}', 'admin')" title="Xóa" style="padding: 2px; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); border-radius: 4px; color: #ef4444; cursor: pointer;">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13" height="13">
                                    <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                                </svg>
                            </button>
                        </div></td>
                    </tr>`;
                } else {
                    const detail = r.calcMode === 'trip' 
                        ? `<span class="tag" style="background: rgba(245,158,11,0.15); color: #f59e0b; border: 1px solid rgba(245,158,11,0.3); font-weight: 500;">🚚 ${escapeHTML(r.deliveryProvince || 'Chưa rõ')}</span>` 
                        : `<span class="tag" style="background: rgba(99,102,241,0.15); color: #6366f1; border: 1px solid rgba(99,102,241,0.3); font-weight: 500;">⏱️ ${r.totalHours.toFixed(1)}h</span>`;
                    return `<tr>
                        <td style="text-align: center;"><input type="checkbox" class="chk-rejected-record" value="${r.id}" style="width: 14px; height: 14px; margin: 0; cursor: pointer;" onchange="updateRejectedBulkActionsVisibility()"></td>
                        <td>${employeeCell}</td>
                        <td>${teamBadge}</td>
                        <td><span class="text-date">${formatDate(r.date)}</span></td>
                        <td><strong>${escapeHTML(r.customActivity)}</strong></td>
                        <td>${detail}</td>
                        <td>${noteDisplay}</td>
                        <td><div class="action-buttons" style="display: flex; align-items: center; gap: 8px;">
                            <button class="btn btn-primary btn-xs" onclick="approveRecord('${r.id}')" title="Duyệt lại" style="padding: 4px 8px; font-size: 11px;">
                                ✓ Duyệt lại
                            </button>
                            <button class="btn-icon-only delete" onclick="deleteRecord('${r.id}', 'admin')" title="Xóa" style="padding: 2px; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); border-radius: 4px; color: #ef4444; cursor: pointer;">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13" height="13">
                                    <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                                </svg>
                            </button>
                        </div></td>
                    </tr>`;
                }
            }).join('');
        }

        // Stats & Badges
        const approvedAll = filteredRecords.filter(r => r.status === 'approved' || (!r.isBackfill && r.status !== 'pending' && r.status !== 'rejected'));
        let totalLunchOT = 0, totalEveningOT = 0, totalHours = 0, totalTrips = 0;
        approvedAll.forEach(r => {
            totalLunchOT += r.hasLunchOT ? OT_LUNCH_HOURS : 0;
            totalEveningOT += r.eveningOTHours || 0;
            totalHours += r.totalHours || 0;
            if (r.deliveryProvince && r.deliveryProvince.trim() !== '') {
                totalTrips++;
            }
        });

        const badgePendingRecords = document.getElementById('badge-pending-records');
        if (badgePendingRecords) {
            if (pending.length > 0) {
                badgePendingRecords.textContent = pending.length;
                badgePendingRecords.style.display = 'inline-block';
            } else {
                badgePendingRecords.style.display = 'none';
            }
        }

        const badgeSubPending = document.getElementById('badge-sub-pending');
        if (badgeSubPending) {
            if (pending.length > 0) {
                badgeSubPending.textContent = pending.length;
                badgeSubPending.style.display = 'inline-block';
            } else {
                badgeSubPending.style.display = 'none';
            }
        }

        const badgeSubRejected = document.getElementById('badge-sub-rejected');
        if (badgeSubRejected) {
            if (rejected.length > 0) {
                badgeSubRejected.textContent = rejected.length;
                badgeSubRejected.style.display = 'inline-block';
            } else {
                badgeSubRejected.style.display = 'none';
            }
        }

        document.getElementById('admin-table-summary').innerHTML = `
            <div class="summary-item"><span class="summary-label">Tổng bản ghi:</span><span class="summary-value">${approvedAll.length}</span></div>
            <div class="summary-item"><span class="summary-label">OT Trưa:</span><span class="summary-value">${totalLunchOT.toFixed(1)}h</span></div>
            <div class="summary-item"><span class="summary-label">OT Chiều:</span><span class="summary-value">${totalEveningOT.toFixed(1)}h</span></div>
            <div class="summary-item"><span class="summary-label">Tổng OT:</span><span class="summary-value">${totalHours.toFixed(1)}h</span></div>
            <div class="summary-item"><span class="summary-label">Tổng chuyến xe:</span><span class="summary-value">${totalTrips}</span></div>`;

        // Setup select-all checkbox event listener and hide bulk bar initially
        setTimeout(() => {
            const selectAllPendingChk = document.getElementById('chk-pending-select-all');
            if (selectAllPendingChk) {
                selectAllPendingChk.onclick = (e) => {
                    const chks = document.querySelectorAll('.chk-pending-record');
                    chks.forEach(chk => chk.checked = e.target.checked);
                    updatePendingBulkActionsVisibility();
                };
            }
            const pendingBulkBar = document.getElementById('pending-bulk-actions');
            if (pendingBulkBar) pendingBulkBar.style.display = 'none';

            const selectAllRejectedChk = document.getElementById('chk-rejected-select-all');
            if (selectAllRejectedChk) {
                selectAllRejectedChk.onclick = (e) => {
                    const chks = document.querySelectorAll('.chk-rejected-record');
                    chks.forEach(chk => chk.checked = e.target.checked);
                    updateRejectedBulkActionsVisibility();
                };
            }
            const rejectedBulkBar = document.getElementById('rejected-bulk-actions');
            if (rejectedBulkBar) rejectedBulkBar.style.display = 'none';
        }, 50);
    } catch (e) {
        console.error(e);
    }
}
