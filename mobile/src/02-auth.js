// ==================== SCREENS ====================
function showScreen(id) {
    if (id === 'screen-login') {
        document.documentElement.classList.remove('user-logged-in');
    } else if (id === 'screen-app') {
        document.documentElement.classList.add('user-logged-in');
    }
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
}

// ==================== AUTH ====================
async function cacheUsernames() {
    try {
        const data = await api('/api/users');
        const usernames = data.users.filter(u => u.role === 'employee').map(u => ({
            id: u.id,
            username: u.username,
            fullname: u.fullname,
            deviceId: u.deviceId
        }));
        safeStorage.setItem('ot_cached_usernames', JSON.stringify(usernames));
    } catch (e) {
        console.log('Cannot cache usernames:', e);
    }
}

async function handleEmployeeLogin(e) {
    e.preventDefault();
    const username = document.getElementById('login-user').value.trim();
    deviceId = getDeviceId(username); // Cập nhật deviceId mới nhất theo username trước khi kiểm tra/đăng nhập
    const errEl = document.getElementById('login-error-emp');
    errEl.textContent = '';

    if (window.location.protocol !== 'file:' && !window.AndroidBridge && await isPrivateMode()) {
        errEl.textContent = 'Hệ thống không cho phép đăng nhập từ trình duyệt ẩn danh (Incognito Mode) để đảm bảo an toàn thiết bị!';
        return;
    }

    const isBrowser = window.location.protocol !== 'file:' && !window.AndroidBridge;

    if (!API) {
        const cachedUsernames = JSON.parse(safeStorage.getItem('ot_cached_usernames') || '[]');
        const user = cachedUsernames.find(u => u.username.toLowerCase() === username.toLowerCase());
        if (user) {
            const keyToCheck = isBrowser ? user.browserDeviceId : user.deviceId;
            if (keyToCheck && keyToCheck !== deviceId) {
                errEl.textContent = isBrowser
                    ? 'Tài khoản này đã được đăng nhập trên một trình duyệt khác!'
                    : 'Tài khoản này đã được đăng nhập trên một thiết bị khác!';
                return;
            }
            currentUser = { id: user.id, username: user.username, fullname: user.fullname, role: 'employee' };
            safeStorage.setItem('ot_mobile_user', JSON.stringify(currentUser));
            safeStorage.setItem('ot_login_time', Date.now().toString());
            enterApp();
            showToast('Đăng nhập ngoại tuyến (offline)!', 'warning');
            return;
        }
        errEl.textContent = 'Chưa kết nối Server và không tìm thấy tài khoản offline!';
        return;
    }

    try {
        const oldUser = JSON.parse(safeStorage.getItem('ot_mobile_user') || 'null');
        const data = await api('/api/auth/login', 'POST', { username, deviceId, isBrowser, clientSource: 'mobile_app' });

        if (data.user.role !== 'employee') {
            errEl.textContent = 'Tài khoản này không phải là nhân viên!';
            return;
        }

        // Cập nhật ID cho các bản ghi offline
        if (oldUser && oldUser.username && oldUser.username.toLowerCase() === username.toLowerCase() && oldUser.id !== data.user.id) {
            let offlineRecords = JSON.parse(safeStorage.getItem('ot_offline_records') || '[]');
            let updated = false;
            offlineRecords.forEach(r => {
                if (r.userId === oldUser.id) {
                    r.userId = data.user.id;
                    updated = true;
                }
            });
            if (updated) {
                safeStorage.setItem('ot_offline_records', JSON.stringify(offlineRecords));
            }
        }

        currentUser = data.user;
        safeStorage.setItem('ot_mobile_user', JSON.stringify(currentUser));
        safeStorage.setItem('ot_login_time', Date.now().toString());
        if (data.token) safeStorage.setItem('ot_auth_token', data.token);

        cacheUsernames();
        enterApp();
    } catch (err) {
        const isNetworkError = err.message.includes('kết nối') || err.message.includes('timeout') || err.message.includes('Server');
        if (isNetworkError) {
            const cachedUsernames = JSON.parse(safeStorage.getItem('ot_cached_usernames') || '[]');
            const user = cachedUsernames.find(u => u.username.toLowerCase() === username.toLowerCase());
            if (user) {
                const keyToCheck = isBrowser ? user.browserDeviceId : user.deviceId;
                if (keyToCheck && keyToCheck !== deviceId) {
                    errEl.textContent = isBrowser
                        ? 'Tài khoản này đã được đăng nhập trên một trình duyệt khác!'
                        : 'Tài khoản này đã được đăng nhập trên một thiết bị khác!';
                    return;
                }
                currentUser = { id: user.id, username: user.username, fullname: user.fullname, role: 'employee' };
                safeStorage.setItem('ot_mobile_user', JSON.stringify(currentUser));
                safeStorage.setItem('ot_login_time', Date.now().toString());
                enterApp();
                showToast('Đăng nhập ngoại tuyến (offline)!', 'warning');
                return;
            }
        }
        
        if (err.message.includes('trình duyệt khác') || err.message.includes('thiết bị khác')) {
            errEl.innerHTML = `${err.message}<br><button type="button" class="btn btn-ghost btn-sm" id="btn-request-unlink-login" style="margin-top: 10px; width: 100%; border: 1px dashed rgba(239, 68, 68, 0.4); padding: 8px 16px; font-size: 0.85rem; font-weight: 600; border-radius: 8px; color: #ef4444; background: rgba(239, 68, 68, 0.04); cursor: pointer; transition: all 0.2s ease-in-out; display: block; box-sizing: border-box;">Xin Quản lý huỷ liên kết</button>`;
            
            const unlinkBtn = document.getElementById('btn-request-unlink-login');
            if (unlinkBtn) {
                // Hover effects
                unlinkBtn.addEventListener('mouseenter', () => {
                    unlinkBtn.style.background = 'rgba(239, 68, 68, 0.1)';
                    unlinkBtn.style.borderColor = '#ef4444';
                });
                unlinkBtn.addEventListener('mouseleave', () => {
                    unlinkBtn.style.background = 'rgba(239, 68, 68, 0.04)';
                    unlinkBtn.style.borderColor = 'rgba(239, 68, 68, 0.4)';
                });
                unlinkBtn.addEventListener('click', async () => {
                    unlinkBtn.disabled = true;
                    unlinkBtn.textContent = 'Đang gửi yêu cầu...';
                    try {
                        const unlinkRes = await api('/api/auth/request-unlink', 'POST', { username }, true);
                        showToast('Gửi yêu cầu thành công!', 'success');
                        errEl.innerHTML = `<span style="color:#10b981; font-weight: 700; display: block; margin-top: 8px;">✅ ${unlinkRes.message || 'Đã gửi yêu cầu huỷ liên kết đến Quản trị viên!'}</span>`;
                    } catch (unlinkErr) {
                        showToast(unlinkErr.message, 'error');
                        unlinkBtn.disabled = false;
                        unlinkBtn.textContent = 'Xin Quản lý huỷ liên kết';
                    }
                });
            }
        } else {
            errEl.textContent = err.message;
        }
    }
}

