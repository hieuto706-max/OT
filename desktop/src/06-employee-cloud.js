// ==================== EMPLOYEE DASHBOARD ====================
async function initEmployeeDashboard(user) {
    const welcomeEl = document.getElementById('emp-welcome');
    if (welcomeEl) welcomeEl.textContent = `Xin chào, ${user.fullname}`;
    
    const empNameEl = document.getElementById('emp-user-fullname');
    if (empNameEl) empNameEl.textContent = user.fullname;
    
    const empAvatarEl = document.getElementById('emp-user-avatar');
    if (empAvatarEl && user.fullname) {
        empAvatarEl.textContent = user.fullname.trim().charAt(0).toUpperCase();
    }

    const dateEl = document.getElementById('emp-date');
    if (dateEl) dateEl.textContent = formatDateFull(new Date());
    
    const todayStr = new Date().toISOString().split('T')[0];
    document.getElementById('ot-date').value = todayStr;
    document.getElementById('ot-date').max = todayStr;
    document.getElementById('emp-filter-month').value = getCurrentMonth();
    if (!TEAMS || TEAMS.length === 0) {
        await loadTeams();
    }
    setupEmployeeCustomActivitiesUI();
    handleDateChange();
    updateOTPreview();
    await refreshEmployeeRecords();
}

function updateOTPreview() {
    const otBackfill = document.getElementById('ot-backfill');
    const isBackfill = otBackfill ? otBackfill.checked : false;
    const previewItems = document.getElementById('preview-items');
    const previewTotal = document.getElementById('preview-total');
    let items = [];
    let total = 0;

    let customActivity = '';
    let calcMode = '';
    let customDetail = '';

    const checkedChk = document.querySelector('.ot-custom-activity-checkbox:checked');
    if (checkedChk) {
        customActivity = checkedChk.dataset.actName;
        calcMode = checkedChk.dataset.actMode;
        const input = document.querySelector(`.ot-custom-activity-detail[data-act-id="${checkedChk.dataset.actId}"]`);
        customDetail = input ? input.value.trim() : '';
    }

    const hasTrip = calcMode === 'trip' && !!customActivity;
    const province = customDetail;

    const dateEl = document.getElementById('ot-date');
    const dateVal = dateEl ? dateEl.value : '';
    const isSunday = dateVal ? new Date(dateVal + 'T00:00:00').getDay() === 0 : false;

    if (isBackfill) {
        const hoursVal = parseFloat(document.getElementById('ot-backfill-hours').value) || 0;
        if (hoursVal > 0) {
            items.push({ label: 'Bù tăng ca', value: `${parseFloat(hoursVal.toFixed(2))} giờ` });
            total = hoursVal;
        }
    } else if (isSunday) {
        const hoursVal = parseFloat(document.getElementById('ot-backfill-hours').value) || 0;
        if (hoursVal > 0) {
            items.push({ label: 'Tăng ca Chủ Nhật', value: `${parseFloat(hoursVal.toFixed(2))} giờ` });
            total = hoursVal;
        }
    } else {
        const hasLunch = document.getElementById('ot-lunch').checked;
        const otStart = document.getElementById('ot-start').value;
        const otEnd = document.getElementById('ot-end').value;

        if (hasLunch) {
            items.push({ label: 'OT Trưa (12:20 - 13:20)', value: `${OT_LUNCH_HOURS} giờ` });
            total += OT_LUNCH_HOURS;
        }

        if (otStart && otEnd) {
            const eveningHours = calculateEveningOT(otStart, otEnd);
            if (eveningHours > 0) {
                const isOvernight = timeToMinutes(otEnd) < timeToMinutes(otStart);
                items.push({ label: `OT Chiều (${otStart} - ${otEnd}${isOvernight ? ' hôm sau' : ''})`, value: `${parseFloat(eveningHours.toFixed(2))} giờ` });
                total += eveningHours;
            }
        }
    }

    if (customActivity && calcMode === 'hour') {
        items.push({ label: 'Hoạt động', value: customActivity });
    }

    if (hasTrip && province) {
        items.push({ label: customActivity, value: province });
    }

    previewItems.innerHTML = items.length === 0
        ? '<div class="preview-item"><span>Chưa có OT nào được chọn</span></div>'
        : items.map(i => `<div class="preview-item"><span>${i.label}</span><span class="preview-item-value">${i.value}</span></div>`).join('');
    previewTotal.textContent = parseFloat(total.toFixed(2));

    // Cập nhật tính bắt buộc của ghi chú
    const noteEl = document.getElementById('ot-note');
    if (noteEl) {
        if (hasTrip && total === 0) {
            noteEl.required = false;
            noteEl.placeholder = "Mặc định: " + customActivity + " " + province;
        } else {
            noteEl.required = true;
            noteEl.placeholder = "Lý do tăng ca, phân công công việc...";
        }
    }
}

