// ==================== SCREEN MANAGEMENT ====================
function showScreen(screenId) {
    if (screenId === 'screen-login') {
        document.documentElement.classList.remove('user-admin-logged-in', 'user-employee-logged-in');
    } else if (screenId === 'screen-admin') {
        document.documentElement.classList.add('user-admin-logged-in');
    } else if (screenId === 'screen-employee') {
        document.documentElement.classList.add('user-employee-logged-in');
    }
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
}

// ==================== AUTH ====================
async function handleEmployeeLogin(e) {
    e.preventDefault();
    const username = document.getElementById('login-username').value.trim();
    const errorEl = document.getElementById('login-error-emp');
    errorEl.textContent = '';

    const submitBtn = e.target.querySelector('button[type="submit"]');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.dataset.originalText = submitBtn.textContent;
        submitBtn.textContent = 'Đang đăng nhập...';
    }

    try {
        if (await isPrivateMode()) {
            errorEl.textContent = 'Hệ thống không cho phép đăng nhập từ trình duyệt ẩn danh (Incognito Mode) để đảm bảo an toàn thiết bị!';
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = submitBtn.dataset.originalText || 'Đăng nhập';
            }
            return;
        }

        const data = await api('/api/auth/login', 'POST', { username });
        const user = data.user;

        if (user.role !== 'employee') {
            errorEl.textContent = 'Tài khoản này không phải là nhân viên!';
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = submitBtn.dataset.originalText || 'Đăng nhập';
            }
            return;
        }

        const proceedLogin = (finalUser) => {
            hasManualLoginInThisPageLoad = true;
            try {
                window.sessionStorage.setItem('ot_session_active', 'true');
                window.sessionStorage.removeItem('ot_session_temp');
                ['ot_current_user', 'ot_login_date', 'ot_mobile_user', 'ot_login_time', 'ot_auth_token'].forEach(k => window.sessionStorage.removeItem(k));
            } catch (errStorage) {}
            localStorage.setItem('ot_current_user', JSON.stringify(finalUser));
            localStorage.setItem('ot_mobile_user', JSON.stringify(finalUser));
            if (data.token) localStorage.setItem('ot_auth_token', data.token);
            localStorage.setItem('ot_login_time', Date.now().toString());
            localStorage.setItem('ot_login_date', getSessionCycleDateStr());
            fetch(`${localServerUrl}/api/version`).then(r => r.json()).then(v => {
                localStorage.setItem('ot_app_version', v.version || '1.0.0');
            }).catch(() => {});

            initEmployeeDashboard(finalUser);
            showScreen('screen-employee');
            showToast(`Xin chào, ${finalUser.fullname}!`, 'info');
            e.target.reset();

            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = submitBtn.dataset.originalText || 'Đăng nhập';
            }
        };

        if (data.requireEmailSetup) {
            showEmailSetupOverlay(username, (verifiedEmail) => {
                user.email = verifiedEmail;
                proceedLogin(user);
            });
        } else {
            proceedLogin(user);
        }
    } catch (err) {
        errorEl.textContent = err.message;
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = submitBtn.dataset.originalText || 'Đăng nhập';
        }
    }
}

async function handleAdminLogin(e) {
    e.preventDefault();
    const username = document.getElementById('login-admin-username').value.trim();
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error-admin');
    errorEl.textContent = '';

    const submitBtn = e.target.querySelector('button[type="submit"]');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.dataset.originalText = submitBtn.textContent;
        submitBtn.textContent = 'Đang đăng nhập...';
    }

    try {
        const data = await api('/api/auth/login', 'POST', { username, password });
        const user = data.user;

        if (user.role !== 'admin') {
            errorEl.textContent = 'Tài khoản nhân viên không được phép đăng nhập bên phần quản trị!';
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = submitBtn.dataset.originalText || 'Đăng nhập';
            }
            return;
        }

        const proceedLogin = (finalUser) => {
            hasManualLoginInThisPageLoad = true;
            try {
                window.sessionStorage.setItem('ot_session_active', 'true');
                window.sessionStorage.removeItem('ot_session_temp');
                ['ot_current_user', 'ot_login_date', 'ot_mobile_user', 'ot_login_time', 'ot_auth_token'].forEach(k => window.sessionStorage.removeItem(k));
            } catch (errStorage) {}
            localStorage.setItem('ot_current_user', JSON.stringify(finalUser));
            localStorage.setItem('ot_mobile_user', JSON.stringify(finalUser));
            if (data.token) localStorage.setItem('ot_auth_token', data.token);
            localStorage.setItem('ot_login_time', Date.now().toString());
            localStorage.setItem('ot_login_date', getSessionCycleDateStr());
            fetch(`${localServerUrl}/api/version`).then(r => r.json()).then(v => {
                localStorage.setItem('ot_app_version', v.version || '1.0.0');
            }).catch(() => {});

            initAdminDashboard(finalUser);
            showScreen('screen-admin');
            showToast(`Xin chào, ${finalUser.fullname}!`, 'info');
            e.target.reset();

            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = submitBtn.dataset.originalText || 'Đăng nhập';
            }
        };

        if (data.requireEmailSetup) {
            showEmailSetupOverlay(username, (verifiedEmail) => {
                user.email = verifiedEmail;
                proceedLogin(user);
            });
        } else {
            proceedLogin(user);
        }
    } catch (err) {
        errorEl.textContent = err.message;
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = submitBtn.dataset.originalText || 'Đăng nhập';
        }
    }
}

function checkMidnightLogout() {
    const currentUser = localStorage.getItem('ot_current_user');
    if (!currentUser) return;

    const loginDate = localStorage.getItem('ot_login_date');
    const cycleDateStr = getSessionCycleDateStr();
    if (loginDate && loginDate !== cycleDateStr) {
        logout();
        showToast('Đã qua ngày mới (sau 5h sáng), vui lòng đăng nhập lại.', 'info');
    }
}

