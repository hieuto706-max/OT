// ==================== PROFILE STATS ====================
async function loadProfileStats() {
    if (!currentUser) return;
    const month = getCurrentMonth();

    try {
        let records = [];
        if (API) {
            try {
                const data = await api(`/api/records?userId=${currentUser.id}&month=${month}`);
                records = (data.records || []).filter(r => {
                    const isBf = r.isBackfill || (r.note && (r.note.includes('[BÙ THÁNG TRƯỚC]') || r.note.includes('[TĂNG THÁNG NÀY]')));
                    return isBf ? true : r.date.startsWith(month);
                });
            } catch (e) {
                records = JSON.parse(safeStorage.getItem(`ot_cached_records_${currentUser.id}_${month}`) || '[]');
            }
        } else {
            records = JSON.parse(safeStorage.getItem(`ot_cached_records_${currentUser.id}_${month}`) || '[]');
        }

        const offlineRecords = JSON.parse(safeStorage.getItem('ot_offline_records') || '[]');
        const userOffline = offlineRecords.filter(r => r.userId === currentUser.id && (r.createdMonth === month || (!r.createdMonth && r.date.startsWith(month))));

        const mergedRecords = [...userOffline];
        records.forEach(r => {
            if (!mergedRecords.some(o => o.id === r.id)) {
                mergedRecords.push(r);
            }
        });

        mobileOTRecords = mergedRecords;
        
        const savedSalary = localStorage.getItem('emp_basic_salary') || '';
        const savedDays = localStorage.getItem('emp_standard_days') || '';
        
        const salaryInput = document.getElementById('mobile-basic-salary');
        const daysInput = document.getElementById('mobile-standard-days');
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
            updateMobileOTIncome();
        }, 50);

        const approvedRecords = mergedRecords.filter(r => r.status !== 'pending' && r.status !== 'rejected');

        const days = mergedRecords.filter(r => !r.customActivity || r.calcMode === 'hour').length;
        const lunch = approvedRecords.filter(r => (!r.customActivity || r.calcMode === 'hour') && r.hasLunchOT).length * OT_LUNCH_HOURS;
        const evening = approvedRecords.reduce((s, r) => s + (((r.customActivity && r.calcMode !== 'hour') || r.isBackfill || (r.note && (r.note.includes('[BÙ THÁNG TRƯỚC]') || r.note.includes('[TĂNG THÁNG NÀY]')))) ? 0 : (r.eveningOTHours || 0)), 0);
        const total = lunch + evening + approvedRecords.reduce((s, r) => {
            if (r.customActivity && r.calcMode !== 'hour') return s;
            const isBF = r.isBackfill || (r.note && (r.note.includes('[BÙ THÁNG TRƯỚC]') || r.note.includes('[TĂNG THÁNG NÀY]')));
            const isHourCustom = !!(r.customActivity && r.calcMode === 'hour');
            if (isBF || isHourCustom) {
                return s + r.totalHours;
            }
            return s;
        }, 0);
        
        const teamSettings = currentUser ? currentUser.teamSettings : null;
        const hasCustomActivities = !!(teamSettings && teamSettings.customActivities && teamSettings.customActivities.length > 0);
        const totalCustom = approvedRecords.filter(r => r.customActivity && r.customActivity.trim() !== '').length;

        const holidays = (mobileSystemSettings.holidays || "")
            .split(',')
            .map(d => d.trim())
            .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d));

        let totalEq = 0;
        approvedRecords.forEach(r => {
            if (!r.customActivity || r.calcMode === 'hour') {
                const coef = getOTCoefficient(r.date, holidays);
                totalEq += (r.totalHours || 0) * coef;
            }
        });

        document.getElementById('stat-days').textContent = days;
        document.getElementById('stat-lunch').textContent = lunch.toFixed(1);
        document.getElementById('stat-evening').textContent = evening.toFixed(1);
        document.getElementById('stat-total').innerHTML = `${total.toFixed(1)}<span style="font-size: 0.65rem; font-weight: normal; color: var(--text-muted); display: block; margin-top: 2px; white-space: nowrap;">(QĐ: ${totalEq.toFixed(1)}h)</span>`;
        
        const tripsEl = document.getElementById('stat-trips');
        const tripsWrapper = document.getElementById('mobile-stat-trips-wrapper');
        const tripsText = document.getElementById('mobile-stat-trips-text');
        const totalWrapper = document.getElementById('mobile-stat-total-wrapper');

        if (tripsWrapper && totalWrapper) {
            if (hasCustomActivities) {
                tripsWrapper.style.display = 'block';
                if (tripsText) tripsText.textContent = 'Hoạt động khác';
                if (tripsEl) tripsEl.textContent = totalCustom;
                totalWrapper.style.borderRight = '1px solid rgba(255,255,255,0.08)';
            } else {
                tripsWrapper.style.display = 'none';
                totalWrapper.style.borderRight = 'none';
            }
        }
    } catch (err) {
        // Silent fail
    }
}

