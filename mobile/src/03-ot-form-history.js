// ==================== OT FORM ====================
function syncQuickTimeChips(inputId, containerId) {
    var targetId = inputId || 'ot-end';
    var wrapId = containerId || (targetId === 'edit-ot-end' ? 'edit-ot-quick-time-chips' : 'ot-quick-time-chips');
    var endEl = document.getElementById(targetId);
    var wrap = document.getElementById(wrapId);
    if (!endEl || !wrap) return;
    var curVal = endEl.value || '';
    var btns = wrap.querySelectorAll('.quick-time-chip');
    for (var i = 0; i < btns.length; i++) {
        if (btns[i].getAttribute('data-time') === curVal) {
            btns[i].classList.add('active');
        } else {
            btns[i].classList.remove('active');
        }
    }
}

window.pickQuickEndTime = function(timeStr, targetInputId) {
    var inputId = targetInputId || 'ot-end';
    var endEl = document.getElementById(inputId);
    if (!endEl) return;
    endEl.value = timeStr;
    syncQuickTimeChips(inputId);
    if (inputId === 'ot-end') {
        updatePreview();
    }
    endEl.dispatchEvent(new Event('change', { bubbles: true }));
};

window.pickPrevBackfillMonth = function(targetInputId) {
    var inputId = targetInputId || 'ot-backfill-month';
    var monthEl = document.getElementById(inputId);
    if (!monthEl) return;
    var now = new Date();
    var prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    var ym = prev.getFullYear() + '-' + String(prev.getMonth() + 1).padStart(2, '0');
    monthEl.value = ym;
    monthEl.dispatchEvent(new Event('input', { bubbles: true }));
    monthEl.dispatchEvent(new Event('change', { bubbles: true }));
};

function updatePreview() {
    // Kiểm tra và hiển thị cảnh báo nếu chọn ngày thuộc tháng đã khóa
    const dateInput = document.getElementById('ot-date');
    const warningEl = document.getElementById('closed-month-warning');
    if (dateInput && warningEl) {
        const selectedDate = dateInput.value;
        if (selectedDate) {
            const selectedMonth = selectedDate.substring(0, 7);
            const closedMonths = JSON.parse(safeStorage.getItem('ot_cached_closed_months') || '[]');
            if (closedMonths.includes(selectedMonth)) {
                warningEl.style.display = 'block';
            } else {
                warningEl.style.display = 'none';
            }
        } else {
            warningEl.style.display = 'none';
        }
    }
    const backfillCheckbox = document.getElementById('ot-backfill');
    const isBackfill = backfillCheckbox ? backfillCheckbox.checked : false;
    const rows = document.getElementById('preview-rows');
    const totalEl = document.getElementById('preview-total');

    let items = [];
    let total = 0;

    // Custom activity
    let customActivity = '';
    let calcMode = '';
    let customDetail = '';
    
    const teamSettings = currentUser ? currentUser.teamSettings : null;
    const activities = (teamSettings && teamSettings.customActivities) ? teamSettings.customActivities : [];
    
    if (activities.length > 0) {
        const checkedChk = document.querySelector('.ot-custom-activity-checkbox:checked');
        if (checkedChk) {
            customActivity = checkedChk.dataset.actName;
            calcMode = checkedChk.dataset.actMode;
            const input = document.querySelector(`.ot-custom-activity-detail[data-act-id="${checkedChk.dataset.actId}"]`);
            customDetail = input ? input.value.trim() : '';
        }
    }

    const hasTrip = (activities.length > 0) && (calcMode === 'trip' && !!customActivity);
    const province = (activities.length > 0) ? customDetail : '';

    const dateEl = document.getElementById('ot-date');
    const dateVal = dateEl ? dateEl.value : '';
    const isSunday = dateVal ? new Date(dateVal + 'T00:00:00').getDay() === 0 : false;

    if (isBackfill) {
        const hoursVal = parseFloat(document.getElementById('ot-backfill-hours').value) || 0;
        if (hoursVal > 0) {
            items.push({ label: 'Bù tăng ca', val: `${hoursVal.toFixed(1)} giờ` });
            total = hoursVal;
        }
    } else if (isSunday) {
        const hoursVal = parseFloat(document.getElementById('ot-backfill-hours').value) || 0;
        if (hoursVal > 0) {
            items.push({ label: 'Tăng ca Chủ Nhật', val: `${hoursVal.toFixed(1)} giờ` });
            total = hoursVal;
        }
    } else {
        const lunch = document.getElementById('ot-lunch').checked;
        const start = document.getElementById('ot-start').value;
        const end = document.getElementById('ot-end').value;

        if (lunch) {
            items.push({ label: 'OT Trưa (12:20-13:20)', val: '1 giờ' });
            total += OT_LUNCH_HOURS;
        }

        if (start && end) {
            const ev = calcEveningOT(start, end);
            if (ev > 0) {
                const isOvernight = timeToMinutes(end) < timeToMinutes(start);
                items.push({ label: `OT Chiều (${start}-${end}${isOvernight ? ' hôm sau' : ''})`, val: `${ev.toFixed(1)} giờ` });
                total += ev;
            }
        }
    }

    if (customActivity && calcMode === 'hour') {
        items.push({ label: 'Hoạt động', val: customActivity });
    }

    if (hasTrip && province) {
        items.push({ label: customActivity || 'Đi xe tăng cường', val: province });
    }

    rows.innerHTML = items.length === 0
        ? '<div class="preview-row"><span style="color:var(--text-muted)">Chưa chọn OT</span></div>'
        : items.map(i => `<div class="preview-row"><span>${i.label}</span><span class="preview-row-val">${i.val}</span></div>`).join('');

    totalEl.textContent = total.toFixed(1);
    syncQuickTimeChips('ot-end', 'ot-quick-time-chips');

    // Cập nhật tính bắt buộc của ghi chú
    const noteEl = document.getElementById('ot-note');
    if (noteEl) {
        if (hasTrip && total === 0) {
            noteEl.required = false;
            noteEl.placeholder = `Mặc định: ${customActivity || 'Đi xe tăng cường'} ${province}`;
        } else {
            noteEl.required = true;
            noteEl.placeholder = "Lý do tăng ca, chi tiết công việc...";
        }
    }
}