let isAdminLoggingIn = false;
async function handleAdminLogin(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (isAdminLoggingIn) return;

    deviceId = getDeviceId(); // Cập nhật deviceId mới nhất trước khi đăng nhập
    const userInput = document.getElementById('login-admin-user') || document.getElementById('login-user');
    const passInput = document.getElementById('login-admin-password') || document.getElementById('login-password');
    const errEl = document.getElementById('login-error-admin');
    if (errEl) errEl.textContent = '';

    const username = userInput ? userInput.value.trim() : '';
    const password = passInput ? passInput.value : '';

    if (!username) {
        if (errEl) errEl.textContent = 'Vui lòng nhập tên đăng nhập quản lý!';
        return;
    }
    if (!password) {
        if (errEl) errEl.textContent = 'Vui lòng nhập mật khẩu!';
        return;
    }

    if (window.location.protocol !== 'file:' && await isPrivateMode()) {
        if (errEl) errEl.textContent = 'Hệ thống không cho phép đăng nhập từ trình duyệt ẩn danh (Incognito Mode) để đảm bảo an toàn thiết bị!';
        return;
    }

    if (!API) {
        if (errEl) errEl.textContent = 'Không thể kết nối máy chủ (Offline)! Vui lòng kiểm tra mạng hoặc cấu hình IP Server.';
        return;
    }

    const btnSubmit = document.getElementById('btn-login-admin');
    const originalBtnText = btnSubmit ? btnSubmit.textContent : '';
    if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.textContent = 'Đang đăng nhập...';
    }
    isAdminLoggingIn = true;

    try {
        const data = await api('/api/auth/login', 'POST', { username, password, deviceId });
        
        if (!data || !data.user || data.user.role !== 'admin') {
            if (errEl) errEl.textContent = 'Tài khoản này không có quyền Quản lý!';
            return;
        }

        // Lưu thông tin đăng nhập quản lý
        safeStorage.removeItem('ot_session_temp');
        safeStorage.setItem('ot_mobile_user', JSON.stringify(data.user));
        safeStorage.setItem('ot_login_time', Date.now().toString());
        if (data.token) safeStorage.setItem('ot_auth_token', data.token);
        
        // Đồng bộ session quản lý cho desktop/app.js tự động nhận diện nếu mở desktop
        safeStorage.setItem('ot_current_user', JSON.stringify(data.user));
        safeStorage.setItem('ot_login_date', getSessionCycleDateStr());
        
        currentUser = data.user;
        showToast('Đăng nhập Quản lý thành công!', 'success');
        enterApp();
    } catch (err) {
        console.error('Lỗi đăng nhập quản lý:', err);
        if (errEl) errEl.textContent = err.message || 'Lỗi đăng nhập quản trị!';
    } finally {
        isAdminLoggingIn = false;
        if (btnSubmit) {
            btnSubmit.disabled = false;
            btnSubmit.textContent = originalBtnText;
        }
    }
}