function updateMobileOTIncome() {
    const salaryInput = document.getElementById('mobile-basic-salary');
    const daysInput = document.getElementById('mobile-standard-days');
    if (!salaryInput || !daysInput) return;
    
    const salary = parseFloat(salaryInput.value) || 0;
    const days = parseFloat(daysInput.value) || 26;
    const hourlyRate = salary / (days * 8);
    
    localStorage.setItem('emp_basic_salary', salaryInput.value);
    localStorage.setItem('emp_standard_days', daysInput.value);
    
    const settings = mobileSystemSettings || { holidays: "" };
    const holidays = (settings.holidays || "")
        .split(',')
        .map(d => d.trim())
        .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d));
        
    let totalEqHours = 0;
    mobileOTRecords.forEach(r => {
        const isApproved = r.status !== 'pending' && r.status !== 'rejected';
        if (isApproved) {
            if (!r.customActivity || r.calcMode === 'hour') {
                const coef = getOTCoefficient(r.date, holidays);
                totalEqHours += (r.totalHours || 0) * coef;
            }
        }
    });
    
    const otIncome = totalEqHours * hourlyRate;
    
    const incomeTotalEl = document.getElementById('mobile-ot-income-total');
    if (incomeTotalEl) {
        incomeTotalEl.textContent = Math.round(otIncome).toLocaleString('vi-VN') + ' VND';
    }
    
    const hourlyRateEl = document.getElementById('mobile-hourly-rate');
    if (hourlyRateEl) {
        hourlyRateEl.textContent = Math.round(hourlyRate).toLocaleString('vi-VN') + ' VND/h';
    }
}

// ==================== NAVIGATION ====================
function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    const tabEl = document.getElementById(`tab-${tabName}`);
    if (tabEl) tabEl.classList.add('active');
    const navEl = document.querySelector(`[data-tab="${tabName}"]`);
    if (navEl) navEl.classList.add('active');

    // Reload data when switching tabs
    if (tabName === 'history') loadHistory();
    if (tabName === 'profile') loadProfileStats();
    if (tabName === 'approvals') loadApprovals();

    // Scroll to top
    const mainEl = document.querySelector('.mobile-main');
    if (mainEl) mainEl.scrollTop = 0;
}

// ==================== SETTINGS ====================
function initSettings() {
    const showBtn = document.getElementById('btn-show-settings');
    const showBtn2 = document.getElementById('btn-show-settings-2');
    const overlay = document.getElementById('settings-overlay');
    const cancelBtn = document.getElementById('settings-cancel');
    const saveBtn = document.getElementById('settings-save');
    const ipInput = document.getElementById('settings-server-ip');

    const showModal = () => {
        ipInput.value = API || safeStorage.getItem('ot_server_ip') || '';
        overlay.classList.add('active');
    };

    const hideModal = () => {
        overlay.classList.remove('active');
    };

    if (showBtn) showBtn.addEventListener('click', showModal);
    if (showBtn2) showBtn2.addEventListener('click', showModal);
    if (cancelBtn) cancelBtn.addEventListener('click', hideModal);

    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            let val = ipInput.value.trim();
            if (!val) {
                showToast('Vui lòng nhập IP Server', 'error');
                return;
            }
            if (!val.startsWith('http://') && !val.startsWith('https://')) {
                val = 'http://' + val;
            }
            if (val.endsWith('/')) {
                val = val.slice(0, -1);
            }
            safeStorage.setItem('ot_server_ip', val);
            API = val;
            hideModal();
            showToast('Đã lưu cấu hình IP Server!');
            updateConnectionStatus(true, val);
            if (currentUser) {
                loadHistory();
                loadProfileStats();
                syncOfflineData();
            }
            checkMobileUpdates();
        });
    }
}

