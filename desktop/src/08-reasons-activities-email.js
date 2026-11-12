// ==================== PREDEFINED OT REASONS UTILITIES ====================
function setupPredefinedReasonsSelect(teamName, selectEl, isLunchChecked = false, isBackfillChecked = false, backfillMonth = '', isSunday = false) {
    if (!selectEl) return;
    
    if (isSunday) {
        selectEl.innerHTML = `
            <option value="Tăng ca Chủ Nhật">Tăng ca Chủ Nhật</option>
        `;
        selectEl.value = "Tăng ca Chủ Nhật";
        selectEl.style.display = 'inline-block';
        return;
    }
    
    if (isBackfillChecked) {
        const displayText = backfillMonth ? `Bù giờ tăng ca tháng ${backfillMonth} bị thiếu` : 'Bù giờ tăng ca tháng ... bị thiếu';
        const displayVal = backfillMonth ? `Bù giờ tăng ca tháng ${backfillMonth} bị thiếu` : '';
        selectEl.innerHTML = `
            <option value="${displayVal}">${displayText}</option>
        `;
        selectEl.value = displayVal;
        selectEl.style.display = 'inline-block';
        return;
    }
    
    // Find the team settings in TEAMS
    const team = typeof TEAMS !== 'undefined' && TEAMS.find(t => typeof t === 'object' && t.name === teamName);
    const reasons = team ? team.predefinedReasons || [] : [];
    
    // Filter reasons based on lunch checkbox status
    // "nếu nhân viên có chọn ô tích tăng ca trưa thì mới hiện các nội dung có liên quan tới tăng ca trưa. còn không chọn thì ẩn đi"
    const filteredReasons = reasons.filter(r => {
        const containsLunch = r.toLowerCase().includes('trưa');
        return isLunchChecked ? containsLunch : !containsLunch;
    });

    const placeholder = isLunchChecked ? '-- Chọn lý do tăng ca trưa --' : '-- Chọn lý do tăng ca --';
    
    const prevVal = selectEl.value;
    selectEl.innerHTML = `
        <option value="">${placeholder}</option>
        ${filteredReasons.map(r => `<option value="${r.replace(/"/g, '&quot;')}">${r}</option>`).join('')}
    `;
    if (prevVal && filteredReasons.includes(prevVal)) {
        selectEl.value = prevVal;
    }
    selectEl.style.display = 'inline-block';
}

// ==================== CUSTOM ACTIVITIES UI FOR DESKTOP ====================
function setupAdminCustomActivitiesUI(userId) {
    const listContainer = document.getElementById('admin-ot-custom-activities-list');
    const activityGroup = document.getElementById('admin-ot-custom-activity-group');
    if (!listContainer) return;

    // Reset container first
    listContainer.innerHTML = '';
    
    // Find the user's team
    let userTeam = '';
    if (userId) {
        const foundUser = loadedUsers.find(u => u.id === userId);
        userTeam = foundUser ? (foundUser.team || '') : '';
    } else {
        // Target is self
        const currentUser = JSON.parse(localStorage.getItem('ot_current_user') || 'null');
        userTeam = currentUser ? (currentUser.team || '') : '';
    }

    // Setup Predefined reasons select
    const adminOtLunchEl = document.getElementById('admin-ot-lunch');
    const adminOtBackfillEl = document.getElementById('admin-ot-backfill');
    const adminOtBackfillMonthEl = document.getElementById('admin-ot-backfill-month');
    const adminOtDateEl = document.getElementById('admin-ot-date');
    const adminOtNoteEl = document.getElementById('admin-ot-note');
    const updateAdminPredefinedReasons = () => {
        const isLunchChecked = adminOtLunchEl ? adminOtLunchEl.checked : false;
        const isBackfillChecked = adminOtBackfillEl ? adminOtBackfillEl.checked : false;
        const backfillMonth = adminOtBackfillMonthEl ? adminOtBackfillMonthEl.value.trim() : '';
        const dateVal = adminOtDateEl ? adminOtDateEl.value : '';
        const isSunday = dateVal ? new Date(dateVal + 'T00:00:00').getDay() === 0 : false;
        setupPredefinedReasonsSelect(userTeam, adminOtNoteEl, isLunchChecked, isBackfillChecked, backfillMonth, isSunday);
    };
    
    if (adminOtLunchEl && !adminOtLunchEl.dataset.reasonsListenerBound) {
        adminOtLunchEl.addEventListener('change', updateAdminPredefinedReasons);
        adminOtLunchEl.dataset.reasonsListenerBound = 'true';
    }
    if (adminOtBackfillEl && !adminOtBackfillEl.dataset.reasonsBackfillListenerBound) {
        adminOtBackfillEl.addEventListener('change', updateAdminPredefinedReasons);
        adminOtBackfillEl.dataset.reasonsBackfillListenerBound = 'true';
    }
    if (adminOtBackfillMonthEl && !adminOtBackfillMonthEl.dataset.reasonsMonthListenerBound) {
        adminOtBackfillMonthEl.addEventListener('input', updateAdminPredefinedReasons);
        adminOtBackfillMonthEl.addEventListener('change', updateAdminPredefinedReasons);
        adminOtBackfillMonthEl.dataset.reasonsMonthListenerBound = 'true';
    }
    if (adminOtDateEl && !adminOtDateEl.dataset.reasonsDateListenerBound) {
        adminOtDateEl.addEventListener('change', updateAdminPredefinedReasons);
        adminOtDateEl.addEventListener('input', updateAdminPredefinedReasons);
        adminOtDateEl.dataset.reasonsDateListenerBound = 'true';
    }
    updateAdminPredefinedReasons();

    if (!userTeam || userTeam === 'admin') {
        if (activityGroup) activityGroup.style.display = 'none';
        return;
    }

    // Find the team settings of userTeam in TEAMS
    const teamObj = TEAMS.find(t => typeof t === 'object' && t.name === userTeam);
    const activities = (teamObj && teamObj.customActivities) ? teamObj.customActivities : [];

    const isBackfillChecked = document.getElementById('admin-ot-backfill')?.checked || false;
    const dateVal = document.getElementById('admin-ot-date')?.value || '';
    const isSunday = dateVal ? new Date(dateVal + 'T00:00:00').getDay() === 0 : false;

    if (activities.length > 0) {
        if (activityGroup) activityGroup.style.display = (isBackfillChecked && !isSunday) ? 'none' : 'block';

        listContainer.innerHTML = activities.map(act => `
            <div class="custom-activity-item" style="margin-bottom: 14px; text-align: left;">
                <label class="switch-label" for="admin-chk-${act.id}" style="display: inline-flex; align-items: center; gap: 12px; cursor: pointer;">
                    <input type="checkbox" id="admin-chk-${act.id}" class="admin-ot-custom-activity-checkbox" data-act-id="${act.id}" data-act-name="${act.name}" data-act-mode="${act.calcMode}" onchange="toggleAdminCustomActivityInput('${act.id}')">
                    <span class="switch-slider"></span>
                    <span class="switch-text" style="display: flex; flex-direction: column; gap: 2px;">
                        <strong>${act.name}</strong>
                        <small style="font-size: 11px; color: var(--text-secondary);">Tính chất: ${act.calcMode === 'trip' ? 'Tính theo Chuyến' : 'Tính theo Giờ'}</small>
                    </span>
                </label>
                <div class="form-group" id="admin-ot-custom-activity-detail-group-${act.id}" style="display: none; margin-top: 8px; padding: 0 4px; margin-bottom: 0;">
                    <label style="display:block; margin-bottom:6px; font-size:13px; font-weight:600; color:var(--text-secondary);">${act.detailLabel || 'Chi tiết'}</label>
                    <input type="text" class="admin-ot-custom-activity-detail" data-act-id="${act.id}" placeholder="${act.placeholder || 'Nhập chi tiết...'}" style="width: 100%; height: 38px; background: rgba(0,0,0,0.2); color: #fff; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; padding: 0 10px; font-size: 14px;">
                </div>
            </div>
        `).join('');

        // Bind input listeners for new text inputs to update preview dynamically
        document.querySelectorAll('.admin-ot-custom-activity-detail').forEach(input => {
            input.addEventListener('input', updateAdminOTPreview);
        });
    } else {
        if (activityGroup) activityGroup.style.display = 'none';
    }
}

window.toggleAdminCustomActivityInput = function(actId) {
    const chk = document.querySelector(`.admin-ot-custom-activity-checkbox[data-act-id="${actId}"]`);
    if (chk && chk.checked) {
        // Tự động bỏ chọn các checkbox hoạt động khác (chỉ cho phép chọn tối đa 1 hoạt động)
        document.querySelectorAll('.admin-ot-custom-activity-checkbox').forEach(other => {
            if (other !== chk) {
                other.checked = false;
                // Ẩn chi tiết của checkbox kia đi
                const otherDetailGroup = document.getElementById(`admin-ot-custom-activity-detail-group-${other.dataset.actId}`);
                if (otherDetailGroup) otherDetailGroup.style.display = 'none';
            }
        });
        
        // Hiển thị khung nhập chi tiết của hoạt động này
        const detailGroup = document.getElementById(`admin-ot-custom-activity-detail-group-${actId}`);
        if (detailGroup) detailGroup.style.display = 'block';
    } else {
        // Ẩn khung nhập chi tiết
        const detailGroup = document.getElementById(`admin-ot-custom-activity-detail-group-${actId}`);
        if (detailGroup) detailGroup.style.display = 'none';
    }
    updateAdminOTPreview();
};

window.toggleModalCustomActivityInput = function(actId) {
    const chk = document.querySelector(`.modal-rec-custom-activity-checkbox[data-act-id="${actId}"]`);
    const noteEl = document.getElementById('modal-rec-note');
    if (chk && chk.checked) {
        // Tự động bỏ chọn các checkbox hoạt động khác
        document.querySelectorAll('.modal-rec-custom-activity-checkbox').forEach(other => {
            if (other !== chk) {
                other.checked = false;
                const otherDetailGroup = document.getElementById(`modal-rec-custom-activity-detail-group-${other.dataset.actId}`);
                if (otherDetailGroup) otherDetailGroup.style.display = 'none';
            }
        });
        
        // Hiển thị khung nhập chi tiết của hoạt động này
        const detailGroup = document.getElementById(`modal-rec-custom-activity-detail-group-${actId}`);
        if (detailGroup) {
            detailGroup.style.display = 'block';
            const detailInput = detailGroup.querySelector('.modal-rec-custom-activity-detail');
            if (detailInput) detailInput.required = true;
        }
        if (noteEl) {
            noteEl.required = false;
            noteEl.placeholder = `Mặc định: ${chk.dataset.actName}...`;
        }
    } else {
        // Ẩn khung nhập chi tiết
        const detailGroup = document.getElementById(`modal-rec-custom-activity-detail-group-${actId}`);
        if (detailGroup) {
            detailGroup.style.display = 'none';
            const detailInput = detailGroup.querySelector('.modal-rec-custom-activity-detail');
            if (detailInput) {
                detailInput.required = false;
                detailInput.value = '';
            }
        }
        // Kiểm tra xem còn checkbox nào khác được chọn không
        const anyChecked = document.querySelector('.modal-rec-custom-activity-checkbox:checked');
        if (!anyChecked && noteEl) {
            noteEl.required = true;
            noteEl.placeholder = "Lý do tăng ca, phân công công việc...";
        }
    }
};


function setupEmployeeCustomActivitiesUI() {
    const listContainer = document.getElementById('ot-custom-activities-list');
    const activityGroup = document.getElementById('ot-custom-activity-group');
    if (!listContainer) return;

    // Reset container first
    listContainer.innerHTML = '';
    
    const currentUser = JSON.parse(localStorage.getItem('ot_current_user') || 'null');
    const userTeam = currentUser ? (currentUser.team || '') : '';

    // Setup Predefined reasons select
    const otLunchEl = document.getElementById('ot-lunch');
    const otBackfillEl = document.getElementById('ot-backfill');
    const otBackfillMonthEl = document.getElementById('ot-backfill-month');
    const otDateEl = document.getElementById('ot-date');
    const otNoteEl = document.getElementById('ot-note');
    const updateEmployeePredefinedReasons = () => {
        const isLunchChecked = otLunchEl ? otLunchEl.checked : false;
        const isBackfillChecked = otBackfillEl ? otBackfillEl.checked : false;
        const backfillMonth = otBackfillMonthEl ? otBackfillMonthEl.value.trim() : '';
        const dateVal = otDateEl ? otDateEl.value : '';
        const isSunday = dateVal ? new Date(dateVal + 'T00:00:00').getDay() === 0 : false;
        setupPredefinedReasonsSelect(userTeam, otNoteEl, isLunchChecked, isBackfillChecked, backfillMonth, isSunday);
    };
    
    if (otLunchEl && !otLunchEl.dataset.reasonsListenerBound) {
        otLunchEl.addEventListener('change', updateEmployeePredefinedReasons);
        otLunchEl.dataset.reasonsListenerBound = 'true';
    }
    if (otBackfillEl && !otBackfillEl.dataset.reasonsBackfillListenerBound) {
        otBackfillEl.addEventListener('change', updateEmployeePredefinedReasons);
        otBackfillEl.dataset.reasonsBackfillListenerBound = 'true';
    }
    if (otBackfillMonthEl && !otBackfillMonthEl.dataset.reasonsMonthListenerBound) {
        otBackfillMonthEl.addEventListener('input', updateEmployeePredefinedReasons);
        otBackfillMonthEl.addEventListener('change', updateEmployeePredefinedReasons);
        otBackfillMonthEl.dataset.reasonsMonthListenerBound = 'true';
    }
    if (otDateEl && !otDateEl.dataset.reasonsDateListenerBound) {
        otDateEl.addEventListener('change', updateEmployeePredefinedReasons);
        otDateEl.addEventListener('input', updateEmployeePredefinedReasons);
        otDateEl.dataset.reasonsDateListenerBound = 'true';
    }
    updateEmployeePredefinedReasons();

    if (!userTeam || userTeam === 'admin') {
        if (activityGroup) activityGroup.style.display = 'none';
        return;
    }

    // Find the team settings of userTeam in TEAMS
    const teamObj = TEAMS.find(t => typeof t === 'object' && t.name === userTeam);
    const activities = (teamObj && teamObj.customActivities) ? teamObj.customActivities : [];

    const isBackfillChecked = document.getElementById('ot-backfill')?.checked || false;
    const dateVal = document.getElementById('ot-date')?.value || '';
    const isSunday = dateVal ? new Date(dateVal + 'T00:00:00').getDay() === 0 : false;

    if (activities.length > 0) {
        if (activityGroup) activityGroup.style.display = (isBackfillChecked && !isSunday) ? 'none' : 'block';

        listContainer.innerHTML = activities.map(act => `
            <div class="custom-activity-item" style="margin-bottom: 14px; text-align: left;">
                <label class="switch-label" for="chk-${act.id}" style="display: inline-flex; align-items: center; gap: 12px; cursor: pointer;">
                    <input type="checkbox" id="chk-${act.id}" class="ot-custom-activity-checkbox" data-act-id="${act.id}" data-act-name="${act.name}" data-act-mode="${act.calcMode}" onchange="toggleEmployeeCustomActivityInput('${act.id}')">
                    <span class="switch-slider"></span>
                    <span class="switch-text" style="display: flex; flex-direction: column; gap: 2px;">
                        <strong>${act.name}</strong>
                        <small style="font-size: 11px; color: var(--text-secondary);">Tính chất: ${act.calcMode === 'trip' ? 'Tính theo Chuyến' : 'Tính theo Giờ'}</small>
                    </span>
                </label>
                <div class="form-group" id="ot-custom-activity-detail-group-${act.id}" style="display: none; margin-top: 8px; padding: 0 4px; margin-bottom: 0;">
                    <label style="display:block; margin-bottom:6px; font-size:13px; font-weight:600; color:var(--text-secondary);">${act.detailLabel || 'Chi tiết'}</label>
                    <input type="text" class="ot-custom-activity-detail" data-act-id="${act.id}" placeholder="${act.placeholder || 'Nhập chi tiết...'}" style="width: 100%; height: 38px; background: rgba(0,0,0,0.2); color: #fff; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; padding: 0 10px; font-size: 14px;">
                </div>
            </div>
        `).join('');

        // Bind input listeners for new text inputs to update preview dynamically
        document.querySelectorAll('.ot-custom-activity-detail').forEach(input => {
            input.addEventListener('input', updateOTPreview);
        });
    } else {
        if (activityGroup) activityGroup.style.display = 'none';
    }
}

window.toggleEmployeeCustomActivityInput = function(actId) {
    const chk = document.querySelector(`.ot-custom-activity-checkbox[data-act-id="${actId}"]`);
    if (chk && chk.checked) {
        // Tự động bỏ chọn các checkbox hoạt động khác (chỉ cho phép chọn tối đa 1 hoạt động)
        document.querySelectorAll('.ot-custom-activity-checkbox').forEach(other => {
            if (other !== chk) {
                other.checked = false;
                // Ẩn chi tiết của checkbox kia đi
                const otherDetailGroup = document.getElementById(`ot-custom-activity-detail-group-${other.dataset.actId}`);
                if (otherDetailGroup) otherDetailGroup.style.display = 'none';
            }
        });
        
        // Hiển thị khung nhập chi tiết của hoạt động này
        const detailGroup = document.getElementById(`ot-custom-activity-detail-group-${actId}`);
        if (detailGroup) detailGroup.style.display = 'block';
    } else {
        // Ẩn khung nhập chi tiết
        const detailGroup = document.getElementById(`ot-custom-activity-detail-group-${actId}`);
        if (detailGroup) detailGroup.style.display = 'none';
    }
    updateOTPreview();
};

async function forgotPasswordDialog() {
    const modalBody = `
        <div id="modal-form-forgot-password" class="login-form active" style="text-align: left; padding: 0;">
            <div class="form-group" style="margin-bottom: 12px;">
                <label style="display:block;margin-bottom:6px;font-weight:600;">Tên đăng nhập</label>
                <div style="display: flex; gap: 8px;">
                    <input type="text" id="forgot-username" placeholder="Nhập tên đăng nhập..." class="input-sm" style="flex:1; box-sizing:border-box;" required>
                    <button type="button" id="btn-forgot-send-otp" class="btn btn-primary btn-sm" style="height:38px; white-space:nowrap; font-size:12px;">Gửi OTP</button>
                </div>
            </div>
            <div class="form-group" style="margin-bottom: 12px;">
                <label style="display:block;margin-bottom:6px;font-weight:600;">Mã OTP xác thực (Nhận qua Email)</label>
                <input type="text" id="forgot-otp" placeholder="Nhập mã OTP 6 chữ số..." class="input-sm" style="width:100%; box-sizing:border-box;" required maxlength="6" pattern="[0-9]*" oninput="this.value = this.value.replace(/[^0-9]/g, '')">
            </div>
            <div class="form-group" style="margin-bottom: 0;">
                <label style="display:block;margin-bottom:6px;font-weight:600;">Mật khẩu mới</label>
                <input type="password" id="forgot-new-password" placeholder="Nhập mật khẩu mới..." class="input-sm" style="width:100%; box-sizing:border-box;" required>
            </div>
        </div>
    `;
    
    showModal('Quên mật khẩu', modalBody, [
        { text: 'Hủy', class: 'btn-ghost' },
        { text: 'Đặt lại mật khẩu', class: 'btn btn-primary btn-sm', action: async () => {
            const username = document.getElementById('forgot-username').value.trim();
            const otpCode = document.getElementById('forgot-otp').value.trim();
            const newPassword = document.getElementById('forgot-new-password').value.trim();
            
            if (!username || !otpCode || !newPassword) {
                return showToast('Vui lòng nhập đầy đủ thông tin!', 'error');
            }
            if (newPassword.length < 4) {
                return showToast('Mật khẩu mới phải có ít nhất 4 ký tự!', 'error');
            }
            
            try {
                const res = await api('/api/auth/forgot-password', 'POST', { username, otpCode, newPassword });
                showToast(res.message || 'Đặt lại mật khẩu thành công!', 'success');
            } catch (e) {
                showToast(e.message || 'Lỗi đặt lại mật khẩu!', 'error');
            }
        }}
    ]);

    const btnSendOtp = document.getElementById('btn-forgot-send-otp');
    if (btnSendOtp) {
        btnSendOtp.onclick = async () => {
            const username = document.getElementById('forgot-username').value.trim();
            if (!username) {
                return showToast('Vui lòng nhập Tên đăng nhập trước!', 'error');
            }
            btnSendOtp.disabled = true;
            btnSendOtp.textContent = 'Gửi...';
            try {
                await api('/api/auth/send-email-otp', 'POST', { username });
                showToast('Mã OTP đã được gửi đến Email liên kết của tài khoản!', 'success');
            } catch (e) {
                showToast(e.message || 'Lỗi gửi OTP!', 'error');
            } finally {
                btnSendOtp.disabled = false;
                btnSendOtp.textContent = 'Gửi OTP';
            }
        };
    }
}

// ==================== EMAIL SETUP MODAL FOR FIRST LOGIN ====================
function injectEmailSetupModalStyle() {
    if (document.getElementById('email-setup-style')) return;
    const style = document.createElement('style');
    style.id = 'email-setup-style';
    style.textContent = `
        .email-setup-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(15, 23, 42, 0.6);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 99999;
            opacity: 0;
            transition: opacity 0.3s ease;
        }
        .email-setup-overlay.active {
            opacity: 1;
        }
        .email-setup-modal {
            background: rgba(30, 41, 59, 0.75);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 16px;
            width: 90%;
            max-width: 400px;
            padding: 30px;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.3);
            color: #f8fafc;
            transform: scale(0.9);
            transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
            text-align: left;
        }
        .email-setup-overlay.active .email-setup-modal {
            transform: scale(1);
        }
        .email-setup-title {
            font-size: 20px;
            font-weight: 700;
            margin-bottom: 10px;
            background: linear-gradient(135deg, #6366f1, #a855f7);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            text-align: center;
        }
        .email-setup-desc {
            font-size: 13px;
            color: #94a3b8;
            line-height: 1.6;
            margin-bottom: 20px;
            text-align: center;
        }
        .email-setup-group {
            margin-bottom: 20px;
        }
        .email-setup-label {
            display: block;
            font-size: 12px;
            font-weight: 600;
            color: #cbd5e1;
            margin-bottom: 8px;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }
        .email-setup-input {
            width: 100%;
            height: 42px;
            padding: 0 14px;
            background: rgba(15, 23, 42, 0.4);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 8px;
            color: #f8fafc;
            font-size: 14px;
            box-sizing: border-box;
            transition: all 0.2s;
        }
        .email-setup-input:focus {
            outline: none;
            border-color: #6366f1;
            box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2);
        }
        .email-setup-btn {
            width: 100%;
            height: 42px;
            background: linear-gradient(135deg, #6366f1, #4f46e5);
            border: none;
            border-radius: 8px;
            color: white;
            font-weight: 600;
            font-size: 14px;
            cursor: pointer;
            transition: all 0.2s;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
        }
        .email-setup-btn:hover {
            opacity: 0.95;
            transform: translateY(-1px);
        }
        .email-setup-btn:disabled {
            background: #475569;
            cursor: not-allowed;
            transform: none;
        }
        .email-setup-btn-ghost {
            background: transparent;
            border: 1px solid rgba(255, 255, 255, 0.15);
            color: #cbd5e1;
        }
        .email-setup-btn-ghost:hover {
            background: rgba(255, 255, 255, 0.05);
            color: white;
        }
    `;
    document.head.appendChild(style);
}

function showEmailSetupOverlay(username, onVerified) {
    injectEmailSetupModalStyle();
    
    const oldOverlay = document.getElementById('email-setup-overlay');
    if (oldOverlay) oldOverlay.remove();

    const overlay = document.createElement('div');
    overlay.id = 'email-setup-overlay';
    overlay.className = 'email-setup-overlay';
    
    overlay.innerHTML = `
        <div class="email-setup-modal">
            <div class="email-setup-title">Xác thực Email tài khoản</div>
            <div class="email-setup-desc">
                Tài khoản của bạn chưa cấu hình Email. Vui lòng nhập và xác thực Email của bạn để nhận mã OTP khôi phục mật khẩu sau này.
            </div>
            
            <div id="email-setup-step1">
                <div class="email-setup-group">
                    <label class="email-setup-label">Địa chỉ Email</label>
                    <input type="email" id="email-setup-address" class="email-setup-input" placeholder="ten-cua-ban@company.com" required>
                </div>
                <button type="button" id="email-setup-btn-send" class="email-setup-btn">Gửi mã OTP</button>
            </div>
            
            <div id="email-setup-step2" style="display: none;">
                <div class="email-setup-group" style="margin-bottom: 12px;">
                    <label class="email-setup-label" id="email-setup-sent-label">Mã OTP (6 chữ số)</label>
                    <input type="text" id="email-setup-otp" class="email-setup-input" placeholder="Nhập 6 chữ số..." maxlength="6" pattern="[0-9]*" oninput="this.value = this.value.replace(/[^0-9]/g, '')">
                </div>
                <div style="display: flex; gap: 10px;">
                    <button type="button" id="email-setup-btn-back" class="email-setup-btn email-setup-btn-ghost" style="flex: 1;">Quay lại</button>
                    <button type="button" id="email-setup-btn-verify" class="email-setup-btn" style="flex: 2;">Xác nhận</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(overlay);
    setTimeout(() => overlay.classList.add('active'), 10);
    
    const btnSend = document.getElementById('email-setup-btn-send');
    const btnVerify = document.getElementById('email-setup-btn-verify');
    const btnBack = document.getElementById('email-setup-btn-back');
    const inputEmail = document.getElementById('email-setup-address');
    const inputOtp = document.getElementById('email-setup-otp');
    
    const step1 = document.getElementById('email-setup-step1');
    const step2 = document.getElementById('email-setup-step2');
    
    let targetEmail = '';
    
    btnSend.onclick = async () => {
        const email = inputEmail.value.trim();
        if (!email) {
            return showToast('Vui lòng nhập địa chỉ Email!', 'error');
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return showToast('Địa chỉ Email không hợp lệ!', 'error');
        }
        
        btnSend.disabled = true;
        btnSend.textContent = 'Đang gửi mã OTP...';
        
        try {
            await api('/api/auth/send-email-otp', 'POST', { username, email });
            targetEmail = email;
            
            showToast('Đã gửi mã OTP tới email của bạn!', 'success');
            step1.style.display = 'none';
            step2.style.display = 'block';
            inputOtp.value = '';
            inputOtp.focus();
        } catch (e) {
            showToast(e.message || 'Lỗi gửi mã OTP!', 'error');
        } finally {
            btnSend.disabled = false;
            btnSend.textContent = 'Gửi mã OTP';
        }
    };
    
    btnBack.onclick = () => {
        step2.style.display = 'none';
        step1.style.display = 'block';
        inputEmail.focus();
    };
    
    btnVerify.onclick = async () => {
        const otpCode = inputOtp.value.trim();
        if (!otpCode || otpCode.length !== 6) {
            return showToast('Vui lòng nhập mã OTP gồm 6 chữ số!', 'error');
        }
        
        btnVerify.disabled = true;
        btnVerify.textContent = 'Đang xác nhận...';
        
        try {
            await api('/api/auth/verify-email-otp', 'POST', { username, email: targetEmail, otpCode });
            showToast('Xác thực email thành công!', 'success');
            
            overlay.classList.remove('active');
            setTimeout(() => overlay.remove(), 300);
            
            if (onVerified) onVerified(targetEmail);
        } catch (e) {
            showToast(e.message || 'Mã OTP không chính xác!', 'error');
        } finally {
            btnVerify.disabled = false;
            btnVerify.textContent = 'Xác nhận';
        }
    };
}