function saveOfflineRecord(recordData) {
    const offlineRecords = JSON.parse(safeStorage.getItem('ot_offline_records') || '[]');
    const existingIdx = offlineRecords.findIndex(r => r.userId === recordData.userId && r.date === recordData.date);
    const isNew = existingIdx < 0;
    const id = !isNew ? offlineRecords[existingIdx].id : 'offline_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    const record = Object.assign({ id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, recordData);
    
    if (!isNew) {
        offlineRecords[existingIdx] = record;
    } else {
        offlineRecords.push(record);
    }
    
    safeStorage.setItem('ot_offline_records', JSON.stringify(offlineRecords));
    showToast(`Đã lưu ngoại tuyến (offline) ${record.totalHours.toFixed(1)}h!`, 'warning');
    resetForm();
    loadHistory();
    loadProfileStats();
    updateSyncBanner();
}

function resetForm() {
    document.getElementById('ot-lunch').checked = false;
    document.getElementById('ot-start').value = '16:30';
    document.getElementById('ot-end').value = '16:30';
    document.getElementById('ot-note').value = '';
    const backfillCheckbox = document.getElementById('ot-backfill');
    if (backfillCheckbox) {
        backfillCheckbox.checked = false;
        const normalInputs = document.getElementById('ot-normal-inputs');
        const backfillGroup = document.getElementById('ot-backfill-hours-group');
        if (normalInputs) normalInputs.style.display = 'block';
        if (backfillGroup) backfillGroup.style.display = 'none';
    }
    const backfillHours = document.getElementById('ot-backfill-hours');
    if (backfillHours) backfillHours.value = '';
    const backfillMonth = document.getElementById('ot-backfill-month');
    if (backfillMonth) backfillMonth.value = '';
    const backfillMonthGroup = document.getElementById('ot-backfill-month-group');
    if (backfillMonthGroup) backfillMonthGroup.style.display = 'none';

    // Reset custom activities
    document.querySelectorAll('.ot-custom-activity-checkbox').forEach(chk => {
        chk.checked = false;
        const actId = chk.dataset.actId;
        const group = document.getElementById(`ot-custom-activity-detail-group-${actId}`);
        if (group) {
            group.style.display = 'none';
            const input = group.querySelector('.ot-custom-activity-detail');
            if (input) {
                input.value = '';
                input.required = false;
            }
        }
    });

    handleDateChange();
    updatePreview();
}

