/**
 * OT Manager - Desktop App (Admin)
 * Giờ làm chính: 7:00 - 16:30
 * Nghỉ trưa: 11:50 - 13:20
 * OT trưa: 12:20 - 13:20 (1 tiếng)
 *
 * Sử dụng Server API để đồng bộ dữ liệu với mobile
 */

let API_BASE = window.location.origin;
const OT_LUNCH_HOURS = 1;
const WORK_END = '16:30';

// ==================== API CLIENT ====================
async function api(endpoint, method = 'GET', body = null) {
    const opts = {
        method,
        headers: { 'Content-Type': 'application/json' },
    };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`${API_BASE}${endpoint}`, opts);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Lỗi kết nối server');
    return data;
}

// ==================== HELPERS ====================
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

function formatDate(dateStr) {
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
}

function formatDateFull(date) {
    const days = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
    const months = ['tháng 1', 'tháng 2', 'tháng 3', 'tháng 4', 'tháng 5', 'tháng 6',
                    'tháng 7', 'tháng 8', 'tháng 9', 'tháng 10', 'tháng 11', 'tháng 12'];
    return `${days[date.getDay()]}, ${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

function timeToMinutes(timeStr) {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
}

function getCurrentMonth() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icons = { success: '✓', error: '✕', info: 'ℹ' };
    toast.innerHTML = `<span>${icons[type] || ''}</span> ${message}`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.animation = 'slideOutRight 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function showModal(title, body, buttons = []) {
    const overlay = document.getElementById('modal-overlay');
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = body;
    const footer = document.getElementById('modal-footer');
    footer.innerHTML = '';
    buttons.forEach(btn => {
        const button = document.createElement('button');
        button.className = `btn ${btn.class || 'btn-ghost'}`;
        button.textContent = btn.text;
        button.onclick = () => { if (btn.action) btn.action(); closeModal(); };
        footer.appendChild(button);
    });
    overlay.classList.add('active');
}

function closeModal() {
    document.getElementById('modal-overlay').classList.remove('active');
}

function calculateEveningOT(startTime, endTime) {
    const startMin = timeToMinutes(startTime);
    const endMin = timeToMinutes(endTime);
    const workEndMin = timeToMinutes(WORK_END);
    const effectiveStart = Math.max(startMin, workEndMin);
    if (endMin <= effectiveStart) return 0;
    return Math.round(((endMin - effectiveStart) / 60) * 100) / 100;
}

// ==================== SCREEN MANAGEMENT ====================
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
}

// ==================== AUTH ====================
async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');

    try {
        const data = await api('/api/auth/login', 'POST', { username, password });
        const user = data.user;
        errorEl.textContent = '';
        localStorage.setItem('ot_current_user', JSON.stringify(user));

        if (user.role === 'admin') {
            initAdminDashboard(user);
            showScreen('screen-admin');
        } else {
            initEmployeeDashboard(user);
            showScreen('screen-employee');
        }
        showToast(`Xin chào, ${user.fullname}!`, 'info');
        e.target.reset();
    } catch (err) {
        errorEl.textContent = err.message;
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const fullname = document.getElementById('reg-fullname').value.trim();
    const username = document.getElementById('reg-username').value.trim();
    const password = document.getElementById('reg-password').value;
    const role = document.getElementById('reg-role').value;
    const errorEl = document.getElementById('register-error');
    const successEl = document.getElementById('register-success');
    errorEl.textContent = '';
    successEl.textContent = '';

    try {
        await api('/api/auth/register', 'POST', { fullname, username, password, role });
        successEl.textContent = 'Đăng ký thành công! Bạn có thể đăng nhập.';
        e.target.reset();
        showToast('Đăng ký thành công!', 'success');
    } catch (err) {
        errorEl.textContent = err.message;
    }
}

function logout() {
    localStorage.removeItem('ot_current_user');
    showScreen('screen-login');
    showToast('Đã đăng xuất', 'info');
}

// ==================== ADMIN DASHBOARD ====================
async function initAdminDashboard(user) {
    document.getElementById('admin-welcome').textContent = `Xin chào, ${user.fullname}`;
    document.getElementById('admin-date').textContent = formatDateFull(new Date());

    const currentMonth = getCurrentMonth();
    document.getElementById('admin-filter-month').value = currentMonth;
    document.getElementById('report-filter-month').value = currentMonth;

    await populateUserFilter();
    await Promise.all([
        refreshAdminRecords(),
        refreshAdminUsers(),
        refreshReport(),
        refreshAdminStats()
    ]);
}

// Khởi tạo kênh nhận sự kiện thời gian thực (SSE)
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

async function populateUserFilter() {
    const select = document.getElementById('admin-filter-user');
    try {
        const data = await api('/api/users');
        const users = data.users.filter(u => u.role === 'employee');
        select.innerHTML = '<option value="">Tất cả</option>';
        users.forEach(u => {
            select.innerHTML += `<option value="${u.id}">${u.fullname}</option>`;
        });
    } catch (e) {}
}

async function refreshAdminStats() {
    try {
        const stats = await api('/api/stats');
        document.getElementById('stat-total-users').textContent = stats.totalUsers;
        document.getElementById('stat-total-ot').textContent = stats.totalOTMonth.toFixed(1);
        document.getElementById('stat-today-ot').textContent = stats.todayOT.toFixed(1);
        document.getElementById('stat-lunch-ot').textContent = stats.lunchOTMonth;
    } catch (e) {}
}

async function refreshAdminRecords() {
    const month = document.getElementById('admin-filter-month').value;
    const userId = document.getElementById('admin-filter-user').value;
    const searchUser = document.getElementById('admin-search-user').value.toLowerCase().trim();
    const searchNote = document.getElementById('admin-search-note').value.toLowerCase().trim();

    try {
        let url = '/api/records?';
        if (month) url += `month=${month}&`;
        if (userId) url += `userId=${userId}&`;

        const data = await api(url);
        const records = data.records;
        const usersData = await api('/api/users');
        const users = usersData.users;

        const filteredRecords = records.filter(r => {
            const user = users.find(u => u.id === r.userId);
            const matchesUser = !searchUser || (user && (
                user.fullname.toLowerCase().includes(searchUser) ||
                user.username.toLowerCase().includes(searchUser)
            ));
            const matchesNote = !searchNote || (r.note && r.note.toLowerCase().includes(searchNote));
            return matchesUser && matchesNote;
        });

        const tbody = document.getElementById('admin-records-body');

        if (filteredRecords.length === 0) {
            tbody.innerHTML = '<tr class="empty-row"><td colspan="9">Không tìm thấy dữ liệu tăng ca phù hợp bộ lọc</td></tr>';
            document.getElementById('admin-table-summary').innerHTML = '';
            return;
        }

        let totalLunchOT = 0, totalEveningOT = 0, totalHours = 0;

        tbody.innerHTML = filteredRecords.map(r => {
            const user = users.find(u => u.id === r.userId);
            const lunchHours = r.hasLunchOT ? OT_LUNCH_HOURS : 0;
            totalLunchOT += lunchHours;
            totalEveningOT += r.eveningOTHours;
            totalHours += r.totalHours;

            return `<tr>
                <td><strong>${user ? user.fullname : 'N/A'}</strong></td>
                <td>${formatDate(r.date)}</td>
                <td>${r.hasLunchOT ? '<span class="tag tag-yes">✓ Có</span>' : '<span class="tag tag-no">Không</span>'}</td>
                <td>${r.eveningOTHours > 0 ? `<span class="text-green text-bold">${r.eveningOTHours.toFixed(1)}h</span>` : '<span class="text-muted">—</span>'}</td>
                <td>${r.otStart || '—'}</td>
                <td>${r.otEnd || '—'}</td>
                <td><span class="text-purple text-bold">${r.totalHours.toFixed(1)}</span></td>
                <td>${r.note || '<span style="color:var(--text-muted)">—</span>'}</td>
                <td><div class="action-buttons">
                    <button class="btn-icon-only edit" onclick="editRecordDialog('${r.id}', 'admin')" title="Sửa" style="margin-right: 4px;">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                    </button>
                    <button class="btn-icon-only delete" onclick="deleteRecord('${r.id}', 'admin')" title="Xóa">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                            <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                    </button>
                </div></td>
            </tr>`;
        }).join('');

        document.getElementById('admin-table-summary').innerHTML = `
            <div class="summary-item"><span class="summary-label">Tổng bản ghi:</span><span class="summary-value">${records.length}</span></div>
            <div class="summary-item"><span class="summary-label">OT Trưa:</span><span class="summary-value">${totalLunchOT.toFixed(1)}h</span></div>
            <div class="summary-item"><span class="summary-label">OT Chiều:</span><span class="summary-value">${totalEveningOT.toFixed(1)}h</span></div>
            <div class="summary-item"><span class="summary-label">Tổng OT:</span><span class="summary-value">${totalHours.toFixed(1)}h</span></div>`;
    } catch (e) {
        console.error(e);
    }
}

async function refreshAdminUsers() {
    try {
        const usersData = await api('/api/users');
        const users = usersData.users;
        const currentMonth = getCurrentMonth();
        const recData = await api(`/api/records?month=${currentMonth}`);
        const records = recData.records;
        const tbody = document.getElementById('admin-users-body');

        tbody.innerHTML = users.map((u, i) => {
            const userRecords = records.filter(r => r.userId === u.id);
            const totalOT = userRecords.reduce((sum, r) => sum + r.totalHours, 0);

            // Nút reset liên kết thiết bị
            const resetBtn = u.role === 'employee' && u.deviceId ? `
                <button class="btn-icon-only" onclick="resetUserDevice('${u.id}', '${u.fullname}')" title="Reset liên kết thiết bị" style="margin-right: 4px; color: #f59e0b; border-color: rgba(245, 158, 11, 0.3);">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                        <path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path><polyline points="12 2 12 12"></polyline>
                    </svg>
                </button>
            ` : '';

            return `<tr>
                <td>${i + 1}</td>
                <td><strong>${u.fullname}</strong></td>
                <td>${u.username}</td>
                <td>${u.role === 'admin' ? '<span class="tag tag-admin">Quản lý</span>' : '<span class="tag tag-employee">Nhân viên</span>'}</td>
                <td><span class="text-purple text-bold">${totalOT.toFixed(1)}h</span></td>
                <td><div class="action-buttons">
                    ${u.username !== 'admin' ? `
                        ${resetBtn}
                        <button class="btn-icon-only edit" onclick="editUserDialog('${u.id}')" title="Sửa" style="margin-right: 4px;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                        </button>
                        <button class="btn-icon-only delete" onclick="deleteUser('${u.id}')" title="Xóa">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                                <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                            </svg>
                        </button>
                    ` : '<span class="text-muted" style="font-size:12px">Mặc định</span>'}
                </div></td>
            </tr>`;
        }).join('');
    } catch (e) {}
}

async function refreshReport() {
    const month = document.getElementById('report-filter-month').value;
    try {
        const usersData = await api('/api/users');
        const users = usersData.users.filter(u => u.role === 'employee');
        const recData = await api(`/api/records?month=${month}`);
        const records = recData.records;
        const tbody = document.getElementById('report-body');

        if (users.length === 0) {
            tbody.innerHTML = '<tr class="empty-row"><td colspan="6">Chưa có nhân viên</td></tr>';
            return;
        }

        tbody.innerHTML = users.map((u, i) => {
            const ur = records.filter(r => r.userId === u.id);
            const days = ur.length;
            const lunchH = ur.filter(r => r.hasLunchOT).length * OT_LUNCH_HOURS;
            const eveningH = ur.reduce((s, r) => s + r.eveningOTHours, 0);
            const totalH = lunchH + eveningH;
            return `<tr>
                <td>${i + 1}</td>
                <td><strong>${u.fullname}</strong></td>
                <td>${days}</td>
                <td>${lunchH.toFixed(1)}</td>
                <td>${eveningH.toFixed(1)}</td>
                <td><span class="text-purple text-bold">${totalH.toFixed(1)}</span></td>
            </tr>`;
        }).join('');
    } catch (e) {}
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

async function exportExcel() {
    const month = document.getElementById('report-filter-month').value;
    try {
        const usersData = await api('/api/users');
        const users = usersData.users.filter(u => u.role === 'employee');
        const recData = await api(`/api/records?month=${month}`);
        const records = recData.records;

        let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
        <head>
        <meta charset="utf-8">
        <!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>Báo cáo tăng ca</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
        <style>
            table { border-collapse: collapse; }
            th { background-color: #6366f1; color: white; font-weight: bold; border: 1.5px solid #ccc; padding: 10px; }
            td { border: 1px solid #ccc; padding: 8px; text-align: center; }
            .name { text-align: left; font-weight: bold; }
            .total { font-weight: bold; color: #8b5cf6; }
        </style>
        </head>
        <body>
        <h2>Báo cáo tổng hợp tăng ca - Tháng ${month}</h2>
        <table>
            <thead>
                <tr>
                    <th>STT</th>
                    <th>Họ và tên</th>
                    <th>Số ngày OT</th>
                    <th>OT Trưa (giờ)</th>
                    <th>OT Chiều (giờ)</th>
                    <th>Tổng OT (giờ)</th>
                </tr>
            </thead>
            <tbody>`;
        users.forEach((u, i) => {
            const ur = records.filter(r => r.userId === u.id);
            const days = ur.length;
            const lh = ur.filter(r => r.hasLunchOT).length * OT_LUNCH_HOURS;
            const eh = ur.reduce((s, r) => s + r.eveningOTHours, 0);
            html += `<tr>
                <td>${i + 1}</td>
                <td class="name">${u.fullname}</td>
                <td>${days}</td>
                <td>${lh.toFixed(1)}</td>
                <td>${eh.toFixed(1)}</td>
                <td class="total">${(lh + eh).toFixed(1)}</td>
            </tr>`;
        });
        html += `</tbody></table></body></html>`;

        const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `bao-cao-tang-ca-${month}.xls`;
        link.click();
        URL.revokeObjectURL(link.href);
        showToast('Đã xuất file Excel!');
    } catch (e) { showToast('Lỗi xuất Excel', 'error'); }
}