// Expose global methods for inline HTML onclick handlers
window.editRecordDialog = editRecordDialog;
window.deleteRecord = deleteRecord;
window.approveRecord = approveRecord;
window.rejectRecord = rejectRecord;
window.resetUserDevice = resetUserDevice;
window.approveUnlinkDevice = approveUnlinkDevice;
window.rejectUnlinkDevice = rejectUnlinkDevice;
window.editUserDialog = editUserDialog;
window.deleteUser = deleteUser;
window.addTeamFromModal = addTeamFromModal;
window.renameTeamFromModal = renameTeamFromModal;
window.deleteTeamFromModal = deleteTeamFromModal;
window.handleDatabaseCleanup = handleDatabaseCleanup;
window.forgotPasswordDialog = forgotPasswordDialog;

// Expose team modal methods to prevent mangling in production builds
window.selectTeamInModal = selectTeamInModal;
window.setPrimaryLeader = setPrimaryLeader;
window.deleteActivityFromTeam = deleteActivityFromTeam;
window.deletePredefinedReason = deletePredefinedReason;
window.removeMemberFromTeam = removeMemberFromTeam;
window.cloneTeamSettingsModal = cloneTeamSettingsModal;
window.saveTeamQuota = saveTeamQuota;
window.addActivityToTeam = addActivityToTeam;
window.addPredefinedReason = addPredefinedReason;
window.addMemberToTeamFromModal = addMemberToTeamFromModal;
window.saveTeamSettingsFromModal = saveTeamSettingsFromModal;
window.toggleAdminTheme = toggleAdminTheme;
window.setTableDensity = setTableDensity;
window.toggleKpiCollapse = toggleKpiCollapse;
window.resetAdminRecordFilters = resetAdminRecordFilters;
window.bulkApproveRecords = bulkApproveRecords;
window.bulkRejectRecords = bulkRejectRecords;
window.bulkApproveRejectedRecords = bulkApproveRejectedRecords;
window.bulkDeleteRejectedRecords = bulkDeleteRejectedRecords;
