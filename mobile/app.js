/**
 * OT Manager - Mobile App (Nhân viên)
 * Dùng cho nhân viên trên Android & iOS
 * Kết nối server qua REST API
 */

// Safe localStorage wrapper to prevent crashes on file:// URLs
const safeStorage = {
    getItem(key) {
        try {
            return localStorage.getItem(key);
        } catch (e) {
            return this._data[key] || null;
        }
    },
    setItem(key, val) {
        try {
            localStorage.setItem(key, val);
        } catch (e) {
            this._data[key] = val;
        }
    },
    removeItem(key) {
        try {
            localStorage.removeItem(key);
        } catch (e) {
            delete this._data[key];
        }
    },
    _data: {}
};

// Khởi tạo API URL: lấy từ localStorage nếu có, nếu không thì chờ auto-discovery
let API = safeStorage.getItem('ot_server_ip') || '';
const OT_LUNCH_HOURS = 1;
const WORK_END_MIN = 16 * 60 + 30; // 16:30

// Tạo/Lấy Device ID duy nhất cho điện thoại
let deviceId = safeStorage.getItem('ot_device_id') || '';
if (!deviceId) {
    deviceId = 'dev_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
    safeStorage.setItem('ot_device_id', deviceId);
}

let currentUser = null;

// ==================== API CLIENT ====================
// Dùng XMLHttpRequest thay cho fetch để tương thích Android 5.0 WebView
function api(endpoint, method, body, skipAuthRedirect) {
    method = method || 'GET';
    body = body || null;
    if (!API) {
        return Promise.reject(new Error('Chưa kết nối Server! Nhấn ⚙️ Cấu hình IP Server để thiết lập.'));
    }
    return new Promise(function(resolve, reject) {
        var xhr = new XMLHttpRequest();
        xhr.open(method, API + endpoint, true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.timeout = 10000;
        xhr.onload = function() {
            try {
                var data = JSON.parse(xhr.responseText);
                if (xhr.status >= 200 && xhr.status < 300) {
                    resolve(data);
                } else {
                    if (xhr.status === 401) {
                        if (skipAuthRedirect) {
                            reject(new Error(data.error || 'Tài khoản đã bị xóa!'));
                            return;
                        }
                        // Văng khỏi ứng dụng nếu tài khoản bị xóa
                        currentUser = null;
                        safeStorage.removeItem('ot_mobile_user');
                        showScreen('screen-login');
                        showToast(data.error || 'Tài khoản của bạn đã bị xóa khỏi hệ thống!', 'error');
                        reject(new Error(data.error || 'Tài khoản đã bị xóa!'));
                        return;
                    }
                    reject(new Error(data.error || 'Lỗi server (HTTP ' + xhr.status + ')'));
                }
            } catch (e) {
                var snippet = xhr.responseText ? xhr.responseText.substring(0, 80) : '';
                reject(new Error('Lỗi phân tích dữ liệu (HTTP ' + xhr.status + '): ' + snippet));
            }
        };
        xhr.onerror = function() {
            reject(new Error('Không thể kết nối Server! Kiểm tra IP hoặc WiFi.'));
        };
        xhr.ontimeout = function() {
            reject(new Error('Server không phản hồi (timeout)! Kiểm tra kết nối.'));
        };
        if (body) {
            xhr.send(JSON.stringify(body));
        } else {
            xhr.send();
        }
    });
}

// ==================== HELPERS ====================
function timeToMinutes(t) {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
}

function calcEveningOT(start, end) {
    const s = Math.max(timeToMinutes(start), WORK_END_MIN);
    const e = timeToMinutes(end);
    if (e <= s) return 0;
    return Math.round(((e - s) / 60) * 100) / 100;
}

function fmtDate(d) {
    const p = d.split('-');
    return `${p[2]}/${p[1]}/${p[0]}`;
}

function getCurrentMonth() {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
}

function getInitials(name) {
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(-2);
}

function showToast(msg, type = 'success') {
    const c = document.getElementById('toast-container');
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(() => {
        t.style.opacity = '0';
        t.style.transform = 'translateY(-20px)';
        t.style.transition = '0.3s ease';
        setTimeout(() => t.remove(), 300);
    }, 2500);
}

function showConfirm(msg) {
    return new Promise(resolve => {
        document.getElementById('confirm-msg').textContent = msg;
        const overlay = document.getElementById('confirm-overlay');
        overlay.classList.add('active');

        const onOk = () => { cleanup(); resolve(true); };
        const onCancel = () => { cleanup(); resolve(false); };
        const cleanup = () => {
            overlay.classList.remove('active');
            document.getElementById('confirm-ok').removeEventListener('click', onOk);
            document.getElementById('confirm-cancel').removeEventListener('click', onCancel);
        };

        document.getElementById('confirm-ok').addEventListener('click', onOk);
        document.getElementById('confirm-cancel').addEventListener('click', onCancel);
    });
}

// ==================== CONNECTION STATUS ====================
function updateConnectionStatus(connected, serverUrl) {
    const statusEl = document.getElementById('connection-status');
    if (statusEl) {
        if (connected && serverUrl) {
            statusEl.innerHTML = `<span style="color:#10b981;">● Đã kết nối</span> <small style="color:var(--text-muted);font-size:0.7rem;">${serverUrl}</small>`;
        } else {
            statusEl.innerHTML = `<span style="color:#ef4444;">● Ngoại tuyến (Offline)</span>`;
        }
    }
    const badge = document.getElementById('app-connection-badge');
    if (badge) {
        if (connected && serverUrl) {
            badge.style.display = 'none';
        } else {
            badge.style.display = 'inline-block';
        }
    }
}

// ==================== SCREENS ====================
function showScreen(id) {
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

async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('login-user').value.trim();
    const errEl = document.getElementById('login-error');
    errEl.textContent = '';

    if (!API) {
        const cachedUsernames = JSON.parse(safeStorage.getItem('ot_cached_usernames') || '[]');
        const user = cachedUsernames.find(u => u.username.toLowerCase() === username.toLowerCase());
        if (user) {
            // Kiểm tra mã thiết bị khi offline
            if (user.deviceId && user.deviceId !== deviceId) {
                errEl.textContent = 'Tài khoản này đã được đăng nhập trên một thiết bị khác!';
                return;
            }
            currentUser = { id: user.id, username: user.username, fullname: user.fullname, role: 'employee' };
            safeStorage.setItem('ot_mobile_user', JSON.stringify(currentUser));
            enterApp();
            showToast('Đăng nhập ngoại tuyến (offline)!', 'warning');
            return;
        }
        errEl.textContent = 'Chưa kết nối Server và không tìm thấy tài khoản offline!';
        return;
    }

    try {
        const oldUser = JSON.parse(safeStorage.getItem('ot_mobile_user') || 'null');
        const data = await api('/api/auth/login', 'POST', { username, deviceId });
        if (data.user.role !== 'employee') {
            errEl.textContent = 'Tài khoản này không phải nhân viên!';
            return;
        }

        // Cập nhật ID cho các bản ghi offline nếu đây là cùng một tài khoản (username) nhưng ID khác (do xóa và tạo lại)
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
                console.log(`[Login] Updated offline records userId from ${oldUser.id} to ${data.user.id}`);
            }
        }

        currentUser = data.user;
        safeStorage.setItem('ot_mobile_user', JSON.stringify(currentUser));
        cacheUsernames();
        enterApp();
    } catch (err) {
        const isNetworkError = err.message.includes('kết nối') || err.message.includes('timeout') || err.message.includes('Server');
        if (isNetworkError) {
            const cachedUsernames = JSON.parse(safeStorage.getItem('ot_cached_usernames') || '[]');
            const user = cachedUsernames.find(u => u.username.toLowerCase() === username.toLowerCase());
            if (user) {
                // Kiểm tra mã thiết bị khi offline do lỗi mạng
                if (user.deviceId && user.deviceId !== deviceId) {
                    errEl.textContent = 'Tài khoản này đã được đăng nhập trên một thiết bị khác!';
                    return;
                }
                currentUser = { id: user.id, username: user.username, fullname: user.fullname, role: 'employee' };
                safeStorage.setItem('ot_mobile_user', JSON.stringify(currentUser));
                enterApp();
                showToast('Đăng nhập ngoại tuyến (offline)!', 'warning');
                return;
            }
        }
        errEl.textContent = err.message;
    }
}