// ==================== EMPLOYEE DASHBOARD ====================
async function initEmployeeDashboard(user) {
    document.getElementById('emp-welcome').textContent = `Xin chào, ${user.fullname}`;
    document.getElementById('emp-date').textContent = formatDateFull(new Date());
    const todayStr = new Date().toISOString().split('T')[0];
    document.getElementById('ot-date').value = todayStr;
    document.getElementById('ot-date').max = todayStr;
    document.getElementById('emp-filter-month').value = getCurrentMonth();
    updateOTPreview();
    await refreshEmployeeRecords();
}

function updateOTPreview() {
    const hasLunch = document.getElementById('ot-lunch').checked;
    const otStart = document.getElementById('ot-start').value;
    const otEnd = document.getElementById('ot-end').value;
    const previewItems = document.getElementById('preview-items');
    const previewTotal = document.getElementById('preview-total');
    let items = [];
    let total = 0;

    if (hasLunch) {
        items.push({ label: 'OT Trưa (12:20 - 13:20)', value: `${OT_LUNCH_HOURS} giờ` });
        total += OT_LUNCH_HOURS;
    }

    if (otStart && otEnd) {
        const eveningHours = calculateEveningOT(otStart, otEnd);
        if (eveningHours > 0) {
            items.push({ label: `OT Chiều (${otStart} - ${otEnd})`, value: `${eveningHours.toFixed(1)} giờ` });
            total += eveningHours;
        }
    }

    previewItems.innerHTML = items.length === 0
        ? '<div class="preview-item"><span>Chưa có OT nào được chọn</span></div>'
        : items.map(i => `<div class="preview-item"><span>${i.label}</span><span class="preview-item-value">${i.value}</span></div>`).join('');
    previewTotal.textContent = total.toFixed(1);
}