// Hàm callback nhận IP Server từ app Android native quét được
window.onServerDiscovered = function(serverUrl) {
    if (serverUrl && serverUrl.endsWith('/')) {
        serverUrl = serverUrl.slice(0, -1);
    }
    safeStorage.setItem('ot_server_ip', serverUrl);
    API = serverUrl;
    showToast('Đã kết nối Server: ' + serverUrl, 'success');
    updateConnectionStatus(true, serverUrl);
    
    // Cập nhật giá trị hiển thị trong ô cấu hình
    var ipInput = document.getElementById('settings-server-ip');
    if (ipInput) ipInput.value = serverUrl;

    if (currentUser) {
        loadHistory();
        loadProfileStats();
        syncOfflineData();
    }
    checkMobileUpdates();
};

// Tự động phân giải URL Server từ Rentry Registry (dùng XHR cho Android 5.0)
function autoResolveRentryUrl() {
    return new Promise(function(resolve) {
        try {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', 'https://rentry.co/otmanager-hieutm?t=' + Date.now(), true);
            xhr.timeout = 2000;
            xhr.onload = function() {
                if (xhr.status === 200) {
                    var html = xhr.responseText;
                    var match = html.match(/href="([^"]+)" class="external"/);
                    if (match) {
                        var url = match[1];
                        if (url && url.endsWith('/')) {
                            url = url.slice(0, -1);
                        }
                        console.log("Resolved public server URL from Rentry:", url);
                        safeStorage.setItem('ot_server_ip', url);
                        API = url;
                        
                        var ipInput = document.getElementById('settings-server-ip');
                        if (ipInput) ipInput.value = url;
                        
                        showToast('Tự động kết nối qua Internet thành công!', 'success');
                        updateConnectionStatus(true, url);
                        
                        if (currentUser) {
                            loadHistory();
                            loadProfileStats();
                            syncOfflineData();
                            refreshCurrentUserInfo();
                        }
                        checkMobileUpdates();
                        resolve(true);
                        return;
                    }
                }
                resolve(false);
            };
            xhr.onerror = function() {
                console.warn('Không thể tự động kết nối qua Rentry');
                resolve(false);
            };
            xhr.ontimeout = function() {
                console.warn('Rentry timeout');
                resolve(false);
            };
            xhr.send();
        } catch (e) {
            console.warn('Lỗi kết nối Rentry:', e.message);
            resolve(false);
        }
    });
}

function updateSyncBanner() {
    const offlineRecords = JSON.parse(safeStorage.getItem('ot_offline_records') || '[]');
    const offlineDeletes = JSON.parse(safeStorage.getItem('ot_offline_deletes') || '[]');
    const totalUnsynced = offlineRecords.length + offlineDeletes.length;
    
    const banner = document.getElementById('sync-banner');
    const countEl = document.getElementById('unsynced-count');
    
    if (banner && countEl) {
        if (totalUnsynced > 0) {
            countEl.textContent = totalUnsynced;
            banner.style.display = 'flex';
        } else {
            banner.style.display = 'none';
        }
    }
}