async function checkDuplicateDate(userId, date) {
    const month = date.substring(0, 7);
    let records = [];
    if (API) {
        try {
            const data = await api(`/api/records?userId=${userId}&month=${month}`);
            records = data.records || [];
        } catch (err) {
            console.log('Failed to fetch to check duplicates, falling back to cache:', err);
            records = JSON.parse(safeStorage.getItem(`ot_cached_records_${userId}_${month}`) || '[]');
        }
    } else {
        records = JSON.parse(safeStorage.getItem(`ot_cached_records_${userId}_${month}`) || '[]');
    }

    const offlineRecords = JSON.parse(safeStorage.getItem('ot_offline_records') || '[]');
    const userOffline = offlineRecords.filter(r => r.userId === userId && r.date === date);

    const hasOnlineDuplicate = records.some(r => r.date === date);
    const hasOfflineDuplicate = userOffline.length > 0;

    return hasOnlineDuplicate || hasOfflineDuplicate;
}

async function handleOTSubmit(e) {
    e.preventDefault();
    if (!currentUser) return;

    const date = document.getElementById('ot-date').value;
    if (!date) {
        showToast('Vui lòng chọn ngày!', 'error');
        return;
    }

    const backfillCheckbox = document.getElementById('ot-backfill');
    const isBackfill = backfillCheckbox ? backfillCheckbox.checked : false;

    const todayStr = new Date(Date.now() + 7 * 3600000).toISOString().split('T')[0];
    const currentMonth = todayStr.substring(0, 7);
    const selectedMonth = date.substring(0, 7);
    if (selectedMonth < currentMonth && !isBackfill) {
        showToast('Để chọn ngày thuộc tháng cũ, vui lòng tích chọn "Bù tăng ca"!', 'error');
        return;
    }

    // Kiểm tra ghi trùng ngày
    const isDuplicate = await checkDuplicateDate(currentUser.id, date);
    if (isDuplicate) {
        showToast('Ngày này đã có bản ghi tăng ca! Vui lòng chỉnh sửa trong phần Lịch sử.', 'error');
        return;
    }
    const lunch = document.getElementById('ot-lunch').checked;
    const start = document.getElementById('ot-start').value;
    const end = document.getElementById('ot-end').value;
    let note = document.getElementById('ot-note').value.trim();

    // Custom activity
    let customActivity = '';
    let calcMode = '';
    let customDetail = '';
    
    const teamSettings = currentUser ? currentUser.teamSettings : null;
    const activities = (teamSettings && teamSettings.customActivities) ? teamSettings.customActivities : [];
    
    if (activities.length > 0) {
        const checkedChk = document.querySelector('.ot-custom-activity-checkbox:checked');
        if (checkedChk) {
            customActivity = checkedChk.dataset.actName;
            calcMode = checkedChk.dataset.actMode;
            const input = document.querySelector(`.ot-custom-activity-detail[data-act-id="${checkedChk.dataset.actId}"]`);
            customDetail = input ? input.value.trim() : '';
        }
    }

    const hasTrip = (activities.length > 0) && (calcMode === 'trip' && !!customActivity);
    const province = (activities.length > 0) ? customDetail : '';

    if (hasTrip && !province) {
        const label = (activities.length > 0 && customActivity) 
            ? (activities.find(a => a.name === customActivity)?.detailLabel || 'chi tiết')
            : 'chi tiết';
        showToast(`Vui lòng nhập ${label.toLowerCase()}!`, 'error');
        return;
    }

    let eveningOTHours = 0;
    let totalHours = 0;

    const isSunday = new Date(date + 'T00:00:00').getDay() === 0;

    if (isBackfill || isSunday) {
        const hoursVal = parseFloat(document.getElementById('ot-backfill-hours').value) || 0;
        if (hoursVal <= 0) {
            showToast(isSunday ? 'Vui lòng nhập số giờ tăng ca Chủ Nhật hợp lệ!' : 'Vui lòng nhập số giờ bù hợp lệ!', 'error');
            return;
        }
        totalHours = hoursVal;
        eveningOTHours = hoursVal;
        if (isBackfill) {
            note = '[BÙ THÁNG TRƯỚC] ' + note;
        }
    } else {
        eveningOTHours = calcEveningOT(start, end);
        totalHours = (lunch ? OT_LUNCH_HOURS : 0) + eveningOTHours;
 
        if (totalHours <= 0 && !hasTrip) {
            showToast('Vui lòng chọn ít nhất một loại OT hoặc hoạt động ngoài giờ!', 'error');
            return;
        }
    }
 
    if (hasTrip && totalHours === 0 && !note) {
        note = (customActivity || 'Đi xe tăng cường') + ' ' + province;
    } else if (!note) {
        showToast('Vui lòng nhập ghi chú (lý do tăng ca, chi tiết công việc)!', 'error');
        return;
    }
 
    const createdMonth = isBackfill ? getCurrentMonth() : date.substring(0, 7);
 
    const recordData = {
        userId: currentUser.id,
        date,
        hasLunchOT: (isBackfill || isSunday) ? false : lunch,
        otStart: (!(isBackfill || isSunday) && eveningOTHours > 0) ? start : '',
        otEnd: (!(isBackfill || isSunday) && eveningOTHours > 0) ? end : '',
        eveningOTHours: eveningOTHours,
        totalHours,
        deliveryProvince: hasTrip ? province : '',
        customActivity,
        calcMode,
        note,
        createdMonth,
        isBackfill,
        status: (currentUser && currentUser.role === 'admin') ? 'approved' : 'pending'
    };

    if (API) {
        try {
            const data = await api('/api/records', 'POST', recordData);
            const action = data.updated ? 'Đã cập nhật' : 'Đã lưu';
            showToast(`${action} ${totalHours.toFixed(1)} giờ tăng ca!`);
            resetForm();
            loadHistory();
            loadProfileStats();
            cacheUsernames();
            return;
        } catch (err) {
            console.log('Online save failed, falling back to offline:', err);
        }
    }

    saveOfflineRecord(recordData);
}