async function handleOTSubmit(e) {
    e.preventDefault();
    const user = JSON.parse(localStorage.getItem('ot_current_user'));
    if (!user) return;

    const date = document.getElementById('ot-date').value;
    const hasLunch = document.getElementById('ot-lunch').checked;
    const otStart = document.getElementById('ot-start').value;
    const otEnd = document.getElementById('ot-end').value;
    const note = document.getElementById('ot-note').value.trim();
    const errorEl = document.getElementById('ot-error');
    const successEl = document.getElementById('ot-success');
    errorEl.textContent = '';
    successEl.textContent = '';

    if (!date) { errorEl.textContent = 'Vui lòng chọn ngày!'; return; }

    const eveningHours = calculateEveningOT(otStart, otEnd);
    const lunchHours = hasLunch ? OT_LUNCH_HOURS : 0;
    const totalHours = lunchHours + eveningHours;

    if (totalHours <= 0) { errorEl.textContent = 'Vui lòng chọn ít nhất một loại OT!'; return; }

    try {
        const data = await api('/api/records', 'POST', {
            userId: user.id, date, hasLunchOT: hasLunch,
            otStart: eveningHours > 0 ? otStart : '',
            otEnd: eveningHours > 0 ? otEnd : '',
            eveningOTHours: eveningHours, totalHours, note
        });

        const action = data.updated ? 'Đã cập nhật' : 'Đã lưu';
        successEl.textContent = `${action} ${totalHours.toFixed(1)} giờ tăng ca!`;
        showToast(`${action} ${totalHours.toFixed(1)} giờ tăng ca`);

        document.getElementById('ot-lunch').checked = false;
        document.getElementById('ot-start').value = '16:30';
        document.getElementById('ot-end').value = '18:00';
        document.getElementById('ot-note').value = '';
        updateOTPreview();
        await refreshEmployeeRecords();
        setTimeout(() => { successEl.textContent = ''; }, 3000);
    } catch (err) {
        errorEl.textContent = err.message;
    }
}