function logout() {
    clearAuthSession();
    
    if (isElectron) {
        // Trong Electron, reset và hiển thị lại màn hình đăng nhập thay vì chuyển hướng ra Landing Page
        showScreen('screen-login');
        const loginForm = document.getElementById('form-login-admin');
        if (loginForm) loginForm.reset();
        return;
    }

    const needsOtPrefix = window.location.hostname.includes('github.io');
    const mainPageUrl = needsOtPrefix ? '/OT/index.html' : '/index.html';
    window.location.href = mainPageUrl;
}

async function checkGistStatus() {
    try {
        const res = await fetch(`${API_BASE}/api/gist-status`);
        const data = await res.json();
        if (data.status === 'error') {
            showModal(
                'Cảnh báo đồng bộ đám mây',
                `<p style="color: var(--accent-red); font-weight: 600; font-size: 15px; margin-bottom: 8px;">
                    ⚠️ Lỗi đồng bộ đám mây (GitHub Gist)
                </p>
                <p style="color: var(--text-secondary); line-height: 1.6; margin-bottom: 12px;">
                    Chi tiết lỗi: <strong>${data.message}</strong>
                </p>
                <p style="color: var(--text-muted); font-size: 13px;">
                    Dữ liệu của bạn sẽ bị mất mỗi khi server Render khởi động lại hoặc tạm dừng do dịch vụ đám mây chưa được cấu hình đúng. Vui lòng kiểm tra lại cấu hình biến môi trường (Environment Variables) trên Render Dashboard.
                </p>`,
                [{ text: 'Đóng', class: 'btn-ghost' }]
            );
        }
    } catch (e) {
        console.error('Lỗi kiểm tra trạng thái Gist:', e);
    }
}