// ==================== HISTORY ====================
function escapeHTML(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;')
                      .replace(/</g, '&lt;')
                      .replace(/>/g, '&gt;')
                      .replace(/"/g, '&quot;')
                      .replace(/'/g, '&#039;');
}

async function loadHistory() {
    if (!currentUser) return;
    const month = document.getElementById('filter-month').value;
    const list = document.getElementById('history-list');
    const summary = document.getElementById('history-summary');

    // Dynamic segment buttons visibility
    const teamSettings = currentUser ? currentUser.teamSettings : null;
    const hasCustomActivities = !!(teamSettings && teamSettings.customActivities && teamSettings.customActivities.length > 0);

    const segmentControl = document.getElementById('mobile-history-segment-control');
    const btnMobileHistoryTrips = document.getElementById('btn-mobile-history-trips');
    if (hasCustomActivities) {
        if (segmentControl) segmentControl.style.display = 'flex';
        if (btnMobileHistoryTrips) {
            btnMobileHistoryTrips.style.display = 'inline-block';
            const activityNames = teamSettings.customActivities.map(a => a.name).join(' / ');
            btnMobileHistoryTrips.textContent = activityNames;
        }
    } else {
        if (segmentControl) segmentControl.style.display = 'none';
        currentMobileHistoryType = 'ot';
    }

    try {
        let closedMonths = [];
        if (API) {
            try {
                const closedData = await api('/api/records/closed-months');
                closedMonths = closedData.closedMonths || [];
                safeStorage.setItem('ot_cached_closed_months', JSON.stringify(closedMonths));
            } catch (err) {
                console.log('Failed to fetch closed months, loading from cache:', err);
                closedMonths = JSON.parse(safeStorage.getItem('ot_cached_closed_months') || '[]');
            }
        } else {
            closedMonths = JSON.parse(safeStorage.getItem('ot_cached_closed_months') || '[]');
        }

        let records = [];
        if (API) {
            try {
                const data = await api(`/api/records?userId=${currentUser.id}&month=${month}`);
                records = (data.records || []).filter(r => {
                    const isBf = r.isBackfill || (r.note && (r.note.includes('[BÙ THÁNG TRƯỚC]') || r.note.includes('[TĂNG THÁNG NÀY]')));
                    return isBf ? true : r.date.startsWith(month);
                });
                safeStorage.setItem(`ot_cached_records_${currentUser.id}_${month}`, JSON.stringify(records));
            } catch (fetchErr) {
                console.log('Failed to fetch, loading from cache:', fetchErr);
                records = JSON.parse(safeStorage.getItem(`ot_cached_records_${currentUser.id}_${month}`) || '[]');
            }
        } else {
            records = JSON.parse(safeStorage.getItem(`ot_cached_records_${currentUser.id}_${month}`) || '[]');
        }

        // Merge với bản ghi offline chưa đồng bộ
        const offlineRecords = JSON.parse(safeStorage.getItem('ot_offline_records') || '[]');
        const userOffline = offlineRecords.filter(r => r.userId === currentUser.id && (r.createdMonth === month || (!r.createdMonth && r.date.startsWith(month))));

        const mergedRecords = [...userOffline];
        records.forEach(r => {
            if (!mergedRecords.some(o => o.id === r.id)) {
                mergedRecords.push(r);
            }
        });

        // Sắp xếp giảm dần theo ngày
        mergedRecords.sort((a, b) => b.date.localeCompare(a.date));

        // Lưu vào danh sách bộ nhớ tạm toàn cục để chỉnh sửa dễ dàng
        historyRecordsList = mergedRecords;

        // Apply Record Type Filter
        let historyFiltered = [];
        if (currentMobileHistoryType === 'ot') {
            historyFiltered = mergedRecords.filter(r => (!r.customActivity || r.customActivity.trim() === '') && (r.totalHours > 0 || r.isBackfill));
        } else {
            historyFiltered = mergedRecords.filter(r => r.customActivity && r.customActivity.trim() !== '');
        }

        if (historyFiltered.length === 0) {
            list.innerHTML = `
                <div class="empty-state">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48">
                        <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
                        <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                    </svg>
                    <p>Chưa có dữ liệu ${currentMobileHistoryType === 'ot' ? 'tăng ca' : 'hoạt động tùy chọn'}</p>
                </div>`;
            summary.innerHTML = '';
            return;
        }

        let tLunch = 0, tEvening = 0, tTotal = 0;
        mergedRecords.forEach(r => {
            const isBackfill = r.isBackfill || (r.note && (r.note.includes('[BÙ THÁNG TRƯỚC]') || r.note.includes('[TĂNG THÁNG NÀY]')));
            const isApproved = r.status !== 'pending' && r.status !== 'rejected';
            if (isApproved) {
                if (!r.customActivity || r.calcMode === 'hour') {
                    const lh = r.hasLunchOT ? OT_LUNCH_HOURS : 0;
                    tLunch += lh;
                    tEvening += isBackfill ? 0 : (r.eveningOTHours || 0);
                    tTotal += r.totalHours;
                }
            }
        });

        list.innerHTML = historyFiltered.map((r, i) => {
            const isBackfill = r.isBackfill || (r.note && (r.note.includes('[BÙ THÁNG TRƯỚC]') || r.note.includes('[TĂNG THÁNG NÀY]')));
            
            let tags = '';
            if (currentMobileHistoryType === 'ot') {
                if (r.hasLunchOT) tags += '<span class="htag htag-lunch">OT Trưa 1h</span>';
                if (r.eveningOTHours > 0 && !isBackfill) tags += `<span class="htag htag-evening">OT Chiều ${r.eveningOTHours.toFixed(1)}h</span>`;
            } else {
                if (r.customActivity) {
                    const safeAct = escapeHTML(r.customActivity);
                    const safeProv = r.deliveryProvince ? escapeHTML(r.deliveryProvince) : '';
                    if (r.calcMode === 'trip') {
                        tags += `<span class="htag" style="background:rgba(245,158,11,0.15); color:#f59e0b; border:1px solid rgba(245,158,11,0.3);">📋 ${safeAct}${safeProv ? ': ' + safeProv : ''}</span>`;
                    } else {
                        tags += `<span class="htag" style="background:rgba(99,102,241,0.15); color:#6366f1; border:1px solid rgba(99,102,241,0.3);">📋 ${safeAct}: ${r.totalHours.toFixed(1)}h</span>`;
                    }
                }
            }

            let statusText = 'Đã duyệt';
            let statusStyle = 'background:rgba(16,185,129,0.15); color:#10b981; border:1px solid rgba(16,185,129,0.3);';
            if (r.status === 'pending') {
                statusText = 'Chờ duyệt';
                statusStyle = 'background:rgba(245,158,11,0.15); color:#f59e0b; border:1px solid rgba(245,158,11,0.3);';
            } else if (r.status === 'rejected') {
                statusText = 'Từ chối';
                statusStyle = 'background:rgba(239,68,68,0.15); color:#ef4444; border:1px solid rgba(239,68,68,0.3);';
            }

            if (isBackfill) {
                tags += `<span class="htag htag-backfill" style="${statusStyle}">Bù tăng ca (${statusText})</span>`;
            } else {
                tags += `<span class="htag htag-status" style="${statusStyle}">${statusText}</span>`;
            }
            if (r.id.startsWith('offline_')) {
                tags += '<span class="htag htag-offline" style="background:rgba(245,158,11,0.15); color:#f59e0b; border:1px solid rgba(245,158,11,0.3);">Chờ đồng bộ</span>';
            }

            let backfillLine = '';
            if (isBackfill) {
                const parts = r.date.split('-');
                if (parts.length >= 2) {
                    const compMonth = parseInt(parts[1], 10);
                    const compYear = parts[0];
                    backfillLine = `<div class="history-backfill-info" style="color:#ef4444; font-size:0.75rem; margin-top:4px; font-weight:600; display:flex; align-items:center; gap:4px;">
                        <span>⚠️ Bù tăng ca cho tháng ${compMonth}/${compYear} (ngày ${fmtDate(r.date)})</span>
                    </div>`;
                }
            }

            const cleanNote = r.note ? r.note.replace('[BÙ THÁNG TRƯỚC] ', '').replace('[BÙ THÁNG TRƯỚC]', '').replace('[TĂNG THÁNG NÀY] ', '').replace('[TĂNG THÁNG NÀY]', '').trim() : '';

            const recordMonth = r.date.substring(0, 7);
            const isClosed = closedMonths.includes(recordMonth);

            let actionHtml = '';
            if (isClosed) {
                actionHtml = '<span class="tag-closed" style="background: rgba(100, 116, 139, 0.15); color: #64748b; border: 1px solid rgba(100, 116, 139, 0.3); padding: 2px 6px; border-radius: 4px; font-weight: 500; font-size: 11px;">🔒 Đã chốt</span>';
            } else {
                actionHtml = `
                    <button class="action-link edit-link" onclick="editRecordDialog('${r.id}')">Sửa</button>
                    <span class="action-sep">•</span>
                    <button class="action-link delete-link" onclick="deleteRecord('${r.id}')">Xóa</button>
                `;
            }

            const holidays = (mobileSystemSettings.holidays || "")
                .split(',')
                .map(d => d.trim())
                .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d));
            const coef = getOTCoefficient(r.date, holidays);
            const actualHours = r.totalHours || 0;
            const eqHours = actualHours * coef;

            const rightDisplay = currentMobileHistoryType === 'ot'
                ? `
                    <div style="display:flex; flex-direction:column; align-items:flex-end; gap:2px; margin: 2px 0;">
                        <span class="history-total" style="font-size: 0.85rem;">Gốc: ${actualHours.toFixed(1)}h</span>
                        <span style="font-size:10px; font-weight:700; color:#0dd98b; background:rgba(13,217,139,0.15); padding:1px 4px; border-radius:4px; white-space:nowrap;">QĐ: ${eqHours.toFixed(1)}h</span>
                    </div>
                  `
                : (r.calcMode === 'trip' 
                    ? `<span class="history-total" style="color: var(--green);">🚚 Xe</span>` 
                    : `<span class="history-total" style="color: var(--accent-purple); font-size: 0.8rem; font-weight: bold;">⏱️ ${r.totalHours.toFixed(1)}h</span>`);

            return `
                <div class="history-item" style="animation-delay:${i * 0.04}s">
                    <div class="history-main-row">
                        <div class="history-left">
                            <span class="history-date">${fmtDate(r.date)}</span>
                            <div class="history-tags">${tags}</div>
                            ${backfillLine}
                        </div>
                        <div class="history-right">
                            ${rightDisplay}
                            <div class="history-item-actions">
                                ${actionHtml}
                            </div>
                        </div>
                    </div>
                    ${cleanNote ? `<div class="history-note">📝 ${escapeHTML(cleanNote)}</div>` : ''}
                </div>`;
        }).join('');

        if (hasCustomActivities) {
            const totalCustom = mergedRecords.filter(r => r.status !== 'pending' && r.status !== 'rejected' && r.customActivity && r.customActivity.trim() !== '').length;
            summary.innerHTML = `
                <div class="summary-item"><span class="summary-label">Ngày OT:</span><span class="summary-val">${mergedRecords.filter(r => !r.customActivity).length}</span></div>
                <div class="summary-item"><span class="summary-label">Trưa:</span><span class="summary-val">${tLunch.toFixed(1)}h</span></div>
                <div class="summary-item"><span class="summary-label">Chiều:</span><span class="summary-val">${tEvening.toFixed(1)}h</span></div>
                <div class="summary-item"><span class="summary-label">Tổng:</span><span class="summary-val">${tTotal.toFixed(1)}h</span></div>
                <div class="summary-item"><span class="summary-label">Khác:</span><span class="summary-val">${totalCustom}</span></div>`;
        } else {
            summary.innerHTML = `
                <div class="summary-item"><span class="summary-label">Ngày:</span><span class="summary-val">${mergedRecords.filter(r => !r.customActivity).length}</span></div>
                <div class="summary-item"><span class="summary-label">Trưa:</span><span class="summary-val">${tLunch.toFixed(1)}h</span></div>
                <div class="summary-item"><span class="summary-label">Chiều:</span><span class="summary-val">${tEvening.toFixed(1)}h</span></div>
                <div class="summary-item"><span class="summary-label">Tổng:</span><span class="summary-val">${tTotal.toFixed(1)}h</span></div>`;
        }
    } catch (err) {
        list.innerHTML = `<div class="empty-state"><p>Lỗi tải dữ liệu</p></div>`;
    }
}