async function refreshEmployeeRecords() {
    const user = JSON.parse(localStorage.getItem('ot_current_user'));
    if (!user) return;

    const month = document.getElementById('emp-filter-month').value;
    try {
        const data = await api(`/api/records?userId=${user.id}&month=${month}`);
        const records = data.records;
        const tbody = document.getElementById('emp-records-body');

        if (records.length === 0) {
            tbody.innerHTML = '<tr class="empty-row"><td colspan="8">Chưa có dữ liệu tăng ca</td></tr>';
            document.getElementById('emp-table-summary').innerHTML = '';
            return;
        }

        let totalLunchOT = 0, totalEveningOT = 0, totalHours = 0;
        tbody.innerHTML = records.map(r => {
            const lh = r.hasLunchOT ? OT_LUNCH_HOURS : 0;
            totalLunchOT += lh;
            totalEveningOT += r.eveningOTHours;
            totalHours += r.totalHours;
            return `<tr>
                <td>${formatDate(r.date)}</td>
                <td>${r.hasLunchOT ? '<span class="tag tag-yes">✓ Có</span>' : '<span class="tag tag-no">Không</span>'}</td>
                <td>${r.eveningOTHours > 0 ? `<span class="text-green text-bold">${r.eveningOTHours.toFixed(1)}h</span>` : '<span style="color:var(--text-muted)">—</span>'}</td>
                <td>${r.otStart || '—'}</td>
                <td>${r.otEnd || '—'}</td>
                <td><span class="text-purple text-bold">${r.totalHours.toFixed(1)}</span></td>
                <td>${r.note || '<span style="color:var(--text-muted)">—</span>'}</td>
                <td><div class="action-buttons">
                    <button class="btn-icon-only delete" onclick="deleteRecord('${r.id}', 'employee')" title="Xóa">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                            <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                    </button>
                </div></td>
            </tr>`;
        }).join('');

        document.getElementById('emp-table-summary').innerHTML = `
            <div class="summary-item"><span class="summary-label">Số ngày OT:</span><span class="summary-value">${records.length}</span></div>
            <div class="summary-item"><span class="summary-label">OT Trưa:</span><span class="summary-value">${totalLunchOT.toFixed(1)}h</span></div>
            <div class="summary-item"><span class="summary-label">OT Chiều:</span><span class="summary-value">${totalEveningOT.toFixed(1)}h</span></div>
            <div class="summary-item"><span class="summary-label">Tổng OT:</span><span class="summary-value">${totalHours.toFixed(1)}h</span></div>`;
    } catch (e) {}
}