function updateAdminOTPreview() {
    const targetSelf = document.getElementById('admin-ot-target-self');
    const targetEmp = document.getElementById('admin-ot-target-emp');
    const userSelect = document.getElementById('admin-ot-user');
    const otDate = document.getElementById('admin-ot-date');
    const otBackfill = document.getElementById('admin-ot-backfill');
    const backfillHours = document.getElementById('admin-ot-backfill-hours');
    const otLunch = document.getElementById('admin-ot-lunch');
    const otStart = document.getElementById('admin-ot-start');
    const otEnd = document.getElementById('admin-ot-end');
    const otNote = document.getElementById('admin-ot-note');

    // Element bindings
    const ticketTarget = document.getElementById('preview-ticket-target');
    const ticketDate = document.getElementById('preview-ticket-date');
    const ticketLunch = document.getElementById('preview-ticket-lunch');
    const ticketEvening = document.getElementById('preview-ticket-evening');
    const ticketTotal = document.getElementById('preview-ticket-total');
    const ticketNote = document.getElementById('preview-ticket-note');

    if (!ticketTarget) return; // not rendered yet

    // 1. Target
    if (targetSelf && targetSelf.checked) {
        const currentUser = JSON.parse(localStorage.getItem('ot_current_user') || '{}');
        ticketTarget.innerHTML = `<span class="badge badge-admin" style="font-size: 10px;">Cá nhân</span> <strong>${currentUser.fullname || 'Quản lý'}</strong>`;
    } else if (targetEmp && targetEmp.checked && userSelect) {
        const selectedText = userSelect.options[userSelect.selectedIndex]?.text || '';
        ticketTarget.innerHTML = `<span class="badge badge-employee" style="font-size: 10px;">Nhân viên</span> <strong>${selectedText.replace(/^[^-]+-\s*/, '') || 'Chưa chọn'}</strong>`;
    }

    // 2. Date
    if (otDate && otDate.value) {
        const d = new Date(otDate.value);
        if (!isNaN(d.getTime())) {
            const formatted = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
            ticketDate.textContent = formatted;
        } else {
            ticketDate.textContent = '-';
        }
    } else {
        ticketDate.textContent = 'Chưa chọn ngày';
    }

    // 3. Custom Activity
    let customActivity = '';
    let calcMode = '';
    let customDetail = '';

    const checkedChk = document.querySelector('.admin-ot-custom-activity-checkbox:checked');
    if (checkedChk) {
        customActivity = checkedChk.dataset.actName;
        calcMode = checkedChk.dataset.actMode;
        const input = document.querySelector(`.admin-ot-custom-activity-detail[data-act-id="${checkedChk.dataset.actId}"]`);
        customDetail = input ? input.value.trim() : '';
    }

    const ticketActGroup = document.getElementById('preview-ticket-activity-group');
    const ticketActLabel = document.getElementById('preview-ticket-activity-label');
    const ticketActValue = document.getElementById('preview-ticket-activity');

    if (ticketActGroup && ticketActLabel && ticketActValue) {
        if (customActivity) {
            ticketActGroup.style.display = 'flex';
            ticketActLabel.textContent = customActivity;
            if (calcMode === 'trip') {
                ticketActValue.textContent = customDetail || 'Chưa nhập chi tiết';
            } else {
                ticketActValue.innerHTML = `<span class="preview-active-badge">✓ Đăng ký</span>`;
            }
        } else {
            ticketActGroup.style.display = 'none';
        }
    }

    const hasTrip = calcMode === 'trip' && !!customActivity;
    const province = customDetail;

    // 4. Lunch, Evening and Total Hours
    let total = 0;
    const isBackfill = otBackfill && otBackfill.checked;
    const dateVal = otDate ? otDate.value : '';
    const isSunday = dateVal ? new Date(dateVal + 'T00:00:00').getDay() === 0 : false;

    if (isBackfill) {
        const hours = parseFloat(backfillHours?.value) || 0;
        ticketLunch.textContent = '-';
        ticketEvening.textContent = `Bù tăng ca: ${parseFloat(hours.toFixed(2))} giờ`;
        total = hours;
    } else if (isSunday) {
        const hours = parseFloat(backfillHours?.value) || 0;
        ticketLunch.textContent = '-';
        ticketEvening.textContent = `Tăng ca Chủ Nhật: ${parseFloat(hours.toFixed(2))} giờ`;
        total = hours;
    } else {
        // Lunch
        if (otLunch && otLunch.checked) {
            ticketLunch.innerHTML = `<span class="preview-active-badge">✓ Đăng ký</span> (${OT_LUNCH_HOURS} giờ)`;
            total += OT_LUNCH_HOURS;
        } else {
            ticketLunch.textContent = 'Không đăng ký';
        }

        // Evening
        if (otStart && otEnd && otStart.value && otEnd.value) {
            const eveningHours = calculateEveningOT(otStart.value, otEnd.value);
            if (eveningHours > 0) {
                const isOvernight = timeToMinutes(otEnd.value) < timeToMinutes(otStart.value);
                ticketEvening.innerHTML = `<span class="preview-active-badge">✓ ${otStart.value} - ${otEnd.value}${isOvernight ? ' hôm sau' : ''}</span> (${parseFloat(eveningHours.toFixed(2))} giờ)`;
                total += eveningHours;
            } else {
                ticketEvening.textContent = 'Không đăng ký';
            }
        } else {
            ticketEvening.textContent = 'Không đăng ký';
        }
    }

    // Total
    ticketTotal.textContent = `${parseFloat(total.toFixed(2))} giờ`;

    // Cập nhật tính bắt buộc của ghi chú cho Admin
    if (otNote) {
        if (hasTrip && total === 0) {
            otNote.required = false;
            otNote.placeholder = "Mặc định: " + customActivity + " " + province;
        } else {
            otNote.required = true;
            otNote.placeholder = "Lý do tăng ca, phân công công việc...";
        }
    }

    // Note
    if (otNote && otNote.value.trim()) {
        ticketNote.textContent = otNote.value.trim();
    } else if (hasTrip && total === 0) {
        ticketNote.textContent = "Mặc định: " + customActivity + " " + province;
    } else {
        ticketNote.textContent = 'Chưa có ghi chú...';
    }
}

async function handleOTSubmit(e) {
    e.preventDefault();
    const user = JSON.parse(localStorage.getItem('ot_current_user'));
    if (!user) return;

    const date = document.getElementById('ot-date').value;
    const otBackfill = document.getElementById('ot-backfill');
    const isBackfill = otBackfill ? otBackfill.checked : false;
    const hasLunch = isBackfill ? false : document.getElementById('ot-lunch').checked;
    const otStart = document.getElementById('ot-start').value;
    const otEnd = document.getElementById('ot-end').value;
    let note = document.getElementById('ot-note').value.trim();
    const errorEl = document.getElementById('ot-error');
    const successEl = document.getElementById('ot-success');
    errorEl.textContent = '';
    successEl.textContent = '';

    if (!date) { errorEl.textContent = 'Vui lòng chọn ngày!'; return; }

    const todayStr = new Date(Date.now() + 7 * 3600000).toISOString().split('T')[0];
    const currentMonth = todayStr.substring(0, 7);
    const selectedMonth = date.substring(0, 7);
    if (selectedMonth < currentMonth && !isBackfill) {
        errorEl.textContent = 'Để chọn ngày thuộc tháng cũ, vui lòng tích chọn "Bù tăng ca"!';
        return;
    }

    let customActivity = '';
    let calcMode = '';
    let customDetail = '';

    const checkedChk = document.querySelector('.ot-custom-activity-checkbox:checked');
    if (checkedChk) {
        customActivity = checkedChk.dataset.actName;
        calcMode = checkedChk.dataset.actMode;
        const input = document.querySelector(`.ot-custom-activity-detail[data-act-id="${checkedChk.dataset.actId}"]`);
        customDetail = input ? input.value.trim() : '';
    }

    const hasTrip = calcMode === 'trip' && !!customActivity;
    const province = customDetail;

    if (hasTrip && !province) {
        let detailLabel = 'chi tiết';
        const userTeam = user.team || '';
        const teamObj = TEAMS.find(t => typeof t === 'object' && t.name === userTeam);
        const actObj = teamObj?.customActivities?.find(a => a.name === customActivity);
        if (actObj && actObj.detailLabel) detailLabel = actObj.detailLabel;
        errorEl.textContent = `Vui lòng nhập ${detailLabel.toLowerCase()}!`;
        return;
    }

    let eveningHours = 0;
    let totalHours = 0;

    const isSunday = new Date(date + 'T00:00:00').getDay() === 0;

    if (isBackfill || isSunday) {
        const hoursVal = parseFloat(document.getElementById('ot-backfill-hours').value) || 0;
        if (hoursVal <= 0) { errorEl.textContent = isSunday ? 'Vui lòng nhập số giờ tăng ca Chủ Nhật hợp lệ!' : 'Vui lòng nhập số giờ bù hợp lệ!'; return; }
        totalHours = hoursVal;
        eveningHours = hoursVal;
        if (isBackfill) {
            note = '[BÙ THÁNG TRƯỚC] ' + note;
        }
    } else {
        eveningHours = calculateEveningOT(otStart, otEnd);
        const lunchHours = hasLunch ? OT_LUNCH_HOURS : 0;
        totalHours = lunchHours + eveningHours;
        if (totalHours <= 0 && !hasTrip) { errorEl.textContent = 'Vui lòng chọn ít nhất một loại OT hoặc hoạt động ngoài giờ!'; return; }
    }

    if (hasTrip && totalHours === 0 && !note) {
        note = customActivity + ' ' + province;
    } else if (!note) {
        errorEl.textContent = 'Vui lòng nhập ghi chú!';
        return;
    }

    try {
        const data = await api('/api/records', 'POST', {
            userId: user.id, date, hasLunchOT: (isBackfill || isSunday) ? false : hasLunch,
            otStart: (!(isBackfill || isSunday) && eveningHours > 0) ? otStart : '',
            otEnd: (!(isBackfill || isSunday) && eveningHours > 0) ? otEnd : '',
            eveningOTHours: eveningHours, totalHours, note, isBackfill,
            deliveryProvince: hasTrip ? province : '',
            customActivity,
            calcMode,
            createdMonth: isBackfill ? getCurrentMonth() : date.substring(0, 7)
        });

        const action = data.updated ? 'Đã cập nhật' : 'Đã lưu';
        successEl.textContent = `${action} ${parseFloat(totalHours.toFixed(2))} giờ tăng ca!`;
        showToast(`${action} ${parseFloat(totalHours.toFixed(2))} giờ tăng ca`);

        if (otBackfill) otBackfill.checked = false;
        const normalInputs = document.getElementById('ot-normal-inputs');
        const backfillGroup = document.getElementById('ot-backfill-hours-group');
        if (normalInputs) normalInputs.style.display = 'block';
        if (backfillGroup) backfillGroup.style.display = 'none';
        
        // Restore label and backfill toggle switch display
        const labelEl = backfillGroup ? backfillGroup.querySelector('label') : null;
        if (labelEl) labelEl.textContent = 'Số giờ tăng ca cần bù:';
        const backfillRow = otBackfill ? otBackfill.closest('.checkbox-label') || otBackfill.closest('.switch-label') : null;
        if (backfillRow) backfillRow.style.display = '';
        
        const backfillHoursEl = document.getElementById('ot-backfill-hours');
        if (backfillHoursEl) backfillHoursEl.value = '';

        document.getElementById('ot-lunch').checked = false;
        document.getElementById('ot-start').value = WORK_END;
        document.getElementById('ot-end').value = WORK_END;
        document.getElementById('ot-note').value = '';
        
        document.querySelectorAll('.ot-custom-activity-checkbox').forEach(chk => {
            chk.checked = false;
        });
        document.querySelectorAll('.ot-custom-activity-detail').forEach(input => {
            input.value = '';
        });
        const otCustomActGroup = document.getElementById('ot-custom-activity-group');
        if (otCustomActGroup) otCustomActGroup.style.display = 'none';

        handleDateChange();
        updateOTPreview();
        await refreshEmployeeRecords();
        setTimeout(() => { successEl.textContent = ''; }, 3000);
    } catch (err) {
        errorEl.textContent = err.message;
    }
}