async function deleteRecord(id) {
    let closedMonths = [];
    try {
        if (API) {
            const closedData = await api('/api/records/closed-months');
            closedMonths = closedData.closedMonths || [];
            safeStorage.setItem('ot_cached_closed_months', JSON.stringify(closedMonths));
        } else {
            closedMonths = JSON.parse(safeStorage.getItem('ot_cached_closed_months') || '[]');
        }
    } catch (e) {
        closedMonths = JSON.parse(safeStorage.getItem('ot_cached_closed_months') || '[]');
    }

    const record = historyRecordsList.find(r => r.id === id);
    if (record) {
        const recordMonth = record.date.substring(0, 7);
        if (closedMonths.includes(recordMonth)) {
            showToast('Tháng này đã chốt OT, bạn không thể xóa bản ghi!', 'error');
            return;
        }
    }

    const ok = await showConfirm('Bạn có chắc muốn xóa bản ghi này?');
    if (!ok) return;

    if (API && !id.startsWith('offline_')) {
        try {
            await api(`/api/records/${id}`, 'DELETE');
            showToast('Đã xóa');
            loadHistory();
            loadProfileStats();
            return;
        } catch (err) {
            console.log('Online delete failed, falling back to offline:', err);
        }
    }

    if (id.startsWith('offline_')) {
        let offlineRecords = JSON.parse(safeStorage.getItem('ot_offline_records') || '[]');
        offlineRecords = offlineRecords.filter(r => r.id !== id);
        safeStorage.setItem('ot_offline_records', JSON.stringify(offlineRecords));
    } else {
        const offlineDeletes = JSON.parse(safeStorage.getItem('ot_offline_deletes') || '[]');
        if (!offlineDeletes.includes(id)) {
            offlineDeletes.push(id);
            safeStorage.setItem('ot_offline_deletes', JSON.stringify(offlineDeletes));
        }

        const month = document.getElementById('filter-month').value;
        let cached = JSON.parse(safeStorage.getItem(`ot_cached_records_${currentUser.id}_${month}`) || '[]');
        cached = cached.filter(r => r.id !== id);
        safeStorage.setItem(`ot_cached_records_${currentUser.id}_${month}`, JSON.stringify(cached));
    }

    showToast('Đã xóa ngoại tuyến (offline)!', 'warning');
    loadHistory();
    loadProfileStats();
    updateSyncBanner();
}