// ==================== CLOUD WAKING & SYNC CONFIG ====================
async function initCloudConfig() {
    try {
        const res = await fetch('/api/cloud-url');
        const data = await res.json();
        if (data.cloudUrl) {
            API_BASE = data.cloudUrl;
            if (API_BASE.endsWith('/')) {
                API_BASE = API_BASE.slice(0, -1);
            }
            console.log("[Desktop App] API Base trỏ tới Cloud:", API_BASE);
            showCloudWakeupOverlay();
            await wakeupCloudServer();
        }
    } catch (e) {
        console.error("Lỗi đồng bộ Cloud URL:", e);
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
            <h3 style="margin-top: 0; color: #10b981; font-size: 1.3rem; margin-bottom: 10px;">Đang kết nối Cloud Server</h3>
            <p style="font-size: 0.9rem; color: #a1a1aa; line-height: 1.5; margin-bottom: 8px;">Hệ thống đang kiểm tra kết nối và đánh thức Cloud Server miễn phí (Render Free Tier).</p>
            <p style="font-size: 0.8rem; color: #71717a; font-style: italic;">Có thể mất từ 30 đến 50 giây để khởi động lại máy chủ nếu server đang ngủ. Vui lòng đợi trong giây lát...</p>
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

// ==================== EVENT LISTENERS ====================
document.addEventListener('DOMContentLoaded', async () => {
    const otDateEl = document.getElementById('ot-date');
    if (otDateEl) otDateEl.max = new Date().toISOString().split('T')[0];

    // 1. Cấu hình và đồng bộ hóa Cloud Server trước khi tải trang dashboard
    await initCloudConfig();

    // Auto-login check
    const currentUser = JSON.parse(localStorage.getItem('ot_current_user') || 'null');
    if (currentUser) {
        if (currentUser.role === 'admin') {
            initAdminDashboard(currentUser);
            showScreen('screen-admin');
        } else {
            initEmployeeDashboard(currentUser);
            showScreen('screen-employee');
        }
    }

    // Kết nối SSE để nhận sự kiện thời gian thực
    initSseConnection();

    // Login tabs
    document.querySelectorAll('.login-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.login-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.login-form').forEach(f => f.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(`form-${tab.dataset.tab}`).classList.add('active');
            document.getElementById('login-error').textContent = '';
            document.getElementById('register-error').textContent = '';
            document.getElementById('register-success').textContent = '';
        });
    });

    // Admin tabs
    document.querySelectorAll('.admin-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(`admin-tab-${tab.dataset.adminTab}`).classList.add('active');
        });
    });

    // Forms
    document.getElementById('form-login').addEventListener('submit', handleLogin);
    document.getElementById('form-register').addEventListener('submit', handleRegister);
    document.getElementById('form-ot').addEventListener('submit', handleOTSubmit);

    // Logout
    document.getElementById('btn-logout-admin').addEventListener('click', logout);
    document.getElementById('btn-logout-emp').addEventListener('click', logout);

    // OT Preview
    document.getElementById('ot-lunch').addEventListener('change', updateOTPreview);
    document.getElementById('ot-start').addEventListener('change', updateOTPreview);
    document.getElementById('ot-end').addEventListener('change', updateOTPreview);

    // Filters
    document.getElementById('admin-filter-month').addEventListener('change', refreshAdminRecords);
    document.getElementById('admin-filter-user').addEventListener('change', refreshAdminRecords);
    document.getElementById('admin-search-user').addEventListener('input', refreshAdminRecords);
    document.getElementById('admin-search-note').addEventListener('input', refreshAdminRecords);
    document.getElementById('emp-filter-month').addEventListener('change', refreshEmployeeRecords);
    document.getElementById('report-filter-month').addEventListener('change', refreshReport);

    // Export
    document.getElementById('btn-export').addEventListener('click', exportExcel);

    // Modal
    document.getElementById('modal-close').addEventListener('click', closeModal);
    document.getElementById('modal-overlay').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeModal();
    });

    // Add User trigger
    const btnAddUser = document.getElementById('btn-add-user');
    if (btnAddUser) {
        btnAddUser.addEventListener('click', addUserDialog);
    }
});