async function handleAdminOTSubmit(e) {
    e.preventDefault();
    const targetSelf = document.getElementById('admin-ot-target-self');
    let userId = '';
    if (targetSelf && targetSelf.checked) {
        const currentUser = JSON.parse(localStorage.getItem('ot_current_user') || 'null');
        userId = currentUser ? currentUser.id : '';
    } else {
        userId = document.getElementById('admin-ot-user').value;
    }
    const date = document.getElementById('admin-ot-date').value;
    const adminOtBackfill = document.getElementById('admin-ot-backfill');
    const isBackfill = adminOtBackfill ? adminOtBackfill.checked : false;
    const hasLunch = isBackfill ? false : document.getElementById('admin-ot-lunch').checked;
    const otStart = document.getElementById('admin-ot-start').value;
    const otEnd = document.getElementById('admin-ot-end').value;
    let note = document.getElementById('admin-ot-note').value.trim();
    const errorEl = document.getElementById('admin-ot-error');
    const successEl = document.getElementById('admin-ot-success');
    errorEl.textContent = '';
    successEl.textContent = '';

    if (!userId) { errorEl.textContent = 'Vui lòng chọn nhân viên!'; return; }
    if (!date) { errorEl.textContent = 'Vui lòng chọn ngày!'; return; }

    let customActivity = '';
    let calcMode = '';
    let customDetail = '';

    const checkedChk = document.querySelector('.admin-ot-custom-activity-checkbox:checked');
    if (checkedChk) {
        customActivity = checkedChk.dataset.actName;
        calcMode = checkedChk.dataset.actMode;
        const input = document.querySelector(`.admin-ot-custom-activity-detail[data-act-id="${checkedChk.dataset.actId}"]`);
        customDetail = input ? input.value.trim() : '';
    }

    const hasTrip = calcMode === 'trip' && !!customActivity;
    const province = customDetail;

    if (hasTrip && !province) {
        let detailLabel = 'chi tiết';
        if (userId) {
            const foundUser = loadedUsers.find(u => u.id === userId);
            const userTeam = foundUser ? (foundUser.team || '') : '';
            const teamObj = TEAMS.find(t => typeof t === 'object' && t.name === userTeam);
            const actObj = teamObj?.customActivities?.find(a => a.name === customActivity);
            if (actObj && actObj.detailLabel) detailLabel = actObj.detailLabel;
        }
        errorEl.textContent = `Vui lòng nhập ${detailLabel.toLowerCase()}!`;
        return;
    }

    let eveningHours = 0;
    let totalHours = 0;

    const isSunday = new Date(date + 'T00:00:00').getDay() === 0;

    if (isBackfill || isSunday) {
        const hoursVal = parseFloat(document.getElementById('admin-ot-backfill-hours').value) || 0;
        if (hoursVal <= 0) { errorEl.textContent = isSunday ? 'Vui lòng nhập số giờ tăng ca Chủ Nhật hợp lệ!' : 'Vui lòng nhập số giờ bù hợp lệ!'; return; }
        totalHours = hoursVal;
        eveningHours = hoursVal;
        if (isBackfill) {
            note = '[BÙ THÁNG TRƯỚC] ' + note;
        }
    } else {
        eveningHours = calculateEveningOT(otStart, otEnd);
        const lunchHours = hasLunch ? OT_LUNCH_HOURS : 0;
        totalHours = lunchHours + eveningHours;
        if (totalHours <= 0 && !hasTrip) { errorEl.textContent = 'Vui lòng chọn ít nhất một loại OT hoặc hoạt động ngoài giờ!'; return; }
    }

    if (hasTrip && totalHours === 0 && !note) {
        note = customActivity + ' ' + province;
    } else if (!note) {
        errorEl.textContent = 'Vui lòng nhập ghi chú!';
        return;
    }

    try {
        const data = await api('/api/records', 'POST', {
            userId, date, hasLunchOT: (isBackfill || isSunday) ? false : hasLunch,
            otStart: (!(isBackfill || isSunday) && eveningHours > 0) ? otStart : '',
            otEnd: (!(isBackfill || isSunday) && eveningHours > 0) ? otEnd : '',
            eveningOTHours: eveningHours, totalHours, note, isBackfill,
            deliveryProvince: hasTrip ? province : '',
            customActivity,
            calcMode,
            createdMonth: isBackfill ? getCurrentMonth() : date.substring(0, 7)
        });

        const action = data.updated ? 'Đã cập nhật' : 'Đã lưu';
        successEl.textContent = `${action} ${parseFloat(totalHours.toFixed(2))} giờ tăng ca thành công!`;
        showToast(`${action} ${parseFloat(totalHours.toFixed(2))} giờ tăng ca`);

        document.getElementById('admin-ot-user').value = '';
        if (targetSelf) {
            targetSelf.checked = true;
            const event = new Event('change');
            targetSelf.dispatchEvent(event);
        }
        if (adminOtBackfill) adminOtBackfill.checked = false;
        const normalInputs = document.getElementById('admin-ot-normal-inputs');
        const backfillGroup = document.getElementById('admin-ot-backfill-hours-group');
        if (normalInputs) normalInputs.style.display = 'block';
        if (backfillGroup) backfillGroup.style.display = 'none';
        
        // Restore label and backfill toggle switch display
        const labelEl = backfillGroup ? backfillGroup.querySelector('label') : null;
        if (labelEl) labelEl.textContent = 'Số giờ tăng ca cần bù';
        const backfillRow = adminOtBackfill ? adminOtBackfill.closest('.switch-label') || adminOtBackfill.closest('.checkbox-label') : null;
        if (backfillRow) backfillRow.style.display = '';
        
        const backfillHoursEl = document.getElementById('admin-ot-backfill-hours');
        if (backfillHoursEl) backfillHoursEl.value = '';

        document.getElementById('admin-ot-lunch').checked = false;
        document.getElementById('admin-ot-start').value = WORK_END;
        document.getElementById('admin-ot-end').value = WORK_END;
        document.getElementById('admin-ot-note').value = '';
        
        document.querySelectorAll('.admin-ot-custom-activity-checkbox').forEach(chk => {
            chk.checked = false;
        });
        document.querySelectorAll('.admin-ot-custom-activity-detail').forEach(input => {
            input.value = '';
        });
        const adminOtCustomActGroup = document.getElementById('admin-ot-custom-activity-group');
        if (adminOtCustomActGroup) adminOtCustomActGroup.style.display = 'none';

        const todayStr2 = new Date().toISOString().split('T')[0];
        const adminOtDateEl = document.getElementById('admin-ot-date');
        if (adminOtDateEl) {
            adminOtDateEl.value = todayStr2;
            handleAdminDateChange();
        }

        updateAdminOTPreview();
        setTimeout(() => { successEl.textContent = ''; }, 3000);
        await refreshAdminStats();
        await refreshAdminRecords();
        await refreshReport();
    } catch (err) {
        errorEl.textContent = err.message;
    }
}
 async function refreshEmployeeRecords() {
    const user = JSON.parse(localStorage.getItem('ot_current_user'));
    if (!user) return;

    // Check custom activities setup for user's team
    const userTeam = user.team || '';
    let hasCustomActivities = false;
    let empBtnText = '2. Hoạt động khác';
    if (userTeam && userTeam !== 'admin' && typeof TEAMS !== 'undefined') {
        const teamObj = TEAMS.find(t => typeof t === 'object' && t.name === userTeam);
        if (teamObj && teamObj.customActivities && teamObj.customActivities.length > 0) {
            hasCustomActivities = true;
            empBtnText = '2. ' + teamObj.customActivities.map(a => a.name).join(' / ');
        }
    }

    const recTypeSelector = document.getElementById('emp-rec-type-selector');
    const btnEmpRecTypeTrips = document.getElementById('btn-emp-rec-type-trips');
    if (hasCustomActivities) {
        if (recTypeSelector) recTypeSelector.style.display = 'flex';
        if (btnEmpRecTypeTrips) {
            btnEmpRecTypeTrips.style.display = 'inline-block';
            btnEmpRecTypeTrips.textContent = empBtnText;
        }
    } else {
        if (recTypeSelector) recTypeSelector.style.display = 'none';
        currentEmpRecType = 'ot';
    }

    const month = document.getElementById('emp-filter-month').value;
    try {
        const data = await api(`/api/records?userId=${user.id}&month=${month}`);
        const records = (data.records || []).filter(r => {
            const isBf = r.isBackfill || (r.note && (r.note.includes('[BÙ THÁNG TRƯỚC]') || r.note.includes('[TĂNG THÁNG NÀY]')));
            return isBf ? true : r.date.startsWith(month);
        });
        employeeOTRecords = records;
        
        const tbody = document.getElementById('emp-records-body');
        const holidays = (currentSystemSettings.holidays || "")
            .split(',')
            .map(d => d.trim())
            .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d));

        // Load private salary inputs
        const savedSalary = localStorage.getItem('emp_basic_salary') || '';
        const savedDays = localStorage.getItem('emp_standard_days') || '';
        
        const salaryInput = document.getElementById('emp-basic-salary');
        const daysInput = document.getElementById('emp-standard-days');
        if (salaryInput && salaryInput.value === '') {
            salaryInput.value = savedSalary;
        }
        
        const autoDays = getStandardWorkingDays(month);
        if (daysInput) {
            if (savedDays !== '') {
                daysInput.value = savedDays;
            } else {
                daysInput.value = autoDays;
            }
        }
        
        setTimeout(() => {
            updateEmployeeOTIncome();
        }, 50);

        // Stats calculation (based on all records of this month)
        let totalLunchOT = 0, totalEveningOT = 0, totalHours = 0, totalEqHours = 0;
        records.forEach(r => {
            const isBackfill = r.isBackfill || (r.note && (r.note.includes('[BÙ THÁNG TRƯỚC]') || r.note.includes('[TĂNG THÁNG NÀY]')));
            const isApproved = r.status !== 'pending' && r.status !== 'rejected';
            
            if (isApproved) {
                if (!r.customActivity || r.calcMode === 'hour') {
                    const lh = r.hasLunchOT ? OT_LUNCH_HOURS : 0;
                    totalLunchOT += lh;
                    totalEveningOT += isBackfill ? 0 : (r.eveningOTHours || 0);
                    totalHours += r.totalHours;

                    const coef = getOTCoefficient(r.date, holidays);
                    totalEqHours += (r.totalHours || 0) * coef;
                }
            }
        });

        // Apply Record Type Filter
        let recordsFiltered = [];
        if (currentEmpRecType === 'ot') {
            recordsFiltered = records.filter(r => (!r.customActivity || r.customActivity.trim() === '') && (r.totalHours > 0 || r.isBackfill));
        } else {
            recordsFiltered = records.filter(r => r.customActivity && r.customActivity.trim() !== '');
        }

        // Set Table Headers dynamically
        if (tbody && tbody.previousElementSibling) {
            if (currentEmpRecType === 'ot') {
                tbody.previousElementSibling.innerHTML = `<tr>
                    <th>Ngày</th>
                    <th>OT Trưa</th>
                    <th>OT Chiều</th>
                    <th>Giờ BĐ</th>
                    <th>Giờ KT</th>
                    <th>Tổng (giờ)</th>
                    <th>Trạng thái</th>
                    <th>Ghi chú</th>
                    <th>Thao tác</th>
                </tr>`;
            } else {
                tbody.previousElementSibling.innerHTML = `<tr>
                    <th>Ngày</th>
                    <th>Hoạt động</th>
                    <th>Hình thức / Chi tiết</th>
                    <th>Trạng thái</th>
                    <th>Ghi chú</th>
                    <th>Thao tác</th>
                </tr>`;
            }
        }

        const totalCustom = records.filter(r => r.customActivity && r.status !== 'rejected').length;
        const customCardHTML = hasCustomActivities ? `
            <div class="stat-card stat-card-orange" style="border-left-color: var(--accent-orange);">
                <div class="stat-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                    </svg>
                </div>
                <div class="stat-info">
                    <span class="stat-value">${totalCustom}</span>
                    <span class="stat-label">Hoạt động khác</span>
                </div>
            </div>
        ` : '';

        const statsHtml = `
            <div class="stat-card stat-card-purple">
                <div class="stat-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                        <line x1="16" y1="2" x2="16" y2="6"/>
                        <line x1="8" y1="2" x2="8" y2="6"/>
                        <line x1="3" y1="10" x2="21" y2="10"/>
                    </svg>
                </div>
                <div class="stat-info">
                    <span class="stat-value">${records.filter(r => !r.customActivity || r.calcMode === 'hour').length}</span>
                    <span class="stat-label">Số ngày OT</span>
                </div>
            </div>
            <div class="stat-card stat-card-orange">
                <div class="stat-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"/>
                        <path d="M12 6v6l4 2"/>
                    </svg>
                </div>
                <div class="stat-info">
                    <span class="stat-value">${totalLunchOT.toFixed(1)}h</span>
                    <span class="stat-label">OT Trưa</span>
                </div>
            </div>
            <div class="stat-card stat-card-blue">
                <div class="stat-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                    </svg>
                </div>
                <div class="stat-info">
                    <span class="stat-value">${totalEveningOT.toFixed(1)}h</span>
                    <span class="stat-label">OT Chiều</span>
                </div>
            </div>
             <div class="stat-card stat-card-green">
                 <div class="stat-icon">
                     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                         <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                     </svg>
                 </div>
                 <div class="stat-info">
                     <span class="stat-value">${totalHours.toFixed(1)}h <span style="font-size: 11px; font-weight: normal; color: var(--text-secondary);">(QĐ: ${parseFloat(totalEqHours.toFixed(2))}h)</span></span>
                     <span class="stat-label">Tổng OT (Gốc / Quy đổi)</span>
                 </div>
             </div>
            ${customCardHTML}
        `;

        if (recordsFiltered.length === 0) {
            const cols = (currentEmpRecType === 'ot') ? 9 : 6;
            tbody.innerHTML = `<tr class="empty-row"><td colspan="${cols}">Chưa có dữ liệu ${currentEmpRecType === 'ot' ? 'tăng ca' : 'hoạt động tùy chọn'}</td></tr>`;
            const statsCardsEl = document.getElementById('emp-stats-cards');
            if (statsCardsEl) {
                statsCardsEl.innerHTML = statsHtml;
            }
            return;
        }

        tbody.innerHTML = recordsFiltered.map(r => {
            let badgeClass = 'status-approved';
            let badgeText = 'Đã duyệt';
            if (r.status === 'pending') {
                badgeClass = 'status-pending';
                badgeText = 'Chờ duyệt';
            } else if (r.status === 'rejected') {
                badgeClass = 'status-rejected';
                badgeText = 'Từ chối';
            }

            if (currentEmpRecType === 'ot') {
                const coef = getOTCoefficient(r.date, holidays);
                const actualHours = r.totalHours || 0;
                const eqHours = actualHours * coef;
                return `<tr>
                    <td>${formatDate(r.date)}</td>
                    <td>${r.hasLunchOT ? '<span class="tag tag-yes">✓ Có</span>' : '<span class="tag tag-no">Không</span>'}</td>
                    <td>${r.eveningOTHours > 0 ? `<span class="text-green text-bold">${r.eveningOTHours.toFixed(1)}h</span>` : '<span style="color:var(--text-muted)">—</span>'}</td>
                    <td>${r.otStart || '—'}</td>
                    <td>${r.otEnd || '—'}</td>
                    <td>
                        <div style="display:flex; flex-direction:column; align-items:center; gap:2px; margin: 4px 0;">
                            <span class="badge-total-ot" style="font-weight:700;">Gốc: ${actualHours.toFixed(1)}h</span>
                            <span class="tag tag-success" style="font-size:10px; font-weight:700; background:rgba(16,185,129,0.15); color:var(--accent-green); padding: 1px 4px; border-radius:4px; white-space:nowrap;">QĐ: ${parseFloat(eqHours.toFixed(2))}h</span>
                        </div>
                    </td>
                    <td><span class="status-badge ${badgeClass}">${badgeText}</span></td>
                    <td>${r.note ? escapeHTML(r.note) : '<span style="color:var(--text-muted)">—</span>'}</td>
                    <td><div class="action-buttons">
                        <button class="btn-icon-only edit" onclick="editRecordDialog('${r.id}', 'employee')" title="Sửa" style="margin-right: 4px;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                        </button>
                        <button class="btn-icon-only delete" onclick="deleteRecord('${r.id}', 'employee')" title="Xóa">
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
                return `<tr>
                    <td>${formatDate(r.date)}</td>
                    <td><strong>${escapeHTML(r.customActivity)}</strong></td>
                    <td>${detail}</td>
                    <td><span class="status-badge ${badgeClass}">${badgeText}</span></td>
                    <td>${r.note ? escapeHTML(r.note) : '<span style="color:var(--text-muted)">—</span>'}</td>
                    <td><div class="action-buttons">
                        <button class="btn-icon-only edit" onclick="editRecordDialog('${r.id}', 'employee')" title="Sửa" style="margin-right: 4px;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                        </button>
                        <button class="btn-icon-only delete" onclick="deleteRecord('${r.id}', 'employee')" title="Xóa">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                                <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2-2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                            </svg>
                        </button>
                    </div></td>
                </tr>`;
            }
        }).join('');

        const statsCardsEl = document.getElementById('emp-stats-cards');
        if (statsCardsEl) {
            statsCardsEl.innerHTML = statsHtml;
        }
    } catch (e) {}
}

function updateEmployeeOTIncome() {
    const salaryInput = document.getElementById('emp-basic-salary');
    const daysInput = document.getElementById('emp-standard-days');
    if (!salaryInput || !daysInput) return;
    
    const salary = parseFloat(salaryInput.value) || 0;
    const days = parseFloat(daysInput.value) || 26;
    const hourlyRate = salary / (days * 8);
    
    localStorage.setItem('emp_basic_salary', salaryInput.value);
    localStorage.setItem('emp_standard_days', daysInput.value);
    
    const settings = currentSystemSettings || { holidays: "" };
    const holidays = (settings.holidays || "")
        .split(',')
        .map(d => d.trim())
        .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d));
        
    let totalEqHours = 0;
    employeeOTRecords.forEach(r => {
        const isApproved = r.status !== 'pending' && r.status !== 'rejected';
        if (isApproved) {
            if (!r.customActivity || r.calcMode === 'hour') {
                const coef = getOTCoefficient(r.date, holidays);
                totalEqHours += (r.totalHours || 0) * coef;
            }
        }
    });
    
    const otIncome = totalEqHours * hourlyRate;
    
    const incomeTotalEl = document.getElementById('emp-ot-income-total');
    if (incomeTotalEl) {
        incomeTotalEl.textContent = Math.round(otIncome).toLocaleString('vi-VN') + ' VND';
    }
    
    const hourlyRateEl = document.getElementById('emp-hourly-rate');
    if (hourlyRateEl) {
        hourlyRateEl.textContent = Math.round(hourlyRate).toLocaleString('vi-VN') + ' VND/h';
    }
}

// ==================== CLOUD WAKING & SYNC CONFIG ====================
async function initCloudConfig() {
    try {
        if (isGitHubPages) {
            // Khi chạy trên web (otmanager.id.vn / GitHub Pages), luôn dùng API Cloud
            API_BASE = 'https://api.otmanager.id.vn';
        } else if (window.OT_CLOUD_URL) {
            // Chỉ Electron mới dùng URL từ server-config.js (localhost)
            API_BASE = window.OT_CLOUD_URL;
        } else {
            API_BASE = 'https://api.otmanager.id.vn';
        }
        if (API_BASE.endsWith('/')) {
            API_BASE = API_BASE.slice(0, -1);
        }
        console.log("[Desktop App] API Base trỏ tới Cloud:", API_BASE);

        if (isElectron) {
            // Thử kết nối nhanh xem server có đang hoạt động không
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 1500); // 1.5s timeout cho ping nhanh
                const res = await fetch(`${API_BASE}/api/server-info`, { 
                    method: 'GET', 
                    mode: 'cors',
                    signal: controller.signal
                });
                clearTimeout(timeoutId);
                if (res.ok) {
                    console.log("[Cloud] Server is already awake. Direct entry.");
                    initSseConnection();
                    return;
                }
            } catch (e) {
                console.log("[Cloud] Server seems asleep or network slow, showing wakeup loader.");
            }

            showCloudWakeupOverlay();
            await wakeupCloudServer();
        } else {
            initSseConnection();
        }
    } catch (e) {
        console.error("Lỗi cấu hình kết nối Cloud:", e);
    }
}

function showCloudWakeupOverlay() {
    if (document.getElementById('cloud-wakeup-overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'cloud-wakeup-overlay';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100vw';
    overlay.style.height = '100vh';
    overlay.style.backgroundColor = 'rgba(15, 15, 26, 0.95)';
    overlay.style.display = 'flex';
    overlay.style.flexDirection = 'column';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.zIndex = '99999';
    overlay.style.color = '#ffffff';
    overlay.style.fontFamily = 'Inter, sans-serif';
    overlay.style.transition = 'opacity 0.5s ease';

    overlay.innerHTML = `
        <div style="text-align: center; max-width: 400px; padding: 20px;">
            <div style="width: 50px; height: 50px; border: 3px solid rgba(16, 185, 129, 0.2); border-top: 3px solid #10b981; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 20px;"></div>
            <h3 style="margin-top: 0; color: #10b981; font-size: 1.3rem; margin-bottom: 10px;">Đang kết nối đến hệ thống...</h3>
            <p style="font-size: 0.9rem; color: #a1a1aa; line-height: 1.5; margin-bottom: 8px;">Hệ thống đang chuẩn bị tài nguyên và thiết lập đường truyền bảo mật.</p>
            <p style="font-size: 0.8rem; color: #71717a; font-style: italic;">Vui lòng đợi trong giây lát...</p>
        </div>
        <style>
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        </style>
    `;
    document.body.appendChild(overlay);
}

function hideCloudWakeupOverlay() {
    const overlay = document.getElementById('cloud-wakeup-overlay');
    if (overlay) {
        overlay.style.opacity = '0';
        setTimeout(() => overlay.remove(), 500);
    }
}

async function wakeupCloudServer() {
    let attempts = 0;
    const maxAttempts = 30; // Thử tối đa 30 lần (~60 giây)
    
    while (attempts < maxAttempts) {
        try {
            console.log(`[Cloud] Thử kết nối đến Cloud Server (Lần ${attempts + 1})...`);
            const res = await fetch(`${API_BASE}/api/server-info`, { method: 'GET', mode: 'cors' });
            if (res.ok) {
                console.log("[Cloud] Kết nối thành công! Server đã hoạt động.");
                hideCloudWakeupOverlay();
                initSseConnection();
                return true;
            }
        } catch (e) {
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        attempts++;
    }
    
    const overlay = document.getElementById('cloud-wakeup-overlay');
    if (overlay) {
        overlay.innerHTML = `
            <div style="text-align: center; max-width: 400px; padding: 20px;">
                <div style="font-size: 3rem; margin-bottom: 20px;">⚠️</div>
                <h3 style="margin-top: 0; color: #ef4444; font-size: 1.3rem; margin-bottom: 10px;">Lỗi Kết Nối</h3>
                <p style="font-size: 0.9rem; color: #a1a1aa; line-height: 1.5; margin-bottom: 20px;">Không thể kết nối đến Cloud Server. Vui lòng kiểm tra lại kết nối mạng hoặc trạng thái dịch vụ của Render.</p>
                <div style="display:flex; gap: 10px; justify-content: center;">
                    <button onclick="window.location.reload()" style="background: #10b981; color: white; border: none; padding: 10px 20px; border-radius: 8px; font-weight: 600; cursor: pointer; margin-right: 10px;">Thử lại</button>
                    <button onclick="document.getElementById('cloud-wakeup-overlay').remove()" style="background: #27272a; color: white; border: none; padding: 10px 20px; border-radius: 8px; font-weight: 600; cursor: pointer;">Dùng Offline</button>
                </div>
            </div>
        `;
    }
    return false;
}

function compareVersions(v1, v2) {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);
    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
        const p1 = parts1[i] || 0;
        const p2 = parts2[i] || 0;
        if (p1 < p2) return -1;
        if (p1 > p2) return 1;
    }
    return 0;
}

async function checkUpdateManual() {
    if (!isElectron) return;
    showToast('Đang kiểm tra bản cập nhật...', 'info');
    try {
        const cloudUrl = window.OT_CLOUD_URL || API_BASE;

        if (!cloudUrl) {
            showModal(
                'Kiểm tra cập nhật',
                `<p style="color: var(--text-secondary); line-height: 1.6;">
                    Ứng dụng đang hoạt động ở chế độ Offline (không kết nối Cloud Server).<br><br>
                    Để sử dụng tính năng kiểm tra cập nhật, vui lòng cấu hình <strong>serverUrl</strong> (đường dẫn Cloud Server Render) trong file <code>config.json</code> ở thư mục gốc của ứng dụng.
                </p>`,
                [{ text: 'Đóng', class: 'btn-ghost' }]
            );
            return;
        }

        // 2. Lấy version hiện tại của ứng dụng local
        const localVer = window.OT_LOCAL_VERSION || localStorage.getItem('ot_app_version') || '1.6.2';
        const localBuildTime = window.OT_LOCAL_BUILD_TIME || parseInt(localStorage.getItem('ot_app_build_time')) || 0;

        // 3. Lấy version mới nhất trên Cloud Server
        const cloudRes = await fetch(`${cloudUrl}/api/version`);
        const cloudData = await cloudRes.json();
        const cloudVer = cloudData.version || '1.0.0';
        const cloudBuildTime = cloudData.buildTime || 0;

        const cmp = compareVersions(localVer, cloudVer);
        const hasHotfix = cmp === 0 && localBuildTime > 0 && cloudBuildTime > (localBuildTime + 60000); // Có bản vá lỗi mới hơn ít nhất 1 phút

        if (cmp < 0 || hasHotfix) {
            const checkRes = await fetch(`${cloudUrl}/download/desktop?check=true`);
            const checkData = await checkRes.json();

            if (checkData.ready) {
                const title = hasHotfix ? 'Có bản vá lỗi mới!' : 'Có phiên bản mới!';
                const bodyText = hasHotfix ?
                    `<p style="color: var(--text-secondary); line-height: 1.6; margin-bottom: 12px;">
                        Phát hiện bản vá lỗi (hotfix) mới cho phiên bản hiện tại:<br>
                        • Phiên bản: <strong style="color: var(--accent-green-light);">v${localVer}</strong><br>
                        • Bản vá mới hơn bản đang cài trên máy.
                    </p>
                    <p style="color: var(--text-muted); font-size: 13px;">
                        Bạn có muốn tải về và cập nhật bản vá lỗi này ngay không?
                    </p>` :
                    `<p style="color: var(--text-secondary); line-height: 1.6; margin-bottom: 12px;">
                        Phát hiện phiên bản mới của ứng dụng trên hệ thống Cloud:<br>
                        • Phiên bản hiện tại: <strong style="color: var(--accent-orange);">v${localVer}</strong><br>
                        • Phiên bản mới nhất: <strong style="color: var(--accent-green-light);">v${cloudVer}</strong>
                    </p>
                    <p style="color: var(--text-muted); font-size: 13px;">
                        Bạn có muốn tải xuống phiên bản mới nhất ngay trong ứng dụng không?
                    </p>`;

                showModal(
                    title,
                    bodyText,
                    [
                        { text: 'Để sau', class: 'btn-ghost' },
                        { 
                            text: hasHotfix ? 'Vá lỗi ngay' : 'Tải về ngay', 
                            class: 'btn btn-primary btn-sm', 
                            action: async () => {
                                if (hasHotfix) {
                                    showToast('Đang tải và áp dụng bản vá nhanh...', 'info');
                                    try {
                                        let result;
                                        if (window.electronAPI && window.electronAPI.applyHotfix) {
                                            result = await window.electronAPI.applyHotfix(cloudUrl, cloudBuildTime);
                                        } else {
                                            const res = await fetch(`${localServerUrl}/api/apply-hotfix`, {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ cloudUrl, buildTime: cloudBuildTime })
                                            });
                                            result = await res.json();
                                        }
                                        if (result.success) {
                                            showToast('Đã áp dụng bản vá thành công! Đang tự khởi động lại...', 'success');
                                            setTimeout(() => {
                                                window.location.reload();
                                            }, 1500);
                                        } else {
                                            throw new Error(result.message || 'Lỗi không xác định');
                                        }
                                    } catch (err) {
                                        showToast(`Lỗi khi vá: ${err.message}. Vui lòng thử lại sau hoặc tải bản cài đặt mới.`, 'error');
                                    }
                                } else {
                                    const downloadUrl = cloudData.desktopDownloadUrl || `${cloudUrl}/download/desktop`;
                                    try {
                                        showToast('Đang chuẩn bị tải bản cập nhật...', 'info');
                                        if (window.electronAPI && window.electronAPI.triggerUpdate) {
                                            window.electronAPI.triggerUpdate(downloadUrl, cloudVer);
                                            showToast('Bắt đầu tải xuống bản cập nhật!', 'success');
                                        } else {
                                            const res = await fetch(`${localServerUrl}/api/trigger-update`, {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ downloadUrl, version: cloudVer })
                                            });
                                            if (!res.ok) {
                                                const errData = await res.json().catch(() => ({}));
                                                throw new Error(errData.message || `HTTP ${res.status}`);
                                            }
                                            showToast('Bắt đầu tải xuống bản cập nhật!', 'success');
                                        }
                                    } catch (e) {
                                        console.error('Lỗi khi kích hoạt cập nhật:', e);
                                        showToast('Không thể tự động tải xuống. Đang mở trình duyệt để tải...', 'warning');
                                        window.open(downloadUrl, '_blank');
                                    }
                                }
                            } 
                        }
                    ]
                );
            } else {
                showModal(
                    'Bản cập nhật chưa sẵn sàng',
                    `<p style="color: var(--text-secondary); line-height: 1.6; margin-bottom: 12px;">
                        Phiên bản <strong style="color: var(--accent-green-light);">v${cloudVer}</strong> đã được phát hành nhưng file cài đặt (.exe) chưa sẵn sàng để tải.<br><br>
                        • Phiên bản hiện tại: <strong>v${localVer}</strong>
                    </p>
                    <p style="color: var(--text-muted); font-size: 13px;">
                        File bộ cài đặt (.exe) có thể chưa được upload lên GitHub Releases. Vui lòng thử lại sau hoặc mở GitHub Releases để kiểm tra.
                    </p>`,
                    [
                        { text: 'Đóng', class: 'btn-ghost' },
                        { 
                            text: 'Mở GitHub Releases', 
                            class: 'btn btn-primary btn-sm', 
                            action: () => {
                                window.open('https://github.com/hieuto706-max/OT/releases', '_blank');
                            } 
                        }
                    ]
                );
            }
        } else {
            showModal(
                'Kiểm tra cập nhật',
                `<p style="color: var(--accent-green-light); font-weight: 600; font-size: 15px; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
                    ✓ Bạn đang dùng phiên bản mới nhất
                </p>
                <p style="color: var(--text-secondary); line-height: 1.6;">
                    • Phiên bản hiện tại: <strong>v${localVer}</strong><br>
                    Ứng dụng của bạn hoàn toàn tương thích và đã được cập nhật đầy đủ.
                </p>`,
                [{ text: 'Đóng', class: 'btn-ghost' }]
            );
        }
    } catch (err) {
        showToast('Không thể kết nối đến Cloud Server. Máy chủ đám mây có thể đang khởi động (mất khoảng 1 phút) hoặc tạm ngưng hoạt động. Vui lòng thử lại sau!', 'error');
        console.error('Lỗi check cập nhật:', err);
    }
}

async function checkUpdateSilent() {
    if (!isElectron) return;
    try {
        const cloudUrl = window.OT_CLOUD_URL || API_BASE;
        if (!cloudUrl) return;

        const localVer = window.OT_LOCAL_VERSION || localStorage.getItem('ot_app_version') || '1.6.2';
        const localBuildTime = window.OT_LOCAL_BUILD_TIME || parseInt(localStorage.getItem('ot_app_build_time')) || 0;

        const cloudRes = await fetch(`${cloudUrl}/api/version`);
        const cloudData = await cloudRes.json();
        const cloudVer = cloudData.version || '1.0.0';
        const cloudBuildTime = cloudData.buildTime || 0;

        const cmp = compareVersions(localVer, cloudVer);
        const hasHotfix = cmp === 0 && localBuildTime > 0 && cloudBuildTime > (localBuildTime + 60000); // Có bản vá lỗi mới hơn ít nhất 1 phút

        if (cmp < 0 || hasHotfix) {
            const checkRes = await fetch(`${cloudUrl}/download/desktop?check=true`);
            const checkData = await checkRes.json();

            if (checkData.ready) {
                const title = hasHotfix ? 'Có bản vá lỗi mới!' : 'Có phiên bản mới!';
                const bodyText = hasHotfix ?
                    `<p style="color: var(--text-secondary); line-height: 1.6; margin-bottom: 12px;">
                        Phát hiện bản vá lỗi (hotfix) mới cho phiên bản hiện tại:<br>
                        • Phiên bản: <strong style="color: var(--accent-green-light);">v${localVer}</strong><br>
                        • Bản vá mới hơn bản đang cài trên máy.
                    </p>
                    <p style="color: var(--text-muted); font-size: 13px;">
                        Bạn có muốn tải về và cập nhật bản vá lỗi này ngay không?
                    </p>` :
                    `<p style="color: var(--text-secondary); line-height: 1.6; margin-bottom: 12px;">
                        Phát hiện phiên bản mới của ứng dụng trên hệ thống Cloud:<br>
                        • Phiên bản hiện tại: <strong style="color: var(--accent-orange);">v${localVer}</strong><br>
                        • Phiên bản mới nhất: <strong style="color: var(--accent-green-light);">v${cloudVer}</strong>
                    </p>
                    <p style="color: var(--text-muted); font-size: 13px;">
                        Bạn có muốn tải xuống phiên bản mới nhất ngay trong ứng dụng không?
                    </p>`;

                showModal(
                    title,
                    bodyText,
                    [
                        { text: 'Để sau', class: 'btn-ghost' },
                        { 
                            text: hasHotfix ? 'Vá lỗi ngay' : 'Tải về ngay', 
                            class: 'btn btn-primary btn-sm', 
                            action: async () => {
                                if (hasHotfix) {
                                    showToast('Đang tải và áp dụng bản vá nhanh...', 'info');
                                    try {
                                        let result;
                                        if (window.electronAPI && window.electronAPI.applyHotfix) {
                                            result = await window.electronAPI.applyHotfix(cloudUrl, cloudBuildTime);
                                        } else {
                                            const res = await fetch(`${localServerUrl}/api/apply-hotfix`, {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ cloudUrl, buildTime: cloudBuildTime })
                                            });
                                            result = await res.json();
                                        }
                                        if (result.success) {
                                            showToast('Đã áp dụng bản vá thành công! Đang tự khởi động lại...', 'success');
                                            setTimeout(() => {
                                                window.location.reload();
                                            }, 1500);
                                        } else {
                                            throw new Error(result.message || 'Lỗi không xác định');
                                        }
                                    } catch (err) {
                                        showToast(`Lỗi khi vá: ${err.message}. Vui lòng thử lại sau hoặc tải bản cài đặt mới.`, 'error');
                                    }
                                } else {
                                    const downloadUrl = cloudData.desktopDownloadUrl || `${cloudUrl}/download/desktop`;
                                    try {
                                        showToast('Đang chuẩn bị tải bản cập nhật...', 'info');
                                        if (window.electronAPI && window.electronAPI.triggerUpdate) {
                                            window.electronAPI.triggerUpdate(downloadUrl, cloudVer);
                                            showToast('Bắt đầu tải xuống bản cập nhật!', 'success');
                                        } else {
                                            const res = await fetch(`${localServerUrl}/api/trigger-update`, {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ downloadUrl, version: cloudVer })
                                            });
                                            if (!res.ok) {
                                                const errData = await res.json().catch(() => ({}));
                                                throw new Error(errData.message || `HTTP ${res.status}`);
                                            }
                                            showToast('Bắt đầu tải xuống bản cập nhật!', 'success');
                                        }
                                    } catch (e) {
                                        console.error('Lỗi khi kích hoạt cập nhật:', e);
                                        showToast('Không thể tự động tải xuống. Đang mở trình duyệt để tải...', 'warning');
                                        window.open(downloadUrl, '_blank');
                                    }
                                }
                            } 
                        }
                    ]
                );
            } else {
                showModal(
                    'Bản cập nhật chưa sẵn sàng',
                    `<p style="color: var(--text-secondary); line-height: 1.6; margin-bottom: 12px;">
                        Phiên bản <strong style="color: var(--accent-green-light);">v${cloudVer}</strong> đã được phát hành nhưng file cài đặt (.exe) chưa sẵn sàng để tải.<br><br>
                        • Phiên bản hiện tại: <strong>v${localVer}</strong>
                    </p>
                    <p style="color: var(--text-muted); font-size: 13px;">
                        File bộ cài đặt (.exe) có thể chưa được upload lên GitHub Releases. Vui lòng thử lại sau hoặc mở GitHub Releases để kiểm tra.
                    </p>`,
                    [
                        { text: 'Đóng', class: 'btn-ghost' },
                        { 
                            text: 'Mở GitHub Releases', 
                            class: 'btn btn-primary btn-sm', 
                            action: () => {
                                window.open('https://github.com/hieuto706-max/OT/releases', '_blank');
                            } 
                        }
                    ]
                );
            }
        }
    } catch (err) {
        console.error('Lỗi check cập nhật ngầm:', err);
    }
}

function handleDateChange() {
    const otDateEl = document.getElementById('ot-date');
    if (!otDateEl) return;
    
    const dateVal = otDateEl.value;
    const normalInputs = document.getElementById('ot-normal-inputs');
    const backfillGroup = document.getElementById('ot-backfill-hours-group');
    const customActGroup = document.getElementById('ot-custom-activity-group');
    const backfillCheckbox = document.getElementById('ot-backfill');
    
    const currentUser = JSON.parse(localStorage.getItem('ot_current_user') || 'null');
    const userTeam = currentUser ? (currentUser.team || '') : '';
    const teamObj = TEAMS.find(t => typeof t === 'object' && t.name === userTeam);
    const activities = (teamObj && teamObj.customActivities) ? teamObj.customActivities : [];
    
    const labelEl = backfillGroup ? backfillGroup.querySelector('label') : null;
    
    if (dateVal) {
        const isSunday = new Date(dateVal + 'T00:00:00').getDay() === 0;
        const isBackfill = backfillCheckbox ? backfillCheckbox.checked : false;
        
        if (isSunday) {
            if (normalInputs) normalInputs.style.display = 'none';
            if (backfillGroup) backfillGroup.style.display = 'block';
            if (labelEl) labelEl.textContent = 'Số giờ tăng ca Chủ Nhật:';
            
            if (activities.length > 0) {
                if (customActGroup) customActGroup.style.display = 'block';
            }
            
            const backfillRow = backfillCheckbox ? backfillCheckbox.closest('.checkbox-label') || backfillCheckbox.closest('.switch-label') : null;
            if (backfillRow) backfillRow.style.display = 'none';
        } else {
            const backfillRow = backfillCheckbox ? backfillCheckbox.closest('.checkbox-label') || backfillCheckbox.closest('.switch-label') : null;
            if (backfillRow) backfillRow.style.display = '';
            if (labelEl) labelEl.textContent = 'Số giờ tăng ca cần bù:';
            
            if (isBackfill) {
                if (normalInputs) normalInputs.style.display = 'none';
                if (backfillGroup) backfillGroup.style.display = 'block';
                if (customActGroup) customActGroup.style.display = 'none';
            } else {
                if (normalInputs) normalInputs.style.display = 'block';
                if (backfillGroup) backfillGroup.style.display = 'none';
                if (activities.length > 0) {
                    if (customActGroup) customActGroup.style.display = 'block';
                }
            }
        }
    }
    updateOTPreview();
}

function handleAdminDateChange() {
    const otDateEl = document.getElementById('admin-ot-date');
    if (!otDateEl) return;
    
    const dateVal = otDateEl.value;
    const normalInputs = document.getElementById('admin-ot-normal-inputs');
    const backfillGroup = document.getElementById('admin-ot-backfill-hours-group');
    const customActGroup = document.getElementById('admin-ot-custom-activity-group');
    const backfillCheckbox = document.getElementById('admin-ot-backfill');
    
    let userTeam = '';
    const targetSelf = document.getElementById('admin-ot-target-self');
    if (targetSelf && targetSelf.checked) {
        const currentUser = JSON.parse(localStorage.getItem('ot_current_user') || 'null');
        userTeam = currentUser ? (currentUser.team || '') : '';
    } else {
        const userSelect = document.getElementById('admin-ot-user');
        const userId = userSelect ? userSelect.value : '';
        const foundUser = loadedUsers.find(u => u.id === userId);
        userTeam = foundUser ? (foundUser.team || '') : '';
    }
    const teamObj = TEAMS.find(t => typeof t === 'object' && t.name === userTeam);
    const activities = (teamObj && teamObj.customActivities) ? teamObj.customActivities : [];
    
    const labelEl = backfillGroup ? backfillGroup.querySelector('label') : null;
    
    if (dateVal) {
        const isSunday = new Date(dateVal + 'T00:00:00').getDay() === 0;
        const isBackfill = backfillCheckbox ? backfillCheckbox.checked : false;
        
        if (isSunday) {
            if (normalInputs) normalInputs.style.display = 'none';
            if (backfillGroup) backfillGroup.style.display = 'block';
            if (labelEl) labelEl.textContent = 'Số giờ tăng ca Chủ Nhật';
            
            if (activities.length > 0) {
                if (customActGroup) customActGroup.style.display = 'block';
            }
            
            const backfillRow = backfillCheckbox ? backfillCheckbox.closest('.switch-label') || backfillCheckbox.closest('.checkbox-label') : null;
            if (backfillRow) backfillRow.style.display = 'none';
        } else {
            const backfillRow = backfillCheckbox ? backfillCheckbox.closest('.switch-label') || backfillCheckbox.closest('.checkbox-label') : null;
            if (backfillRow) backfillRow.style.display = '';
            if (labelEl) labelEl.textContent = 'Số giờ tăng ca cần bù';
            
            if (isBackfill) {
                if (normalInputs) normalInputs.style.display = 'none';
                if (backfillGroup) backfillGroup.style.display = 'block';
                if (customActGroup) customActGroup.style.display = 'none';
            } else {
                if (normalInputs) normalInputs.style.display = 'block';
                if (backfillGroup) backfillGroup.style.display = 'none';
                if (activities.length > 0) {
                    if (customActGroup) customActGroup.style.display = 'block';
                }
            }
        }
    }
    updateAdminOTPreview();
}