function enterApp() {
    document.getElementById('greeting').textContent = getGreeting();
    document.getElementById('user-name').textContent = currentUser.fullname;
    const todayStr = new Date().toISOString().split('T')[0];
    document.getElementById('ot-date').value = todayStr;
    document.getElementById('ot-date').max = todayStr;
    document.getElementById('filter-month').value = getCurrentMonth();

    // Profile
    document.getElementById('profile-avatar').textContent = getInitials(currentUser.fullname);
    document.getElementById('profile-name').textContent = currentUser.fullname;
    document.getElementById('profile-username').textContent = `@${currentUser.username}`;

    const btnCheckUpdate = document.getElementById('btn-check-update-mobile');
    if (btnCheckUpdate) {
        btnCheckUpdate.style.display = 'block';
    }

    // Role-based UI: Quản lý có tab Duyệt đơn
    const navApprovals = document.getElementById('nav-item-approvals');
    const filterApprovalsMonth = document.getElementById('filter-approvals-month');
    if (filterApprovalsMonth && !filterApprovalsMonth.value) {
        filterApprovalsMonth.value = getCurrentMonth();
    }
    if (currentUser && currentUser.role === 'admin') {
        if (navApprovals) navApprovals.style.display = 'flex';
        loadApprovals();
    } else {
        if (navApprovals) navApprovals.style.display = 'none';
    }

    showScreen('screen-app');
    setupCustomActivitiesUI();
    handleDateChange();
    updatePreview();
    loadHistory();
    loadProfileStats();
    updateConnectionStatus(true, API);
    updateSyncBanner();
    refreshCurrentUserInfo();
    checkAndRegisterPushNotifications();
}

function getGreeting() {
    const h = new Date().getHours();
    if (h < 12) return 'Chào buổi sáng ☀️';
    if (h < 18) return 'Chào buổi chiều 🌤️';
    return 'Chào buổi tối 🌙';
}

function isStandaloneOrNative() {
    const isStandaloneWeb = window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;
    const isNativeApp = window.location.protocol === 'file:' || !!window.AndroidBridge;
    return isStandaloneWeb || isNativeApp;
}

function handleUnauthenticated() {
    showScreen('screen-login');
}