// ==================== DYNAMIC DIALOGS (ADD/EDIT) ====================
async function editRecordDialog(recordId, source) {
    try {
        const data = await api(`/api/records`);
        const record = data.records.find(r => r.id === recordId);
        if (!record) return showToast('Không tìm thấy bản ghi', 'error');

        const body = `
        <form id="modal-form-record" class="login-form active" style="text-align: left; padding: 0;">
            <div class="form-group" style="margin-bottom: 15px;">
                <label style="display:block;margin-bottom:6px;font-weight:600;">Ngày tăng ca</label>
                <div class="input-wrapper">
                    <input type="date" id="modal-rec-date" value="${record.date}" max="${new Date().toISOString().split('T')[0]}" style="padding-left:12px;" required>
                </div>
            </div>
            <div class="form-group" style="display: flex; align-items: center; gap: 8px; margin-bottom: 15px;">
                <input type="checkbox" id="modal-rec-lunch" ${record.hasLunchOT ? 'checked' : ''} style="width:18px;height:18px;cursor:pointer;">
                <label for="modal-rec-lunch" style="margin-bottom: 0; cursor: pointer; user-select:none; font-weight:600;">Tăng ca trưa (12:20 - 13:20)</label>
            </div>
            <div class="form-group" style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 15px;">
                <div>
                    <label style="display:block;margin-bottom:6px;font-weight:600;">Bắt đầu OT chiều</label>
                    <input type="time" id="modal-rec-start" value="${record.otStart || '16:30'}" class="input-sm" style="width:100%; box-sizing:border-box;">
                </div>
                <div>
                    <label style="display:block;margin-bottom:6px;font-weight:600;">Kết thúc OT chiều</label>
                    <input type="time" id="modal-rec-end" value="${record.otEnd || '18:00'}" class="input-sm" style="width:100%; box-sizing:border-box;">
                </div>
            </div>
            <div class="form-group" style="margin-bottom: 0;">
                <label style="display:block;margin-bottom:6px;font-weight:600;">Ghi chú</label>
                <textarea id="modal-rec-note" class="input-sm" style="width:100%; height:60px; resize:none; box-sizing:border-box; padding:10px;">${record.note || ''}</textarea>
            </div>
        </form>`;

        showModal('Chỉnh sửa tăng ca', body, [
            { text: 'Hủy', class: 'btn-ghost' },
            { text: 'Lưu', class: 'btn btn-primary btn-sm', action: async () => {
                const date = document.getElementById('modal-rec-date').value;
                const hasLunch = document.getElementById('modal-rec-lunch').checked;
                const otStart = document.getElementById('modal-rec-start').value;
                const otEnd = document.getElementById('modal-rec-end').value;
                const note = document.getElementById('modal-rec-note').value.trim();

                if (!date) return showToast('Vui lòng chọn ngày!', 'error');

                const eveningHours = calculateEveningOT(otStart, otEnd);
                const lunchHours = hasLunch ? OT_LUNCH_HOURS : 0;
                const totalHours = lunchHours + eveningHours;

                if (totalHours <= 0) return showToast('Vui lòng chọn ít nhất một loại OT!', 'error');

                try {
                    await api(`/api/records/${recordId}`, 'PUT', {
                        date,
                        hasLunchOT: hasLunch,
                        otStart: eveningHours > 0 ? otStart : '',
                        otEnd: eveningHours > 0 ? otEnd : '',
                        eveningOTHours: eveningHours,
                        totalHours,
                        note
                    });
                    showToast('Đã cập nhật bản ghi tăng ca!');
                    if (source === 'admin') {
                        await Promise.all([refreshAdminRecords(), refreshAdminStats(), refreshReport()]);
                    } else {
                        await refreshEmployeeRecords();
                    }
                } catch (err) {
                    showToast(err.message, 'error');
                }
            }}
        ]);
    } catch (e) {
        showToast('Lỗi tải dữ liệu bản ghi', 'error');
    }
}