function enterApp() {
    document.getElementById('greeting').textContent = getGreeting();
    document.getElementById('user-name').textContent = currentUser.fullname;
    document.getElementById('ot-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('filter-month').value = getCurrentMonth();

    // Profile
    document.getElementById('profile-avatar').textContent = getInitials(currentUser.fullname);
    document.getElementById('profile-name').textContent = currentUser.fullname;
    document.getElementById('profile-username').textContent = `@${currentUser.username}`;

    showScreen('screen-app');
    updatePreview();
    loadHistory();
    loadProfileStats();
    updateConnectionStatus(true, API);
}

function getGreeting() {
    const h = new Date().getHours();
    if (h < 12) return 'Chào buổi sáng ☀️';
    if (h < 18) return 'Chào buổi chiều 🌤️';
    return 'Chào buổi tối 🌙';
}

function logout() {
    currentUser = null;
    safeStorage.removeItem('ot_mobile_user');
    showScreen('screen-login');
    document.getElementById('form-login').reset();
    showToast('Đã đăng xuất', 'info');
}

// ==================== OT FORM ====================
function updatePreview() {
    const lunch = document.getElementById('ot-lunch').checked;
    const start = document.getElementById('ot-start').value;
    const end = document.getElementById('ot-end').value;
    const rows = document.getElementById('preview-rows');
    const totalEl = document.getElementById('preview-total');

    let items = [];
    let total = 0;

    if (lunch) {
        items.push({ label: 'OT Trưa (12:20-13:20)', val: '1 giờ' });
        total += OT_LUNCH_HOURS;
    }

    if (start && end) {
        const ev = calcEveningOT(start, end);
        if (ev > 0) {
            items.push({ label: `OT Chiều (${start}-${end})`, val: `${ev.toFixed(1)} giờ` });
            total += ev;
        }
    }

    rows.innerHTML = items.length === 0
        ? '<div class="preview-row"><span style="color:var(--text-muted)">Chưa chọn OT</span></div>'
        : items.map(i => `<div class="preview-row"><span>${i.label}</span><span class="preview-row-val">${i.val}</span></div>`).join('');

    totalEl.textContent = total.toFixed(1);
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
}

function resetForm() {
    document.getElementById('ot-lunch').checked = false;
    document.getElementById('ot-start').value = '16:30';
    document.getElementById('ot-end').value = '18:00';
    document.getElementById('ot-note').value = '';
    updatePreview();
}

async function handleOTSubmit(e) {
    e.preventDefault();
    if (!currentUser) return;

    const date = document.getElementById('ot-date').value;
    const lunch = document.getElementById('ot-lunch').checked;
    const start = document.getElementById('ot-start').value;
    const end = document.getElementById('ot-end').value;
    const note = document.getElementById('ot-note').value.trim();

    const eveningOTHours = calcEveningOT(start, end);
    const totalHours = (lunch ? OT_LUNCH_HOURS : 0) + eveningOTHours;

    if (totalHours <= 0) {
        showToast('Vui lòng chọn ít nhất một loại OT!', 'error');
        return;
    }

    const recordData = {
        userId: currentUser.id,
        date,
        hasLunchOT: lunch,
        otStart: eveningOTHours > 0 ? start : '',
        otEnd: eveningOTHours > 0 ? end : '',
        eveningOTHours,
        totalHours,
        note
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
async function loadHistory() {
    if (!currentUser) return;
    const month = document.getElementById('filter-month').value;
    const list = document.getElementById('history-list');
    const summary = document.getElementById('history-summary');

    try {
        let records = [];
        if (API) {
            try {
                const data = await api(`/api/records?userId=${currentUser.id}&month=${month}`);
                records = data.records;
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
        const userOffline = offlineRecords.filter(r => r.userId === currentUser.id && r.date.startsWith(month));

        const mergedRecords = [...userOffline];
        records.forEach(r => {
            if (!mergedRecords.some(o => o.date === r.date)) {
                mergedRecords.push(r);
            }
        });

        // Sắp xếp giảm dần theo ngày
        mergedRecords.sort((a, b) => b.date.localeCompare(a.date));

        if (mergedRecords.length === 0) {
            list.innerHTML = `
                <div class="empty-state">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48">
                        <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
                        <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                    </svg>
                    <p>Chưa có dữ liệu tăng ca</p>
                </div>`;
            summary.innerHTML = '';
            return;
        }

        let tLunch = 0, tEvening = 0, tTotal = 0;

        list.innerHTML = mergedRecords.map((r, i) => {
            const lh = r.hasLunchOT ? OT_LUNCH_HOURS : 0;
            tLunch += lh;
            tEvening += r.eveningOTHours;
            tTotal += r.totalHours;

            let tags = '';
            if (r.hasLunchOT) tags += '<span class="htag htag-lunch">OT Trưa 1h</span>';
            if (r.eveningOTHours > 0) tags += `<span class="htag htag-evening">OT Chiều ${r.eveningOTHours.toFixed(1)}h</span>`;
            if (r.id.startsWith('offline_')) {
                tags += '<span class="htag htag-offline" style="background:rgba(245,158,11,0.15); color:#f59e0b; border:1px solid rgba(245,158,11,0.3);">Chờ đồng bộ</span>';
            }

            return `
                <div class="history-item" style="animation-delay:${i * 0.04}s">
                    <div class="history-top">
                        <span class="history-date">${fmtDate(r.date)}</span>
                        <span class="history-total">${r.totalHours.toFixed(1)}h</span>
                    </div>
                    <div class="history-tags">${tags}</div>
                    ${r.note ? `<div class="history-note">📝 ${r.note}</div>` : ''}
                    <div class="history-actions" style="display:flex; gap:8px; margin-top:8px;">
                        <button class="btn-delete-sm" style="border-color:rgba(16,185,129,0.3); color:var(--green-light);" onclick="editRecordDialog('${r.id}')">Sửa</button>
                        <button class="btn-delete-sm" onclick="deleteRecord('${r.id}')">Xóa</button>
                    </div>
                </div>`;
        }).join('');

        summary.innerHTML = `
            <div class="summary-item"><span class="summary-label">Ngày:</span><span class="summary-val">${mergedRecords.length}</span></div>
            <div class="summary-item"><span class="summary-label">Trưa:</span><span class="summary-val">${tLunch.toFixed(1)}h</span></div>
            <div class="summary-item"><span class="summary-label">Chiều:</span><span class="summary-val">${tEvening.toFixed(1)}h</span></div>
            <div class="summary-item"><span class="summary-label">Tổng:</span><span class="summary-val">${tTotal.toFixed(1)}h</span></div>`;
    } catch (err) {
        list.innerHTML = `<div class="empty-state"><p>Lỗi tải dữ liệu</p></div>`;
    }
}

async function deleteRecord(id) {
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
}

// ==================== PROFILE STATS ====================
async function loadProfileStats() {
    if (!currentUser) return;
    const month = getCurrentMonth();

    try {
        let records = [];
        if (API) {
            try {
                const data = await api(`/api/records?userId=${currentUser.id}&month=${month}`);
                records = data.records;
            } catch (e) {
                records = JSON.parse(safeStorage.getItem(`ot_cached_records_${currentUser.id}_${month}`) || '[]');
            }
        } else {
            records = JSON.parse(safeStorage.getItem(`ot_cached_records_${currentUser.id}_${month}`) || '[]');
        }

        const offlineRecords = JSON.parse(safeStorage.getItem('ot_offline_records') || '[]');
        const userOffline = offlineRecords.filter(r => r.userId === currentUser.id && r.date.startsWith(month));

        const mergedRecords = [...userOffline];
        records.forEach(r => {
            if (!mergedRecords.some(o => o.date === r.date)) {
                mergedRecords.push(r);
            }
        });

        const days = mergedRecords.length;
        const lunch = mergedRecords.filter(r => r.hasLunchOT).length * OT_LUNCH_HOURS;
        const evening = mergedRecords.reduce((s, r) => s + r.eveningOTHours, 0);
        const total = lunch + evening;

        document.getElementById('stat-days').textContent = days;
        document.getElementById('stat-lunch').textContent = lunch.toFixed(1);
        document.getElementById('stat-evening').textContent = evening.toFixed(1);
        document.getElementById('stat-total').textContent = total.toFixed(1);
    } catch (err) {
        // Silent fail
    }
}

// ==================== NAVIGATION ====================
function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    document.getElementById(`tab-${tabName}`).classList.add('active');
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

    // Reload data when switching tabs
    if (tabName === 'history') loadHistory();
    if (tabName === 'profile') loadProfileStats();

    // Scroll to top
    document.querySelector('.mobile-main').scrollTop = 0;
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
};

// Tự động phân giải URL Server từ Rentry Registry (dùng XHR cho Android 5.0)
function autoResolveRentryUrl() {
    return new Promise(function(resolve) {
        try {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', 'https://rentry.co/otmanager-hieutm-3456?t=' + Date.now(), true);
            xhr.timeout = 5000;
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
                        }
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
    }
}

// ==================== INIT ====================
document.addEventListener('DOMContentLoaded', () => {
    initSettings();
    
    // Hiển thị trạng thái kết nối ban đầu
    updateConnectionStatus(!!API, API);
    
    // Nếu đã có IP lưu sẵn, kiểm tra kết nối
    if (API) {
        // Thử kết nối nhanh để kiểm tra server còn sống không
        // Dùng XMLHttpRequest thay cho fetch + AbortSignal.timeout (không hỗ trợ trên Android 5.0)
        try {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', API + '/api/server-info', true);
            xhr.timeout = 3000;
            xhr.onload = function() {
                if (xhr.status === 200) {
                    updateConnectionStatus(true, API);
                    syncOfflineData();
                } else {
                    updateConnectionStatus(false, '');
                    startAutoDiscovery();
                }
            };
            xhr.onerror = function() {
                updateConnectionStatus(false, '');
                startAutoDiscovery();
            };
            xhr.ontimeout = function() {
                updateConnectionStatus(false, '');
                startAutoDiscovery();
            };
            xhr.send();
        } catch (e) {
            // Nếu lỗi bất kỳ, thử auto-discovery
            startAutoDiscovery();
        }
    } else {
        // Chưa có IP, bắt đầu auto-discovery
        startAutoDiscovery();
    }
    
    // Splash screen
    setTimeout(() => {
        document.getElementById('splash').classList.remove('active');

        // Auto login from saved session
        const saved = safeStorage.getItem('ot_mobile_user');
        if (saved) {
            try {
                currentUser = JSON.parse(saved);
                enterApp();
                return;
            } catch (e) {}
        }
        showScreen('screen-login');
    }, 1200);

    // Login form
    document.getElementById('form-login').addEventListener('submit', handleLogin);

    // OT form
    document.getElementById('form-ot').addEventListener('submit', handleOTSubmit);
    document.getElementById('ot-lunch').addEventListener('change', updatePreview);
    document.getElementById('ot-start').addEventListener('change', updatePreview);
    document.getElementById('ot-end').addEventListener('change', updatePreview);

    // Edit OT form
    const formEditOT = document.getElementById('form-edit-ot');
    if (formEditOT) formEditOT.addEventListener('submit', handleEditOTSubmit);

    const btnEditOTCancel = document.getElementById('edit-ot-cancel');
    if (btnEditOTCancel) {
        btnEditOTCancel.addEventListener('click', () => {
            document.getElementById('edit-overlay').classList.remove('active');
        });
    }

    // Attach editRecordDialog to window so onclick works
    window.editRecordDialog = editRecordDialog;

    // Month filter
    document.getElementById('filter-month').addEventListener('change', loadHistory);

    // Navigation
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // Logout
    document.getElementById('btn-logout').addEventListener('click', logout);
    document.getElementById('btn-logout-2').addEventListener('click', logout);

    // Kéo để làm mới (Pull to refresh)
    let touchStart = 0;
    let isPulling = false;
    const ptr = document.getElementById('pull-to-refresh');
    const scrollContainer = document.querySelector('.mobile-main');

    if (scrollContainer && ptr) {
        scrollContainer.addEventListener('touchstart', e => {
            if (scrollContainer.scrollTop === 0) {
                touchStart = e.touches[0].clientY;
                isPulling = true;
            }
        }, { passive: true });

        scrollContainer.addEventListener('touchmove', e => {
            if (!isPulling) return;
            const currentY = e.touches[0].clientY;
            const dist = currentY - touchStart;
            if (dist > 0) {
                if (dist > 5) {
                    ptr.classList.add('visible');
                    const icon = ptr.querySelector('.ptr-icon');
                    const text = ptr.querySelector('.ptr-text');
                    if (dist > 80) {
                        icon.classList.add('rotate');
                        text.textContent = 'Thả tay để làm mới...';
                    } else {
                        icon.classList.remove('rotate');
                        text.textContent = 'Kéo để làm mới...';
                    }
                }
            }
        }, { passive: true });

        scrollContainer.addEventListener('touchend', async e => {
            if (!isPulling) return;
            isPulling = false;
            const currentY = e.changedTouches[0].clientY;
            const dist = currentY - touchStart;
            
            if (dist > 80) {
                const icon = ptr.querySelector('.ptr-icon');
                const spinner = ptr.querySelector('.ptr-spinner');
                const text = ptr.querySelector('.ptr-text');
                
                icon.style.display = 'none';
                spinner.style.display = 'inline-block';
                text.textContent = 'Đang tải dữ liệu...';
                
                try {
                    if (currentUser) {
                        await Promise.all([loadHistory(), loadProfileStats(), syncOfflineData()]);
                    }
                    showToast('Đã làm mới dữ liệu!', 'success');
                } catch (err) {
                    showToast('Không thể kết nối để làm mới!', 'error');
                }
                
                setTimeout(() => {
                    ptr.classList.remove('visible');
                    setTimeout(() => {
                        icon.style.display = 'inline-block';
                        spinner.style.display = 'none';
                        text.textContent = 'Kéo để làm mới...';
                    }, 250);
                }, 600);
            } else {
                ptr.classList.remove('visible');
            }
        });
    }

    // Tự động kiểm tra và đồng bộ mỗi 15 giây
    setInterval(syncOfflineData, 15000);
});

function startAutoDiscovery() {
    // 1. Thử Rentry trước (kết nối qua Internet)
    autoResolveRentryUrl().then(success => {
        if (!success) {
            // 2. Nếu không được, gọi native Android để quét WiFi nội bộ
            if (window.AndroidBridge && typeof window.AndroidBridge.startAutoDiscovery === 'function') {
                window.AndroidBridge.startAutoDiscovery();
            }
        }
    });
}

// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
}

// ==================== EDIT DYNAMIC OVERLAY ====================
let activeEditRecordId = null;

async function editRecordDialog(id) {
    activeEditRecordId = id;
    try {
        let record = null;
        if (id.startsWith('offline_')) {
            const offlineRecords = JSON.parse(safeStorage.getItem('ot_offline_records') || '[]');
            record = offlineRecords.find(r => r.id === id);
        } else {
            const month = document.getElementById('filter-month').value;
            const cached = JSON.parse(safeStorage.getItem(`ot_cached_records_${currentUser.id}_${month}`) || '[]');
            record = cached.find(r => r.id === id);
        }

        if (!record) return showToast('Không tìm thấy bản ghi', 'error');

        document.getElementById('edit-ot-date').value = record.date;
        document.getElementById('edit-ot-lunch').checked = record.hasLunchOT;
        document.getElementById('edit-ot-start').value = record.otStart || '16:30';
        document.getElementById('edit-ot-end').value = record.otEnd || '18:00';
        document.getElementById('edit-ot-note').value = record.note || '';

        document.getElementById('edit-overlay').classList.add('active');
    } catch (err) {
        showToast('Lỗi tải dữ liệu: ' + err.message, 'error');
    }
}

async function handleEditOTSubmit(e) {
    e.preventDefault();
    if (!currentUser || !activeEditRecordId) return;

    const date = document.getElementById('edit-ot-date').value;
    const lunch = document.getElementById('edit-ot-lunch').checked;
    const start = document.getElementById('edit-ot-start').value;
    const end = document.getElementById('edit-ot-end').value;
    const note = document.getElementById('edit-ot-note').value.trim();

    const eveningOTHours = calcEveningOT(start, end);
    const totalHours = (lunch ? OT_LUNCH_HOURS : 0) + eveningOTHours;

    if (totalHours <= 0) {
        showToast('Vui lòng chọn ít nhất một loại OT!', 'error');
        return;
    }

    const updatedData = {
        date,
        hasLunchOT: lunch,
        otStart: eveningOTHours > 0 ? start : '',
        otEnd: eveningOTHours > 0 ? end : '',
        eveningOTHours,
        totalHours,
        note
    };

    if (API && !activeEditRecordId.startsWith('offline_')) {
        try {
            await api(`/api/records/${activeEditRecordId}`, 'PUT', updatedData);
            showToast('Đã cập nhật tăng ca thành công!');
            document.getElementById('edit-overlay').classList.remove('active');
            loadHistory();
            loadProfileStats();
            return;
        } catch (err) {
            console.log('Online edit failed, falling back to offline:', err);
        }
    }

    const offlineRecords = JSON.parse(safeStorage.getItem('ot_offline_records') || '[]');
    if (activeEditRecordId.startsWith('offline_')) {
        const idx = offlineRecords.findIndex(r => r.id === activeEditRecordId);
        if (idx >= 0) {
            offlineRecords[idx] = Object.assign(offlineRecords[idx], updatedData, { updatedAt: new Date().toISOString() });
        }
    } else {
        const idx = offlineRecords.findIndex(r => r.id === activeEditRecordId);
        const record = Object.assign({
            id: activeEditRecordId,
            userId: currentUser.id,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        }, updatedData);
        if (idx >= 0) {
            offlineRecords[idx] = record;
        } else {
            offlineRecords.push(record);
        }
    }

    safeStorage.setItem('ot_offline_records', JSON.stringify(offlineRecords));
    showToast('Đã lưu chỉnh sửa ngoại tuyến (offline)!', 'warning');
    document.getElementById('edit-overlay').classList.remove('active');
    loadHistory();
    loadProfileStats();
}