let isSyncing = false;
async function syncOfflineData() {
    if (isSyncing || !API) return;
    const offlineRecords = JSON.parse(safeStorage.getItem('ot_offline_records') || '[]');
    const offlineDeletes = JSON.parse(safeStorage.getItem('ot_offline_deletes') || '[]');

    if (offlineRecords.length === 0 && offlineDeletes.length === 0) return;
    
    isSyncing = true;
    console.log(`[Sync] Starting sync: ${offlineRecords.length} records, ${offlineDeletes.length} deletes`);

    try {
        // 1. Process deletes
        const successfulDeletes = [];
        for (const id of offlineDeletes) {
            try {
                await api(`/api/records/${id}`, 'DELETE', null, true);
                successfulDeletes.push(id);
            } catch (err) {
                if (err.message.includes('404') || err.message.includes('Không tìm thấy') || err.message.includes('xóa') || err.message.includes('401')) {
                    // Nếu bản ghi/tài khoản không tồn tại, coi như xóa thành công để dọn dẹp hàng đợi
                    successfulDeletes.push(id);
                } else {
                    console.error('Failed to sync delete for ID:', id, err);
                }
            }
        }
        if (successfulDeletes.length > 0) {
            const currentDeletes = JSON.parse(safeStorage.getItem('ot_offline_deletes') || '[]');
            const remainingDeletes = currentDeletes.filter(id => !successfulDeletes.includes(id));
            safeStorage.setItem('ot_offline_deletes', JSON.stringify(remainingDeletes));
        }

        // 2. Process records (saves and edits)
        const successfulRecords = [];
        for (const record of offlineRecords) {
            try {
                if (record.id.startsWith('offline_')) {
                    const { id, ...cleanRecord } = record;
                    await api('/api/records', 'POST', cleanRecord, true);
                } else {
                    const { id, userId, createdAt, updatedAt, ...cleanRecord } = record;
                    await api(`/api/records/${id}`, 'PUT', cleanRecord, true);
                }
                successfulRecords.push(record.id);
            } catch (err) {
                if (err.message.includes('xóa') || err.message.includes('401')) {
                    // Nếu tài khoản đã bị xóa khỏi hệ thống, bỏ qua bản ghi này (coi như hoàn thành để dọn dẹp khỏi offline storage)
                    successfulRecords.push(record.id);
                } else {
                    console.error('Failed to sync record:', record, err);
                }
            }
        }
        if (successfulRecords.length > 0) {
            const currentRecords = JSON.parse(safeStorage.getItem('ot_offline_records') || '[]');
            const remainingRecords = currentRecords.filter(r => !successfulRecords.includes(r.id));
            safeStorage.setItem('ot_offline_records', JSON.stringify(remainingRecords));
        }

        if (successfulDeletes.length > 0 || successfulRecords.length > 0) {
            showToast('Đồng bộ dữ liệu ngoại tuyến thành công!', 'success');
            loadHistory();
            loadProfileStats();
            cacheUsernames();
        }
    } catch (e) {
        console.error('Sync failed:', e);
    } finally {
        isSyncing = false;
        updateSyncBanner();
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
    
    const teamSettings = currentUser ? currentUser.teamSettings : null;
    const activities = (teamSettings && teamSettings.customActivities) ? teamSettings.customActivities : [];
    
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
            
            const backfillRow = backfillCheckbox ? backfillCheckbox.closest('.toggle-row') : null;
            if (backfillRow) backfillRow.style.display = 'none';
        } else {
            const backfillRow = backfillCheckbox ? backfillCheckbox.closest('.toggle-row') : null;
            if (backfillRow) backfillRow.style.display = 'block';
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
    updatePreview();
}

function handleEditDateChange() {
    const otDateEl = document.getElementById('edit-ot-date');
    if (!otDateEl) return;
    
    const dateVal = otDateEl.value;
    const normalInputs = document.getElementById('edit-ot-normal-inputs');
    const backfillGroup = document.getElementById('edit-ot-backfill-hours-group');
    const customActGroup = document.getElementById('edit-ot-custom-activity-group');
    const backfillCheckbox = document.getElementById('edit-ot-backfill');
    
    const teamSettings = currentUser ? currentUser.teamSettings : null;
    const activities = (teamSettings && teamSettings.customActivities) ? teamSettings.customActivities : [];
    
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
            
            const backfillRow = backfillCheckbox ? backfillCheckbox.closest('.toggle-row') : null;
            if (backfillRow) backfillRow.style.display = 'none';
        } else {
            const backfillRow = backfillCheckbox ? backfillCheckbox.closest('.toggle-row') : null;
            if (backfillRow) backfillRow.style.display = 'block';
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
}