function addUserDialog() {
    const body = `
    <form id="modal-form-add-user" class="login-form active" style="text-align: left; padding: 0;">
        <div class="form-group" style="margin-bottom: 15px;">
            <label style="display:block;margin-bottom:6px;font-weight:600;">Họ và tên</label>
            <input type="text" id="modal-user-fullname" placeholder="Nguyễn Văn A" class="input-sm" style="width:100%; box-sizing:border-box;" required>
        </div>
        <div class="form-group" style="margin-bottom: 15px;">
            <label style="display:block;margin-bottom:6px;font-weight:600;">Tên đăng nhập</label>
            <input type="text" id="modal-user-username" placeholder="Chỉ viết liền, không dấu" class="input-sm" style="width:100%; box-sizing:border-box;" required>
        </div>
        <div class="form-group" style="margin-bottom: 15px;">
            <label style="display:block;margin-bottom:6px;font-weight:600;">Mật khẩu</label>
            <input type="password" id="modal-user-password" placeholder="Mật khẩu (bỏ trống đối với nhân viên)" class="input-sm" style="width:100%; box-sizing:border-box;">
        </div>
        <div class="form-group" style="margin-bottom: 0;">
            <label style="display:block;margin-bottom:6px;font-weight:600;">Vai trò</label>
            <select id="modal-user-role" class="input-sm" style="width:100%; box-sizing:border-box;">
                <option value="employee">Nhân viên (Điện thoại)</option>
                <option value="admin">Quản lý (Desktop)</option>
            </select>
        </div>
    </form>`;

    showModal('Thêm nhân viên mới', body, [
        { text: 'Hủy', class: 'btn-ghost' },
        { text: 'Thêm', class: 'btn btn-primary btn-sm', action: async () => {
            const fullname = document.getElementById('modal-user-fullname').value.trim();
            const username = document.getElementById('modal-user-username').value.trim();
            const password = document.getElementById('modal-user-password').value;
            const role = document.getElementById('modal-user-role').value;

            if (!fullname || !username) return showToast('Vui lòng điền họ tên và tên đăng nhập!', 'error');
            if (username.length < 3) return showToast('Tên đăng nhập tối thiểu 3 ký tự!', 'error');
            
            if (role === 'admin') {
                if (!password) return showToast('Tài khoản quản lý bắt buộc phải nhập mật khẩu!', 'error');
                if (password.length < 4) return showToast('Mật khẩu tối thiểu 4 ký tự!', 'error');
            }

            try {
                await api('/api/auth/register', 'POST', { fullname, username, password: password || '123', role });
                showToast('Thêm nhân viên thành công!');
                await Promise.all([populateUserFilter(), refreshAdminUsers(), refreshAdminStats(), refreshReport()]);
            } catch (err) {
                showToast(err.message, 'error');
            }
        }}
    ]);
}