// ==================== ADMIN DASHBOARD ====================
async function initAdminDashboard(user) {
    const welcomeEl = document.getElementById('admin-welcome');
    if (welcomeEl) welcomeEl.textContent = `Xin chào, ${user.fullname}`;
    
    // Update top header user profile details dynamically
    const headerFullnameEl = document.getElementById('header-user-fullname');
    const headerAvatarEl = document.getElementById('header-user-avatar');
    const headerRoleEl = document.getElementById('header-user-role');
    if (headerFullnameEl) headerFullnameEl.textContent = user.fullname;
    if (headerAvatarEl) headerAvatarEl.textContent = user.fullname.charAt(0).toUpperCase();
    if (headerRoleEl) headerRoleEl.textContent = user.role === 'admin' ? 'Quản lý' : 'Nhân viên';

    // Click to edit own profile
    const userProfileEl = document.getElementById('header-user-profile');
    if (userProfileEl) {
        userProfileEl.style.cursor = 'pointer';
        userProfileEl.title = 'Chỉnh sửa thông tin cá nhân';
        userProfileEl.style.transition = 'opacity 0.2s';
        userProfileEl.onmouseover = () => { userProfileEl.style.opacity = '0.8'; };
        userProfileEl.onmouseout = () => { userProfileEl.style.opacity = '1'; };
        userProfileEl.onclick = () => {
            editUserDialog(user.id);
        };
    }

    // Setup Notification Bell Click Listener to open pending subtab
    const bellBtn = document.getElementById('btn-notification-bell');
    if (bellBtn) {
        bellBtn.onclick = () => {
            const tabBtn = document.querySelector('[data-admin-tab="records"]');
            if (tabBtn) tabBtn.click();
            
            const subtabBtn = document.querySelector('[data-subtab="records-pending"]');
            if (subtabBtn) subtabBtn.click();
        };
    }

    document.getElementById('admin-date').textContent = formatDateFull(new Date());

    const currentMonth = getCurrentMonth();
    document.getElementById('admin-filter-month').value = currentMonth;
    document.getElementById('report-filter-month').value = currentMonth;
    const cleanupMonthInput = document.getElementById('cleanup-month-input');
    if (cleanupMonthInput) {
        cleanupMonthInput.value = currentMonth;
    }

    const isAdmin = user && (user.username === 'admin' || user.isSuperAdmin);
    const adminTeamGroup = document.getElementById('admin-filter-team-group');
    const reportTeamGroup = document.getElementById('report-filter-team-group');
    if (adminTeamGroup) {
        adminTeamGroup.style.display = isAdmin ? 'flex' : 'none';
    }
    if (reportTeamGroup) {
        reportTeamGroup.style.display = isAdmin ? 'flex' : 'none';
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const adminOtDate = document.getElementById('admin-ot-date');
    if (adminOtDate) {
        adminOtDate.value = todayStr;
        adminOtDate.max = todayStr;
        handleAdminDateChange();
    }

    try {
        const currentMonth = getCurrentMonth();
        const dashboardData = await api(`/api/dashboard?month=${currentMonth}`);
        
        await Promise.all([
            loadTeams(dashboardData.teams),
            populateUserFilter(dashboardData.users),
            refreshAdminRecords(dashboardData.records, dashboardData.users),
            refreshAdminUsers(dashboardData.users, dashboardData.records),
            refreshReport(dashboardData.users, dashboardData.records),
            refreshAdminStats(dashboardData.stats),
            loadSystemSettings()
        ]);
    } catch (e) {
        console.error('Lỗi khi tải dữ liệu Dashboard hàng loạt:', e);
        await Promise.all([
            loadTeams(),
            populateUserFilter(),
            refreshAdminRecords(),
            refreshAdminUsers(),
            refreshReport(),
            refreshAdminStats()
        ]);
    }
    checkGistStatus();
}

let selectedTeamIdForModal = null;
let modalAllUsers = [];

async function openTeamSettingsModal() {
    const modalEl = document.querySelector('.modal');
    if (modalEl) {
        modalEl.style.maxWidth = '1400px';
        modalEl.style.width = '95%';
    }

    try {
        const uData = await api('/api/users');
        modalAllUsers = uData.users || [];
    } catch (e) {
        console.error('Lỗi khi lấy danh sách user:', e);
    }

    // Tải lại danh sách team mới nhất từ server
    await loadTeams();

    // Mặc định chọn team đầu tiên nếu chưa chọn team nào
    if (TEAMS.length > 0 && (!selectedTeamIdForModal || !TEAMS.some(t => t.id === selectedTeamIdForModal))) {
        selectedTeamIdForModal = TEAMS[0].id;
    }

    const body = `
    <div class="team-settings-container">
        <!-- LEFT PANEL: Danh sách nhóm -->
        <div class="team-settings-left">
            <h4 style="margin: 0 0 12px 0; font-size: 13px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px;">Danh sách nhóm</h4>
            <div style="display: flex; gap: 8px; margin-bottom: 12px;">
                <input type="text" id="input-modal-new-team" class="input-sm" placeholder="Tên team mới..." style="flex: 1; height: 32px; background:var(--bg-input); color:var(--text-primary); border:1px solid var(--border-color); border-radius:6px; padding:0 8px; font-size:12px;">
                <button class="btn btn-primary btn-sm" onclick="addTeamFromModal()" style="height: 32px; padding: 0 10px; border-radius:6px; font-size:12px; white-space: nowrap;">Thêm</button>
            </div>
            <div style="flex: 1; overflow-y: auto;" id="modal-teams-list-container" class="modal-teams-list">
                ${renderModalTeamsRows()}
            </div>
        </div>

        <!-- RIGHT PANEL: Chi tiết & Cấu hình -->
        <div class="team-settings-right" id="modal-team-details-container">
            ${renderSelectedTeamDetails()}
        </div>
    </div>`;

    showModal('Thiết lập cấu hình Team', body, [
        {
            text: 'Đóng',
            class: 'btn-ghost',
            action: () => {
                if (modalEl) {
                    modalEl.style.maxWidth = '';
                    modalEl.style.width = '';
                }
            }
        }
    ]);

    // Lắng nghe sự kiện click đóng modal để thu hồi kích thước rộng của modal
    const closeBtn = document.getElementById('modal-close');
    if (closeBtn) {
        const originalClose = closeBtn.onclick;
        closeBtn.onclick = () => {
            if (modalEl) {
                modalEl.style.maxWidth = '';
                modalEl.style.width = '';
            }
            if (originalClose) originalClose();
            else closeModal();
        };
    }
    const overlay = document.getElementById('modal-overlay');
    if (overlay) {
        overlay.onclick = (e) => {
            if (e.target === e.currentTarget) {
                if (modalEl) {
                    modalEl.style.maxWidth = '';
                    modalEl.style.width = '';
                }
                closeModal();
            }
        };
    }
}

function renderModalTeamsRows() {
    if (!TEAMS || TEAMS.length === 0) {
        return '<div style="color: var(--text-muted); text-align: center; padding: 20px; font-size:12px;">Chưa có team nào.</div>';
    }
    return TEAMS.map(team => {
        const isSelected = selectedTeamIdForModal === team.id;
        const activeClass = isSelected ? 'active' : '';
        const memberCount = modalAllUsers.filter(u => u.team === team.name && u.role === 'employee').length;
        
        return `
        <div onclick="selectTeamInModal('${team.id}')" class="team-modal-card ${activeClass}">
            <div style="display: flex; flex-direction: column; gap: 2px; text-align: left;">
                <span style="font-weight: 600; font-size: 13px; color: ${isSelected ? 'var(--accent-blue-text)' : 'var(--text-primary)'};">${team.name}</span>
                <span style="font-size: 11px; color: var(--text-muted);">${memberCount} nhân viên</span>
            </div>
            <div style="display: flex; gap: 4px;" onclick="event.stopPropagation();">
                <button class="btn-icon-only edit" onclick="renameTeamFromModal('${team.name}')" title="Đổi tên" style="padding: 4px;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                </button>
                <button class="btn-icon-only delete" onclick="deleteTeamFromModal('${team.name}')" title="Xóa" style="padding: 4px;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2 2v2"/>
                    </svg>
                </button>
            </div>
        </div>`;
    }).join('');
}

function selectTeamInModal(teamId) {
    selectedTeamIdForModal = teamId;
    refreshModalTeamsView();
}

function refreshModalTeamsView() {
    const listContainer = document.getElementById('modal-teams-list-container');
    if (listContainer) {
        listContainer.innerHTML = renderModalTeamsRows();
    }
    const detailsContainer = document.getElementById('modal-team-details-container');
    if (detailsContainer) {
        detailsContainer.innerHTML = renderSelectedTeamDetails();
    }
}

function renderSelectedTeamDetails() {
    const team = TEAMS.find(t => t.id === selectedTeamIdForModal);
    if (!team) {
        return `
        <div style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; color: var(--text-muted); text-align: center;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48" style="margin-bottom: 12px; opacity: 0.5;">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
            </svg>
            <span style="font-size: 13px;">Vui lòng chọn hoặc thêm một team ở cột trái để bắt đầu thiết lập.</span>
        </div>`;
    }

    // Thành viên hiện tại (chỉ lấy Nhân viên)
    const members = modalAllUsers.filter(u => u.team === team.name && u.role === 'employee');
    // Danh sách ứng viên Trưởng nhóm (Chỉ các tài khoản có role === 'admin')
    const potentialLeaders = modalAllUsers.filter(u => u.role === 'admin');
    const activeLeaderIds = team.leaderIds || (team.leaderId ? [team.leaderId] : []);

    const leaderItems = potentialLeaders.map(u => {
        const isChecked = activeLeaderIds.includes(u.id);
        const isPrimary = team.leaderId === u.id;
        
        return `
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 6px 8px; border-radius: 6px; background: rgba(255,255,255,0.01); border: 1px solid var(--border-color); font-size: 12px; margin-bottom: 6px;">
                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; color: var(--text-primary); user-select: none; margin: 0; flex: 1; text-align: left;">
                    <input type="checkbox" class="modal-team-leader-chk" value="${u.id}" ${isChecked ? 'checked' : ''} onchange="saveTeamSettingsFromModal('${team.id}')" style="width: 13px; height: 13px; margin: 0;">
                    <span>${u.fullname} (@${u.username})</span>
                </label>
                ${isChecked ? `
                    <button class="btn-icon-only" onclick="setPrimaryLeader('${team.id}', '${u.id}')" title="${isPrimary ? 'Trưởng nhóm chính (Click để hủy)' : 'Đặt làm Trưởng nhóm chính'}" style="padding: 2px; color: ${isPrimary ? '#f59e0b' : 'var(--text-muted)'}; margin-left: 6px;">
                        <svg viewBox="0 0 24 24" fill="${isPrimary ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" width="14" height="14">
                            <path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7zM5 20h14a1 1 0 0 1 1 1v1H4v-1a1 1 0 0 1 1-1z"/>
                        </svg>
                    </button>
                ` : ''}
            </div>
        `;
    }).join('') || '<span style="color: var(--text-muted); font-size: 11px;">Chưa có tài khoản Admin nào làm ứng viên.</span>';

    const rules = team.autoApproveRules || { normalOT: false, backfill: false, sunday: false, customActivity: false };
    const activities = team.customActivities || [];
    const reasons = team.predefinedReasons || [];

    const activitiesListHtml = activities.length === 0 
        ? '<div style="color: var(--text-muted); font-size: 11px; padding: 12px 0; text-align:center;">Chưa cấu hình hoạt động ngoài giờ nào.</div>'
        : activities.map((act, index) => `
            <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: 6px; padding: 6px 12px; margin-bottom: 6px; font-size: 12px;">
                <div style="display: flex; flex-direction: column; gap: 2px; text-align: left;">
                    <span style="font-weight: 600;">${act.name}</span>
                    <span style="font-size: 10px; color: var(--text-muted);">
                        Tính chất: ${act.calcMode === 'trip' ? 'Tính theo Chuyến 🚚' : 'Tính theo Giờ ⏱️'} | Nhãn: ${act.detailLabel || 'Không có'}
                    </span>
                </div>
                <button class="btn-icon-only delete" onclick="deleteActivityFromTeam('${team.id}', ${index})" title="Xóa" style="padding: 2px;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2 2v2"/>
                    </svg>
                </button>
            </div>
        `).join('');

    const reasonsListHtml = reasons.length === 0
        ? '<div style="color: var(--text-muted); font-size: 11px; padding: 12px 0; text-align:center;">Chưa cấu hình lý do mẫu nào.</div>'
        : reasons.map((reason, index) => `
            <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: 6px; padding: 6px 12px; margin-bottom: 6px; font-size: 12px;">
                <span style="font-weight: 500; text-align: left; flex: 1; padding-right: 8px;">${reason}</span>
                <button class="btn-icon-only delete" onclick="deletePredefinedReason('${team.id}', ${index})" title="Xóa" style="padding: 2px;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2 2v2"/>
                    </svg>
                </button>
            </div>
        `).join('');

    const membersListHtml = members.length === 0
        ? '<div style="color: var(--text-muted); font-size: 11px; text-align: center; padding: 20px;">Chưa có thành viên nào trong team.</div>'
        : members.map(m => `
            <div class="modal-member-row" style="display: flex; align-items: center; justify-content: space-between; background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: 6px; padding: 6px 10px; margin-bottom: 6px; font-size: 12px;">
                <span class="member-name-text"><strong>${m.fullname}</strong> (@${m.username})</span>
                <button class="btn-icon-only delete" onclick="removeMemberFromTeam('${m.id}')" title="Xóa khỏi nhóm" style="padding: 2px;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
            </div>
        `).join('');

    const unassignedEmployees = modalAllUsers.filter(u => u.role === 'employee' && u.team !== team.name);
    const unassignedOptions = `
        <option value="">-- Chọn nhân viên để thêm --</option>
        ${unassignedEmployees.map(u => `<option value="${u.id}">${u.fullname} (${u.team ? 'Đang ở: ' + u.team : 'Chưa có nhóm'})</option>`).join('')}
    `;

    // Tính tổng giờ OT tháng hiện tại của team để làm Quota Bar
    const teamUserIds = members.map(u => u.id);
    const approvedTeamRecords = loadedRecords.filter(r => teamUserIds.includes(r.userId) && (r.status === 'approved' || (!r.isBackfill && r.status !== 'pending' && r.status !== 'rejected')));
    const totalHoursApproved = approvedTeamRecords.reduce((s, r) => s + (r.totalHours || 0), 0);

    const maxHours = team.maxOTHours || 0;
    const progressPercent = maxHours > 0 ? Math.min((totalHoursApproved / maxHours) * 100, 100) : 0;
    let progressColor = '#10b981'; // Green
    if (progressPercent >= 80 && progressPercent < 100) {
        progressColor = '#f59e0b'; // Orange
    } else if (progressPercent >= 100) {
        progressColor = '#ef4444'; // Red
    }

    return `
    <div style="flex: 1; display: flex; flex-direction: column; overflow: hidden; padding-left: 10px;">
        <h3 style="margin: 0 0 16px 0; font-size: 15px; color: var(--accent-blue-text); display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--border-color); padding-bottom: 8px;">
            <span>Cấu hình nhóm: ${team.name}</span>
            <span style="font-size: 11px; color: var(--text-muted); font-weight: normal;">Hạn mức, Quy tắc & Lý do</span>
        </h3>

        <div style="display: flex; flex-direction: column; gap: 12px; flex: 1; overflow-y: auto; padding-right: 4px;" class="settings-section-scroll">
            
            <!-- Phân khu 1: Thông tin chung & Hạn mức -->
            <div class="settings-section-card">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <span class="settings-section-title" style="margin-bottom: 0;">📊 Tiêu hao ngân sách OT</span>
                    <button class="btn btn-ghost btn-sm" onclick="cloneTeamSettingsModal('${team.id}')" style="height: 24px; padding: 0 8px; font-size: 11px; border-radius: 4px;">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12" style="margin-right: 4px; vertical-align: middle; display: inline-block;">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                        </svg>Sao chép cấu hình
                    </button>
                </div>
                <div style="display: flex; align-items: center; justify-content: space-between; font-size: 12px; margin-bottom: 4px;">
                    <span>Tổng giờ đã duyệt tháng này: <strong style="color: var(--accent-green);">${totalHoursApproved.toFixed(1)}h</strong></span>
                    <span>Hạn mức tối đa: <strong>${maxHours > 0 ? maxHours + 'h' : 'Không hạn mức'}</strong></span>
                </div>
                ${maxHours > 0 ? `
                    <div class="quota-bar-container" title="Đã sử dụng ${progressPercent.toFixed(1)}% ngân sách">
                        <div class="quota-bar-fill" style="width: ${progressPercent}%; background: ${progressColor};"></div>
                    </div>
                ` : ''}
                <div style="display: flex; gap: 8px; margin-top: 10px; align-items: center;">
                    <label style="font-size: 11px; color: var(--text-secondary); margin: 0; white-space: nowrap;">Đặt hạn mức mới (giờ):</label>
                    <input type="number" id="team-quota-input" class="input-sm" value="${maxHours || ''}" placeholder="Vô hạn (Nhập 0)" style="flex: 1; height: 26px; font-size: 11px; background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px; padding: 0 6px;">
                    <button class="btn btn-primary btn-sm" onclick="saveTeamQuota('${team.id}')" style="height: 26px; padding: 0 8px; font-size: 11px; border-radius: 4px;">Lưu</button>
                </div>
            </div>

            <!-- Phân khu 2: Trưởng nhóm và Quy tắc tự duyệt -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                <!-- Trưởng nhóm -->
                <div class="settings-section-card" style="margin-bottom: 0;">
                    <span class="settings-section-title">👑 Trưởng nhóm (Leader phê duyệt)</span>
                    <div style="max-height: 120px; overflow-y: auto; padding-right: 4px;">
                        ${leaderItems}
                    </div>
                </div>
                
                <!-- Quy tắc phê duyệt -->
                <div class="settings-section-card" style="margin-bottom: 0;">
                    <span class="settings-section-title">⚡ Quy tắc tự động phê duyệt</span>
                    <div style="display: flex; flex-direction: column; gap: 2px;">
                        <div class="switch-container">
                            <span>Tự duyệt OT bình thường</span>
                            <label class="switch-control">
                                <input type="checkbox" id="rule-normal" ${rules.normalOT ? 'checked' : ''} onchange="saveTeamSettingsFromModal('${team.id}')">
                                <span class="switch-slider"></span>
                            </label>
                        </div>
                        <div class="switch-container">
                            <span>Tự duyệt Bù tăng ca (Backfill)</span>
                            <label class="switch-control">
                                <input type="checkbox" id="rule-backfill" ${rules.backfill ? 'checked' : ''} onchange="saveTeamSettingsFromModal('${team.id}')">
                                <span class="switch-slider"></span>
                            </label>
                        </div>
                        <div class="switch-container">
                            <span>Tự duyệt đăng ký Chủ nhật</span>
                            <label class="switch-control">
                                <input type="checkbox" id="rule-sunday" ${rules.sunday ? 'checked' : ''} onchange="saveTeamSettingsFromModal('${team.id}')">
                                <span class="switch-slider"></span>
                            </label>
                        </div>
                        <div class="switch-container">
                            <span>Tự duyệt hoạt động tùy chỉnh</span>
                            <label class="switch-control">
                                <input type="checkbox" id="rule-custom" ${rules.customActivity ? 'checked' : ''} onchange="saveTeamSettingsFromModal('${team.id}')">
                                <span class="switch-slider"></span>
                            </label>
                        </div>
                        <div class="switch-container">
                            <span>Tự duyệt đổi thiết bị</span>
                            <label class="switch-control">
                                <input type="checkbox" id="rule-unlink" ${rules.autoApproveUnlink ? 'checked' : ''} onchange="saveTeamSettingsFromModal('${team.id}')">
                                <span class="switch-slider"></span>
                            </label>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Phân khu 3: Quản lý Hoạt động & Lý do mẫu -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                <!-- Hoạt động tùy chọn -->
                <div class="settings-section-card" style="margin-bottom: 0; display: flex; flex-direction: column; height: 280px;">
                    <span class="settings-section-title">⚙️ Hoạt động ngoài giờ của Team</span>
                    <div style="display: flex; gap: 4px; margin-bottom: 6px;">
                        <input type="text" id="modal-new-act-name" placeholder="Tên hoạt động..." style="flex: 1.5; min-width: 0; height: 28px; background:var(--bg-input); color:var(--text-primary); border:1px solid var(--border-color); border-radius:6px; padding:0 6px; font-size:11px;">
                        <select id="modal-new-act-mode" style="flex: 1.2; min-width: 0; height: 28px; background:var(--bg-input); color:var(--text-primary); border:1px solid var(--border-color); border-radius:6px; padding:0 2px; font-size:11px;">
                            <option value="hour">Tính giờ ⏱️</option>
                            <option value="trip">Tính chuyến 🚚</option>
                        </select>
                    </div>
                    <div style="display: flex; gap: 4px; margin-bottom: 8px;">
                        <input type="text" id="modal-new-act-label" placeholder="Nhãn phụ (Tỉnh đi xe...)" style="flex: 2; min-width: 0; height: 28px; background:var(--bg-input); color:var(--text-primary); border:1px solid var(--border-color); border-radius:6px; padding:0 6px; font-size:11px;">
                        <button class="btn btn-primary btn-sm" onclick="addActivityToTeam('${team.id}')" style="height: 28px; border-radius:6px; font-size:11px; padding:0 10px; white-space:nowrap; flex: 1;">Thêm</button>
                    </div>
                    <div style="flex: 1; overflow-y: auto; border: 1px solid var(--border-color); border-radius: 6px; padding: 4px; background: rgba(0,0,0,0.1); min-height: 80px;">
                        ${activitiesListHtml}
                    </div>
                </div>

                <!-- Lý do mẫu -->
                <div class="settings-section-card" style="margin-bottom: 0; display: flex; flex-direction: column; height: 280px;">
                    <span class="settings-section-title">✏️ Lý do tăng ca mặc định (Mẫu)</span>
                    <div style="display: flex; gap: 4px; margin-bottom: 8px;">
                        <input type="text" id="modal-new-reason" placeholder="Ví dụ: Hỗ trợ kiểm kho..." style="flex: 2; min-width: 0; height: 28px; background:var(--bg-input); color:var(--text-primary); border:1px solid var(--border-color); border-radius:6px; padding:0 8px; font-size:11px;">
                        <button class="btn btn-primary btn-sm" onclick="addPredefinedReason('${team.id}')" style="height: 28px; border-radius:6px; font-size:11px; padding:0 10px; white-space:nowrap; flex: 1;">Thêm</button>
                    </div>
                    <div style="flex: 1; overflow-y: auto; border: 1px solid var(--border-color); border-radius: 6px; padding: 4px; background: rgba(0,0,0,0.1); min-height: 80px;">
                        ${reasonsListHtml}
                    </div>
                </div>
            </div>

            <!-- Phân khu 4: Quản lý thành viên -->
            <div class="settings-section-card" style="margin-bottom: 0; display: flex; flex-direction: column; height: 280px;">
                <span class="settings-section-title">👥 Quản lý thành viên (${members.length})</span>
                <div style="display: flex; gap: 8px; margin-bottom: 8px;">
                    <select id="modal-add-member-select" style="flex: 1; height: 30px; background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 0 8px; font-size: 11px;">
                        ${unassignedOptions}
                    </select>
                    <button class="btn btn-primary btn-sm" onclick="addMemberToTeamFromModal('${team.id}')" style="height: 30px; border-radius: 6px; font-size: 11px; padding: 0 10px; white-space:nowrap;">Thêm nhân viên</button>
                </div>
                <div style="margin-bottom: 8px;">
                    <input type="text" id="modal-search-member-input" oninput="filterModalMembersList()" placeholder="Tìm kiếm nhanh thành viên..." style="width: 100%; box-sizing: border-box; height: 28px; background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 0 8px; font-size: 11px;">
                </div>
                <div style="flex: 1; overflow-y: auto; border: 1px solid var(--border-color); border-radius: 6px; padding: 6px; background: rgba(0,0,0,0.1);" id="modal-members-list-box">
                    ${membersListHtml}
                </div>
            </div>
            
        </div>
    </div>`;
}

async function saveTeamSettingsFromModal(teamId) {
    const team = TEAMS.find(t => t.id === teamId);
    if (!team) return;

    const leaderChks = document.querySelectorAll('.modal-team-leader-chk:checked');
    const leaderIds = Array.from(leaderChks).map(chk => chk.value);
 
    const ruleNormal = document.getElementById('rule-normal')?.checked;
    const ruleBackfill = document.getElementById('rule-backfill')?.checked;
    const ruleSunday = document.getElementById('rule-sunday')?.checked;
    const ruleCustom = document.getElementById('rule-custom')?.checked;
    const ruleUnlink = document.getElementById('rule-unlink')?.checked;
 
    team.leaderIds = leaderIds;
    // ensure current leaderId is still valid or pick first leader
    if (team.leaderId && !leaderIds.includes(team.leaderId)) {
        team.leaderId = leaderIds[0] || null;
    } else if (!team.leaderId) {
        team.leaderId = leaderIds[0] || null;
    }
    
    team.autoApproveRules = {
        normalOT: !!ruleNormal,
        backfill: !!ruleBackfill,
        sunday: !!ruleSunday,
        customActivity: !!ruleCustom,
        autoApproveUnlink: !!ruleUnlink
    };

    try {
        await api('/api/teams', 'POST', { teams: TEAMS });
        await loadTeams();
        
        // Refresh users list locally
        const uData = await api('/api/users');
        modalAllUsers = uData.users || [];
        
        showToast('Đã lưu cấu hình team!');
        refreshModalTeamsView();
        await populateUserFilter();
        await refreshAdminUsers();
    } catch (e) {
        showToast(e.message, 'error');
    }
}

async function setPrimaryLeader(teamId, leaderId) {
    const team = TEAMS.find(t => t.id === teamId);
    if (!team) return;
    
    if (team.leaderId === leaderId) {
        team.leaderId = null; // Unset primary
    } else {
        team.leaderId = leaderId;
        if (!team.leaderIds.includes(leaderId)) {
            team.leaderIds.push(leaderId);
        }
    }
    
    try {
        await api('/api/teams', 'POST', { teams: TEAMS });
        await loadTeams();
        showToast('Đã cập nhật Trưởng nhóm chính!');
        refreshModalTeamsView();
    } catch (e) {
        showToast(e.message, 'error');
    }
}

async function saveTeamQuota(teamId) {
    const team = TEAMS.find(t => t.id === teamId);
    if (!team) return;
    const input = document.getElementById('team-quota-input');
    if (!input) return;
    const val = parseInt(input.value) || 0;
    team.maxOTHours = val >= 0 ? val : 0;
    try {
        await api('/api/teams', 'POST', { teams: TEAMS });
        await loadTeams();
        showToast('Đã cập nhật hạn mức OT!');
        refreshModalTeamsView();
    } catch (e) {
        showToast(e.message, 'error');
    }
}

function cloneTeamSettingsModal(teamId) {
    const team = TEAMS.find(t => t.id === teamId);
    if (!team) return;
    
    const otherTeams = TEAMS.filter(t => t.id !== teamId);
    if (otherTeams.length === 0) {
        return showToast('Không có nhóm khác để sao chép cấu hình!', 'error');
    }
    
    const options = otherTeams.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
    const body = `
    <div style="text-align: left; padding: 10px 0;">
        <div style="margin-bottom: 12px; font-weight: 500;">Chọn nhóm nguồn để sao chép cấu hình sang nhóm <strong>${team.name}</strong>:</div>
        <select id="modal-clone-source-select" style="width: 100%; box-sizing: border-box; height: 36px; padding: 0 12px; font-size:14px; background:var(--bg-input); color:var(--text-primary); border:1px solid var(--border-color); border-radius:8px;">
            ${options}
        </select>
        <p style="font-size: 11px; color: var(--text-muted); margin-top: 8px; line-height: 1.4;">
            * Hành động này sẽ sao chép toàn bộ <strong>Quy tắc tự duyệt</strong>, <strong>Hoạt động ngoài giờ</strong> và <strong>Lý do tăng ca mẫu</strong> từ nhóm nguồn. Dữ liệu thành viên và Trưởng nhóm hiện tại sẽ được giữ nguyên.
        </p>
    </div>`;
    
    showModal('Sao chép cấu hình Team', body, [
        {
            text: 'Hủy',
            class: 'btn-ghost',
            action: () => {
                setTimeout(() => openTeamSettingsModal(), 50);
            }
        },
        {
            text: 'Sao chép',
            class: 'btn-primary btn-sm',
            action: async () => {
                const select = document.getElementById('modal-clone-source-select');
                if (!select) return;
                const sourceId = select.value;
                const sourceTeam = TEAMS.find(t => t.id === sourceId);
                if (!sourceTeam) return;
                
                // Copy configurations
                team.autoApproveRules = JSON.parse(JSON.stringify(sourceTeam.autoApproveRules || {}));
                team.customActivities = JSON.parse(JSON.stringify(sourceTeam.customActivities || []));
                team.predefinedReasons = JSON.parse(JSON.stringify(sourceTeam.predefinedReasons || []));
                team.maxOTHours = sourceTeam.maxOTHours || 0;
                
                try {
                    await api('/api/teams', 'POST', { teams: TEAMS });
                    await loadTeams();
                    showToast(`Đã sao chép cấu hình từ nhóm ${sourceTeam.name} sang nhóm ${team.name}!`);
                } catch (e) {
                    showToast(e.message, 'error');
                }
                setTimeout(() => openTeamSettingsModal(), 50);
            }
        }
    ]);
}

async function addPredefinedReason(teamId) {
    const team = TEAMS.find(t => t.id === teamId);
    if (!team) return;
    const input = document.getElementById('modal-new-reason');
    const val = input?.value.trim();
    if (!val) return showToast('Vui lòng nhập lý do mẫu!', 'error');
    
    if (!team.predefinedReasons) team.predefinedReasons = [];
    if (team.predefinedReasons.includes(val)) {
        return showToast('Lý do mẫu này đã tồn tại!', 'error');
    }
    
    team.predefinedReasons.push(val);
    try {
        await api('/api/teams', 'POST', { teams: TEAMS });
        await loadTeams();
        showToast('Đã thêm lý do mẫu!');
        if (input) input.value = '';
        refreshModalTeamsView();
    } catch (e) {
        showToast(e.message, 'error');
    }
}

async function deletePredefinedReason(teamId, index) {
    const team = TEAMS.find(t => t.id === teamId);
    if (!team) return;
    
    team.predefinedReasons.splice(index, 1);
    try {
        await api('/api/teams', 'POST', { teams: TEAMS });
        await loadTeams();
        showToast('Đã xóa lý do mẫu!');
        refreshModalTeamsView();
    } catch (e) {
        showToast(e.message, 'error');
    }
}

window.filterModalMembersList = function() {
    const query = document.getElementById('modal-search-member-input')?.value.toLowerCase().trim() || '';
    const memberRows = document.querySelectorAll('.modal-member-row');
    memberRows.forEach(row => {
        const text = row.querySelector('.member-name-text')?.textContent.toLowerCase() || '';
        if (text.includes(query)) {
            row.style.display = 'flex';
        } else {
            row.style.display = 'none';
        }
    });
};

async function addActivityToTeam(teamId) {
    const team = TEAMS.find(t => t.id === teamId);
    if (!team) return;

    const nameInput = document.getElementById('modal-new-act-name');
    const modeSelect = document.getElementById('modal-new-act-mode');
    const labelInput = document.getElementById('modal-new-act-label');

    const name = nameInput?.value.trim();
    const calcMode = modeSelect?.value;
    const detailLabel = labelInput?.value.trim();

    if (!name) return showToast('Vui lòng nhập tên hoạt động!', 'error');

    if (!team.customActivities) team.customActivities = [];
    if (team.customActivities.some(a => a.name.toLowerCase() === name.toLowerCase())) {
        return showToast('Hoạt động này đã tồn tại!', 'error');
    }

    team.customActivities.push({
        id: 'act_' + Date.now(),
        name,
        calcMode,
        detailLabel: detailLabel || 'Chi tiết',
        placeholder: `Nhập ${detailLabel || 'chi tiết'}...`
    });

    try {
        await api('/api/teams', 'POST', { teams: TEAMS });
        await loadTeams();
        showToast('Đã thêm hoạt động!');
        if (nameInput) nameInput.value = '';
        if (labelInput) labelInput.value = '';
        refreshModalTeamsView();
    } catch (e) {
        showToast(e.message, 'error');
    }
}

async function deleteActivityFromTeam(teamId, index) {
    const team = TEAMS.find(t => t.id === teamId);
    if (!team) return;

    team.customActivities.splice(index, 1);

    try {
        await api('/api/teams', 'POST', { teams: TEAMS });
        await loadTeams();
        showToast('Đã xóa hoạt động!');
        refreshModalTeamsView();
    } catch (e) {
        showToast(e.message, 'error');
    }
}

async function addMemberToTeamFromModal(teamId) {
    const team = TEAMS.find(t => t.id === teamId);
    if (!team) return;

    const select = document.getElementById('modal-add-member-select');
    if (!select) return;
    const userId = select.value;
    if (!userId) return showToast('Vui lòng chọn nhân viên!', 'error');

    const user = modalAllUsers.find(u => u.id === userId);
    if (!user) return;

    try {
        await api('/api/users/' + userId, 'PUT', { team: team.name });
        showToast(`Đã thêm ${user.fullname} vào ${team.name}!`);
        
        const uData = await api('/api/users');
        modalAllUsers = uData.users || [];
        
        refreshModalTeamsView();
        await populateUserFilter();
        await refreshAdminUsers();
    } catch (e) {
        showToast(e.message, 'error');
    }
}

async function removeMemberFromTeam(userId) {
    const user = modalAllUsers.find(u => u.id === userId);
    if (!user) return;

    try {
        await api('/api/users/' + userId, 'PUT', { team: '' });
        showToast(`Đã xóa ${user.fullname} khỏi nhóm!`);
        
        const uData = await api('/api/users');
        modalAllUsers = uData.users || [];
        
        refreshModalTeamsView();
        await populateUserFilter();
        await refreshAdminUsers();
    } catch (e) {
        showToast(e.message, 'error');
    }
}

async function addTeamFromModal() {
    const input = document.getElementById('input-modal-new-team');
    if (!input) return;
    const teamName = input.value.trim();
    if (!teamName) return showToast('Vui lòng nhập tên team!', 'error');

    if (TEAMS.some(t => t.name.toLowerCase() === teamName.toLowerCase())) {
        return showToast('Team này đã tồn tại!', 'error');
    }

    const newTeam = {
        id: 'team_' + Date.now(),
        name: teamName,
        leaderId: null,
        leaderIds: [],
        customActivities: [],
        autoApproveRules: {
            normalOT: false,
            backfill: false,
            sunday: false,
            customActivity: false,
            autoApproveUnlink: false
        }
    };
    const updatedTeams = [...TEAMS, newTeam];
    try {
        await api('/api/teams', 'POST', { teams: updatedTeams });
        TEAMS = updatedTeams;
        input.value = '';
        showToast('Thêm team thành công!');
        selectedTeamIdForModal = newTeam.id;
        refreshModalTeamsView();
        await populateUserFilter();
    } catch (e) {
        showToast(e.message, 'error');
    }
}

async function renameTeamFromModal(oldName) {
    const body = `
    <div style="text-align: left; padding: 10px 0;">
        <div style="margin-bottom: 12px; font-weight: 500;">Nhập tên team mới cho <strong>${oldName}</strong>:</div>
        <input type="text" id="modal-rename-team-input" class="input-sm" value="${oldName}" style="width: 100%; box-sizing: border-box; height: 36px; padding: 0 12px; font-size:14px; background:var(--bg-input); color:var(--text-primary); border:1px solid var(--border-color); border-radius:8px;">
    </div>`;

    showModal('Đổi tên Team', body, [
        {
            text: 'Hủy',
            class: 'btn-ghost',
            action: () => {
                setTimeout(() => openTeamSettingsModal(), 50);
            }
        },
        {
            text: 'Lưu',
            class: 'btn-primary btn-sm',
            action: async () => {
                const input = document.getElementById('modal-rename-team-input');
                if (!input) return;
                const newName = input.value.trim();
                if (!newName) {
                    showToast('Tên team không được để trống!', 'error');
                    setTimeout(() => openTeamSettingsModal(), 50);
                    return;
                }
                if (newName === oldName) {
                    setTimeout(() => openTeamSettingsModal(), 50);
                    return;
                }
                if (TEAMS.some(t => t.name.toLowerCase() === newName.toLowerCase())) {
                    showToast('Tên team này đã tồn tại!', 'error');
                    setTimeout(() => openTeamSettingsModal(), 50);
                    return;
                }
                const updatedTeams = TEAMS.map(t => {
                    if (t.name === oldName) {
                        t.name = newName;
                    }
                    return t;
                });
                try {
                    await api('/api/teams', 'POST', { teams: updatedTeams, oldName, newName });
                    TEAMS = updatedTeams;
                    showToast('Đổi tên team thành công!');
                    await Promise.all([
                        populateUserFilter(),
                        refreshAdminUsers()
                    ]);
                } catch (e) {
                    showToast(e.message, 'error');
                }
                setTimeout(() => openTeamSettingsModal(), 50);
            }
        }
    ]);
}

async function deleteTeamFromModal(teamName) {
    try {
        const uData = await api('/api/users');
        const userCount = uData.users.filter(u => u.team === teamName).length;
        
        let confirmMsg = `Bạn có chắc muốn xóa team "${teamName}"?`;
        if (userCount > 0) {
            confirmMsg += `<br><br><span style="color: var(--status-rejected-text); font-weight: bold;">Cảnh báo: Hiện có ${userCount} nhân viên thuộc team này. Họ sẽ bị đưa về trạng thái "Chưa phân team".</span>`;
        }

        showModal('Xóa Team', confirmMsg, [
            {
                text: 'Hủy',
                class: 'btn-ghost',
                action: () => {
                    setTimeout(() => openTeamSettingsModal(), 50);
                }
            },
            {
                text: 'Xóa',
                class: 'btn-danger btn-sm',
                action: async () => {
                    const updatedTeams = TEAMS.filter(t => t.name !== teamName);
                    if (selectedTeamIdForModal && !updatedTeams.some(t => t.id === selectedTeamIdForModal)) {
                        selectedTeamIdForModal = null;
                    }
                    try {
                        await api('/api/teams', 'POST', { teams: updatedTeams, deletedTeam: teamName });
                        TEAMS = updatedTeams;
                        showToast('Đã xóa team!');
                        await Promise.all([
                            populateUserFilter(),
                            refreshAdminUsers()
                        ]);
                    } catch (e) {
                        showToast(e.message, 'error');
                    }
                    setTimeout(() => openTeamSettingsModal(), 50);
                }
            }
        ]);
    } catch (e) {
        showToast('Lỗi khi lấy thông tin nhân viên', 'error');
        setTimeout(() => openTeamSettingsModal(), 50);
    }
}

// Khởi tạo kênh nhận sự kiện thời gian thực (SSE)