function logout() {
    currentUser = null;
    safeStorage.removeItem('ot_mobile_user');
    safeStorage.removeItem('ot_login_time');
    safeStorage.removeItem('ot_current_user');
    safeStorage.removeItem('ot_login_date');
    safeStorage.removeItem('ot_auth_token');
    
    const loginForm = document.getElementById('form-login-employee');
    if (loginForm) loginForm.reset();
    const adminForm = document.getElementById('form-login-admin');
    if (adminForm) adminForm.reset();

    const navApprovals = document.getElementById('nav-item-approvals');
    if (navApprovals) navApprovals.style.display = 'none';
    const badgeApprovals = document.getElementById('nav-approvals-badge');
    if (badgeApprovals) badgeApprovals.style.display = 'none';

    switchTab('home');

    const listContainer = document.getElementById('ot-custom-activities-list');
    if (listContainer) listContainer.innerHTML = '';
    const editListContainer = document.getElementById('edit-ot-custom-activities-list');
    if (editListContainer) editListContainer.innerHTML = '';

    showToast('Đã đăng xuất', 'info');
    
    handleUnauthenticated();
}

async function refreshCurrentUserInfo() {
    if (!currentUser || !currentUser.id) return;
    if (!API) return;
    try {
        const data = await api('/api/users/' + currentUser.id, 'GET', null, true);
        if (data && data.user) {
            currentUser = Object.assign({}, currentUser, data.user);
            if (currentUser.settings) {
                mobileSystemSettings = currentUser.settings;
            }
            safeStorage.setItem('ot_mobile_user', JSON.stringify(currentUser));
            setupCustomActivitiesUI();
            
            // Cập nhật giao diện nút hủy liên kết
            const btn = document.getElementById('btn-unlink-device');
            if (btn) {
                if (currentUser.pendingUnlink) {
                    btn.disabled = true;
                    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" width="16" height="16"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Đang chờ duyệt huỷ liên kết...';
                    btn.style.opacity = '0.7';
                } else {
                    btn.disabled = false;
                    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" width="16" height="16"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg> Xin huỷ liên kết thiết bị';
                    btn.style.opacity = '1';
                }
            }
        }
    } catch (err) {
        console.error('Error refreshing user info:', err);
    }
}

function formatBackfillMonthDisplay(rawVal) {
    const val = (rawVal || '').trim();
    if (!val) return '';
    const ymMatch = val.match(/^(\d{4})-(\d{2})$/);
    if (ymMatch) {
        return `${ymMatch[2]}/${ymMatch[1]}`;
    }
    return val;
}