async function editUserDialog(userId) {
    try {
        const data = await api('/api/users');
        const user = data.users.find(u => u.id === userId);
        if (!user) return showToast('Không tìm thấy nhân viên', 'error');

        const body = `
        <form id="modal-form-edit-user" class="login-form active" style="text-align: left; padding: 0;">
            <div class="form-group" style="margin-bottom: 15px;">
                <label style="display:block;margin-bottom:6px;font-weight:600;">Họ và tên</label>
                <input type="text" id="modal-user-fullname" value="${user.fullname}" class="input-sm" style="width:100%; box-sizing:border-box;" required>
            </div>
            <div class="form-group" style="margin-bottom: 15px;">
                <label style="display:block;margin-bottom:6px;font-weight:600;">Mật khẩu mới (Để trống nếu giữ nguyên)</label>
                <input type="password" id="modal-user-password" placeholder="Nhập mật khẩu mới nếu muốn đổi" class="input-sm" style="width:100%; box-sizing:border-box;">
            </div>
            <div class="form-group" style="margin-bottom: 0;">
                <label style="display:block;margin-bottom:6px;font-weight:600;">Vai trò</label>
                <select id="modal-user-role" class="input-sm" style="width:100%; box-sizing:border-box;">
                    <option value="employee" ${user.role === 'employee' ? 'selected' : ''}>Nhân viên (Điện thoại)</option>
                    <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Quản lý (Desktop)</option>
                </select>
            </div>
        </form>`;

        showModal('Sửa thông tin nhân viên', body, [
            { text: 'Hủy', class: 'btn-ghost' },
            { text: 'Lưu', class: 'btn btn-primary btn-sm', action: async () => {
                const fullname = document.getElementById('modal-user-fullname').value.trim();
                const password = document.getElementById('modal-user-password').value;
                const role = document.getElementById('modal-user-role').value;

                if (!fullname) return showToast('Vui lòng điền họ tên!', 'error');

                const payload = { fullname, role };
                if (password) {
                    if (password.length < 4) return showToast('Mật khẩu tối thiểu 4 ký tự!', 'error');
                    payload.password = password;
                }

                try {
                    await api(`/api/users/${userId}`, 'PUT', payload);
                    showToast('Cập nhật nhân viên thành công!');
                    await Promise.all([populateUserFilter(), refreshAdminUsers(), refreshAdminRecords(), refreshReport(), refreshAdminStats()]);
                } catch (err) {
                    showToast(err.message, 'error');
                }
            }}
        ]);
    } catch (e) {
        showToast('Lỗi tải dữ liệu người dùng', 'error');
    }
}

async function resetUserDevice(userId, fullname) {
    showModal('Reset liên kết thiết bị', `Bạn có chắc muốn xóa liên kết thiết bị của nhân viên <strong>${fullname}</strong>?<br>Sau khi xóa, nhân viên này có thể đăng nhập trên một điện thoại khác.`, [
        { text: 'Hủy', class: 'btn-ghost' },
        { text: 'Xóa liên kết', class: 'btn btn-danger btn-sm', action: async () => {
            try {
                await api(`/api/users/${userId}`, 'PUT', { deviceId: null });
                await refreshAdminUsers();
                showToast('Đã xóa liên kết thiết bị!');
            } catch (e) {
                showToast(e.message, 'error');
            }
        }}
    ]);
}