function setupMobilePredefinedReasonsSelect(reasons, selectEl, isLunchChecked = false, isBackfillChecked = false, backfillMonth = '', isSunday = false) {
    if (!selectEl) return;
    
    const prevVal = selectEl.value;

    if (isSunday) {
        selectEl.innerHTML = `
            <option value="Tăng ca Chủ Nhật">Tăng ca Chủ Nhật</option>
        `;
        selectEl.value = "Tăng ca Chủ Nhật";
        selectEl.style.display = 'inline-block';
        return;
    }
    
    if (isBackfillChecked) {
        const formattedMonth = formatBackfillMonthDisplay(backfillMonth);
        const displayText = formattedMonth ? `Bù giờ tăng ca tháng ${formattedMonth} bị thiếu` : 'Bù giờ tăng ca tháng ... bị thiếu';
        const displayVal = formattedMonth ? `Bù giờ tăng ca tháng ${formattedMonth} bị thiếu` : '';
        selectEl.innerHTML = `
            <option value="${displayVal}">${displayText}</option>
        `;
        selectEl.value = displayVal;
        selectEl.style.display = 'inline-block';
        return;
    }
    
    // Filter reasons based on lunch checkbox status
    const filteredReasons = (reasons || []).filter(r => {
        const containsLunch = r.toLowerCase().includes('trưa');
        return isLunchChecked ? containsLunch : !containsLunch;
    });

    const placeholder = isLunchChecked ? '-- Chọn lý do tăng ca trưa --' : '-- Chọn lý do tăng ca --';
    
    selectEl.innerHTML = `
        <option value="">${placeholder}</option>
        ${filteredReasons.map(r => `<option value="${r.replace(/"/g, '&quot;')}">${r}</option>`).join('')}
    `;
    if (prevVal && filteredReasons.includes(prevVal)) {
        selectEl.value = prevVal;
    }
    selectEl.style.display = 'inline-block';
}

function setupCustomActivitiesUI() {
    const activityGroup = document.getElementById('ot-custom-activity-group');
    const editActivityGroup = document.getElementById('edit-ot-custom-activity-group');

    const teamSettings = currentUser ? currentUser.teamSettings : null;
    const activities = (teamSettings && teamSettings.customActivities) ? teamSettings.customActivities : [];

    // Setup Predefined Reasons for Add and Edit Forms
    const reasons = teamSettings ? teamSettings.predefinedReasons || [] : [];
    
    const otLunchEl = document.getElementById('ot-lunch');
    const otBackfillEl = document.getElementById('ot-backfill');
    const otBackfillMonthEl = document.getElementById('ot-backfill-month');
    const otDateEl = document.getElementById('ot-date');
    const otNoteEl = document.getElementById('ot-note');
    const updateMobilePredefinedReasons = () => {
        const curTeamSettings = currentUser ? currentUser.teamSettings : null;
        const curReasons = (curTeamSettings && curTeamSettings.predefinedReasons) ? curTeamSettings.predefinedReasons : reasons;
        const isLunchChecked = otLunchEl ? otLunchEl.checked : false;
        const isBackfillChecked = otBackfillEl ? otBackfillEl.checked : false;
        const backfillMonth = otBackfillMonthEl ? otBackfillMonthEl.value.trim() : '';
        const dateVal = otDateEl ? otDateEl.value : '';
        const isSunday = dateVal ? new Date(dateVal + 'T00:00:00').getDay() === 0 : false;
        setupMobilePredefinedReasonsSelect(curReasons, otNoteEl, isLunchChecked, isBackfillChecked, backfillMonth, isSunday);
    };
    if (otLunchEl && !otLunchEl.dataset.reasonsListenerBound) {
        otLunchEl.addEventListener('change', updateMobilePredefinedReasons);
        otLunchEl.dataset.reasonsListenerBound = 'true';
    }
    if (otBackfillEl && !otBackfillEl.dataset.reasonsBackfillListenerBound) {
        otBackfillEl.addEventListener('change', updateMobilePredefinedReasons);
        otBackfillEl.dataset.reasonsBackfillListenerBound = 'true';
    }
    if (otBackfillMonthEl && !otBackfillMonthEl.dataset.reasonsMonthListenerBound) {
        otBackfillMonthEl.addEventListener('input', updateMobilePredefinedReasons);
        otBackfillMonthEl.addEventListener('change', updateMobilePredefinedReasons);
        otBackfillMonthEl.dataset.reasonsMonthListenerBound = 'true';
    }
    if (otDateEl && !otDateEl.dataset.reasonsDateListenerBound) {
        otDateEl.addEventListener('change', updateMobilePredefinedReasons);
        otDateEl.addEventListener('input', updateMobilePredefinedReasons);
        otDateEl.dataset.reasonsDateListenerBound = 'true';
    }
    updateMobilePredefinedReasons();

    const editOtLunchEl = document.getElementById('edit-ot-lunch');
    const editOtBackfillEl = document.getElementById('edit-ot-backfill');
    const editOtBackfillMonthEl = document.getElementById('edit-ot-backfill-month');
    const editOtDateEl = document.getElementById('edit-ot-date');
    const editOtNoteEl = document.getElementById('edit-ot-note');
    const updateMobileEditPredefinedReasons = () => {
        const curTeamSettings = currentUser ? currentUser.teamSettings : null;
        const curReasons = (curTeamSettings && curTeamSettings.predefinedReasons) ? curTeamSettings.predefinedReasons : reasons;
        const isLunchChecked = editOtLunchEl ? editOtLunchEl.checked : false;
        const isBackfillChecked = editOtBackfillEl ? editOtBackfillEl.checked : false;
        const backfillMonth = editOtBackfillMonthEl ? editOtBackfillMonthEl.value.trim() : '';
        const dateVal = editOtDateEl ? editOtDateEl.value : '';
        const isSunday = dateVal ? new Date(dateVal + 'T00:00:00').getDay() === 0 : false;
        setupMobilePredefinedReasonsSelect(curReasons, editOtNoteEl, isLunchChecked, isBackfillChecked, backfillMonth, isSunday);
    };
    if (editOtLunchEl && !editOtLunchEl.dataset.reasonsListenerBound) {
        editOtLunchEl.addEventListener('change', updateMobileEditPredefinedReasons);
        editOtLunchEl.dataset.reasonsListenerBound = 'true';
    }
    if (editOtBackfillEl && !editOtBackfillEl.dataset.reasonsBackfillListenerBound) {
        editOtBackfillEl.addEventListener('change', updateMobileEditPredefinedReasons);
        editOtBackfillEl.dataset.reasonsBackfillListenerBound = 'true';
    }
    if (editOtBackfillMonthEl && !editOtBackfillMonthEl.dataset.reasonsMonthListenerBound) {
        editOtBackfillMonthEl.addEventListener('input', updateMobileEditPredefinedReasons);
        editOtBackfillMonthEl.addEventListener('change', updateMobileEditPredefinedReasons);
        editOtBackfillMonthEl.dataset.reasonsMonthListenerBound = 'true';
    }
    if (editOtDateEl && !editOtDateEl.dataset.reasonsDateListenerBound) {
        editOtDateEl.addEventListener('change', updateMobileEditPredefinedReasons);
        editOtDateEl.addEventListener('input', updateMobileEditPredefinedReasons);
        editOtDateEl.dataset.reasonsDateListenerBound = 'true';
    }
    updateMobileEditPredefinedReasons();

    const isBackfillChecked = document.getElementById('ot-backfill')?.checked || false;
    const isEditBackfillChecked = document.getElementById('edit-ot-backfill')?.checked || false;

    if (activities.length > 0) {
        if (activityGroup) activityGroup.style.display = isBackfillChecked ? 'none' : 'block';
        if (editActivityGroup) editActivityGroup.style.display = isEditBackfillChecked ? 'none' : 'block';

        // Nạp danh sách checkbox cho Form thêm (chỉ nạp nếu chưa có phần tử con)
        const listContainer = document.getElementById('ot-custom-activities-list');
        if (listContainer && listContainer.children.length === 0) {
            listContainer.innerHTML = activities.map(act => `
                <div class="custom-activity-item toggle-row" style="margin-bottom: 14px; text-align: left;">
                    <label class="toggle-label" for="chk-${act.id}" style="display: flex; justify-content: space-between; align-items: center; cursor: pointer;">
                        <span class="toggle-text">
                            <strong>${act.name}</strong>
                            <small>Tính chất: ${act.calcMode === 'trip' ? 'Tính theo Chuyến' : 'Tính theo Giờ'}</small>
                        </span>
                        <div class="toggle-switch">
                            <input type="checkbox" id="chk-${act.id}" class="ot-custom-activity-checkbox" data-act-id="${act.id}" data-act-name="${act.name}" data-act-mode="${act.calcMode}" onchange="toggleCustomActivityInput('${act.id}')">
                            <span class="toggle-slider"></span>
                        </div>
                    </label>
                    <div class="form-group" id="ot-custom-activity-detail-group-${act.id}" style="display: none; margin-top: 8px; padding: 0 4px; margin-bottom: 0;">
                        <label style="display:block; margin-bottom:6px; font-size:13px; font-weight:600; color:var(--text-secondary);">${act.detailLabel || 'Chi tiết'}</label>
                        <input type="text" class="ot-custom-activity-detail" data-act-id="${act.id}" placeholder="${act.placeholder || 'Nhập chi tiết...'}" style="width: 100%; height: 38px; background: rgba(0,0,0,0.2); color: #fff; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; padding: 0 10px; font-size: 14px;">
                    </div>
                </div>
            `).join('');
        }

        // Nạp danh sách checkbox cho Form sửa (chỉ nạp nếu chưa có phần tử con)
        const editListContainer = document.getElementById('edit-ot-custom-activities-list');
        if (editListContainer && editListContainer.children.length === 0) {
            editListContainer.innerHTML = activities.map(act => `
                <div class="custom-activity-item toggle-row" style="margin-bottom: 14px; text-align: left;">
                    <label class="toggle-label" for="edit-chk-${act.id}" style="display: flex; justify-content: space-between; align-items: center; cursor: pointer;">
                        <span class="toggle-text">
                            <strong>${act.name}</strong>
                            <small>Tính chất: ${act.calcMode === 'trip' ? 'Tính theo Chuyến' : 'Tính theo Giờ'}</small>
                        </span>
                        <div class="toggle-switch">
                            <input type="checkbox" id="edit-chk-${act.id}" class="edit-ot-custom-activity-checkbox" data-act-id="${act.id}" data-act-name="${act.name}" data-act-mode="${act.calcMode}" onchange="toggleEditCustomActivityInput('${act.id}')">
                            <span class="toggle-slider"></span>
                        </div>
                    </label>
                    <div class="form-group" id="edit-ot-custom-activity-detail-group-${act.id}" style="display: none; margin-top: 8px; padding: 0 4px; margin-bottom: 0;">
                        <label style="display:block; margin-bottom:6px; font-size:13px; font-weight:600; color:var(--text-secondary);">${act.detailLabel || 'Chi tiết'}</label>
                        <input type="text" class="edit-ot-custom-activity-detail" data-act-id="${act.id}" placeholder="${act.placeholder || 'Nhập chi tiết...'}" style="width: 100%; height: 38px; background: rgba(0,0,0,0.2); color: #fff; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; padding: 0 10px; font-size: 14px;">
                    </div>
                </div>
            `).join('');
        }
    } else {
        if (activityGroup) activityGroup.style.display = 'none';
        if (editActivityGroup) editActivityGroup.style.display = 'none';
    }
}

window.toggleCustomActivityInput = function(actId) {
    const chk = document.querySelector(`.ot-custom-activity-checkbox[data-act-id="${actId}"]`);
    if (chk && chk.checked) {
        // Tự động bỏ chọn các checkbox hoạt động khác (chỉ cho phép chọn tối đa 1 hoạt động)
        document.querySelectorAll('.ot-custom-activity-checkbox').forEach(other => {
            if (other !== chk) {
                other.checked = false;
                const otherGroup = document.getElementById(`ot-custom-activity-detail-group-${other.dataset.actId}`);
                if (otherGroup) {
                    otherGroup.style.display = 'none';
                    const otherInput = otherGroup.querySelector('.ot-custom-activity-detail');
                    if (otherInput) {
                        otherInput.value = '';
                        otherInput.required = false;
                    }
                }
            }
        });
    }

    const group = document.getElementById(`ot-custom-activity-detail-group-${actId}`);
    const input = group ? group.querySelector('.ot-custom-activity-detail') : null;
    if (chk && group) {
        group.style.display = chk.checked ? 'block' : 'none';
        if (input) {
            input.required = chk.checked;
            if (!chk.checked) input.value = '';
        }
    }
    updatePreview();
};

window.toggleEditCustomActivityInput = function(actId) {
    const chk = document.querySelector(`.edit-ot-custom-activity-checkbox[data-act-id="${actId}"]`);
    if (chk && chk.checked) {
        // Tự động bỏ chọn các checkbox hoạt động khác (chỉ cho phép chọn tối đa 1 hoạt động)
        document.querySelectorAll('.edit-ot-custom-activity-checkbox').forEach(other => {
            if (other !== chk) {
                other.checked = false;
                const otherGroup = document.getElementById(`edit-ot-custom-activity-detail-group-${other.dataset.actId}`);
                if (otherGroup) {
                    otherGroup.style.display = 'none';
                    const otherInput = otherGroup.querySelector('.edit-ot-custom-activity-detail');
                    if (otherInput) {
                        otherInput.value = '';
                        otherInput.required = false;
                    }
                }
            }
        });
    }

    const group = document.getElementById(`edit-ot-custom-activity-detail-group-${actId}`);
    const input = group ? group.querySelector('.edit-ot-custom-activity-detail') : null;
    if (chk && group) {
        group.style.display = chk.checked ? 'block' : 'none';
        if (input) {
            input.required = chk.checked;
            if (!chk.checked) input.value = '';
        }
    }
};

// Hàm cũ giữ lại làm rỗng để tránh lỗi gọi hàm
function handleCustomActivityChange() {}
function handleEditCustomActivityChange() {}
