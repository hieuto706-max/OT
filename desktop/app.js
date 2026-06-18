/**
 * OT Manager - Desktop App (Admin)
 * Giờ làm chính: 7:00 - 16:30
 * Nghỉ trưa: 11:50 - 13:20
 * OT trưa: 12:20 - 13:20 (1 tiếng)
 *
 * Sử dụng Server API để đồng bộ dữ liệu với mobile
 */

const isElectron = navigator.userAgent.toLowerCase().includes('electron');
const isGitHubPages = window.location.hostname.includes('github.io') || window.location.hostname.includes('otmanager.id.vn');
const localServerUrl = isGitHubPages 
    ? (localStorage.getItem('ot_server_ip') || 'https://ot-manager-server-jbxd.onrender.com') 
    : window.location.origin;
let API_BASE = localServerUrl;
const OT_LUNCH_HOURS = 1;
const WORK_END = '16:30';

// Add blink-red style rules dynamically
const style = document.createElement('style');
style.textContent = `
    @keyframes blink-red {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
    }
`;
document.head.appendChild(style);

// ==================== API CLIENT ====================
async function api(endpoint, method = 'GET', body = null) {
    const opts = {
        method,
        headers: { 'Content-Type': 'application/json' },
    };
    const currentUser = JSON.parse(localStorage.getItem('ot_current_user') || 'null');
    if (currentUser && currentUser.id) {
        opts.headers['x-user-id'] = currentUser.id;
    }
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
async function handleEmployeeLogin(e) {
    e.preventDefault();
    const username = document.getElementById('login-username').value.trim();
    const errorEl = document.getElementById('login-error-emp');
    errorEl.textContent = '';

    try {
        const data = await api('/api/auth/login', 'POST', { username });
        const user = data.user;

        if (user.role !== 'employee') {
            errorEl.textContent = 'Tài khoản này không phải là nhân viên!';
            return;
        }

        localStorage.setItem('ot_current_user', JSON.stringify(user));
        const todayStr = new Date().toISOString().split('T')[0];
        localStorage.setItem('ot_login_date', todayStr);
        try {
            const versionRes = await fetch(`${localServerUrl}/api/version`);
            const versionData = await versionRes.json();
            localStorage.setItem('ot_app_version', versionData.version || '1.0.0');
        } catch (e) {}

        initEmployeeDashboard(user);
        showScreen('screen-employee');
        showToast(`Xin chào, ${user.fullname}!`, 'info');
        e.target.reset();
    } catch (err) {
        errorEl.textContent = err.message;
    }
}

async function handleAdminLogin(e) {
    e.preventDefault();
    const username = document.getElementById('login-admin-username').value.trim();
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error-admin');
    errorEl.textContent = '';

    try {
        const data = await api('/api/auth/login', 'POST', { username, password });
        const user = data.user;

        if (user.role !== 'admin') {
            errorEl.textContent = 'Tài khoản nhân viên không được phép đăng nhập bên phần quản trị!';
            return;
        }

        localStorage.setItem('ot_current_user', JSON.stringify(user));
        const todayStr = new Date().toISOString().split('T')[0];
        localStorage.setItem('ot_login_date', todayStr);
        try {
            const versionRes = await fetch(`${localServerUrl}/api/version`);
            const versionData = await versionRes.json();
            localStorage.setItem('ot_app_version', versionData.version || '1.0.0');
        } catch (e) {}

        initAdminDashboard(user);
        showScreen('screen-admin');
        showToast(`Xin chào, ${user.fullname}!`, 'info');
        e.target.reset();
    } catch (err) {
        errorEl.textContent = err.message;
    }
}

function checkMidnightLogout() {
    const currentUser = localStorage.getItem('ot_current_user');
    if (!currentUser) return;

    const loginDate = localStorage.getItem('ot_login_date');
    const todayStr = new Date().toISOString().split('T')[0];
    if (loginDate && loginDate !== todayStr) {
        logout();
        showToast('Đã qua ngày mới, vui lòng đăng nhập lại.', 'info');
    }
}

function logout() {
    localStorage.removeItem('ot_current_user');
    localStorage.removeItem('ot_login_date');
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
    checkGistStatus();
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
    const adminOtUser = document.getElementById('admin-ot-user');
    try {
        const data = await api('/api/users');
        const users = data.users;
        users.sort((a, b) => a.fullname.localeCompare(b.fullname, 'vi'));
        if (select) {
            select.innerHTML = '<option value="">Tất cả</option>';
            users.forEach(u => {
                const suffix = u.role === 'admin' ? ' (Admin)' : '';
                select.innerHTML += `<option value="${u.id}">${u.fullname}${suffix}</option>`;
            });
        }
        if (adminOtUser) {
            adminOtUser.innerHTML = '<option value="">-- Chọn nhân viên --</option>';
            users.forEach(u => {
                const suffix = u.role === 'admin' ? ' (Admin)' : '';
                adminOtUser.innerHTML += `<option value="${u.id}">${u.fullname}${suffix}</option>`;
            });
        }
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
            if (u.deviceId) {
                deviceUnlinkBtn = `
                    <button class="btn-icon-only" onclick="resetUserDevice('${u.id}', '${u.fullname}', 'mobile')" title="Xóa liên kết App điện thoại" style="margin-right: 4px; color: #f59e0b; border-color: rgba(245, 158, 11, 0.3); padding: 4px 6px;">
                        📱 Reset Mobile
                    </button>
                `;
            }
            let browserUnlinkBtn = '';
            if (u.browserDeviceId) {
                browserUnlinkBtn = `
                    <button class="btn-icon-only" onclick="resetUserDevice('${u.id}', '${u.fullname}', 'browser')" title="Xóa liên kết Trình duyệt web" style="margin-right: 4px; color: #6366f1; border-color: rgba(99, 102, 241, 0.3); padding: 4px 6px;">
                        🌐 Reset Web
                    </button>
                `;
            }
            let approveBtn = '';
            if (u.pendingUnlink) {
                approveBtn = `
                    <button class="btn-icon-only" onclick="approveUnlinkDevice('${u.id}', '${u.fullname}')" title="Duyệt yêu cầu huỷ liên kết" style="margin-right: 4px; color: #10b981; border-color: rgba(16, 185, 129, 0.3); font-weight: bold; padding: 4px 6px;">
                        ✓ Duyệt Huỷ
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
                <td><span class="tag tag-employee">Nhân viên</span></td>
                <td><span class="text-purple text-bold">${totalOT.toFixed(1)}h</span></td>
                <td><div class="action-buttons">
                    ${approveBtn}
                    ${deviceUnlinkBtn}
                    ${browserUnlinkBtn}
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
                </div></td>
            </tr>`;
        }).join('') || '<tr class="empty-row"><td colspan="6">Không có nhân viên</td></tr>';

        // Render managers (admins)
        const tbodyMgr = document.getElementById('admin-managers-body');
        tbodyMgr.innerHTML = managers.map((u, i) => {
            return `<tr>
                <td>${i + 1}</td>
                <td><strong>${u.fullname}</strong></td>
                <td>${u.username}</td>
                <td><span class="tag tag-admin">Quản lý</span></td>
                <td><div class="action-buttons">
                    ${u.username !== 'admin' ? `
                        <button class="btn-icon-only edit" onclick="editUserDialog('${u.id}')" title="Sửa" style="margin-right: 4px;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                        </button>
                        <button class="btn-icon-only delete" onclick="deleteUser('${u.id}')" title="Xóa">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                                <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2 2v2"/>
                            </svg>
                        </button>
                    ` : '<span class="text-muted" style="font-size:12px">Mặc định</span>'}
                </div></td>
            </tr>`;
        }).join('') || '<tr class="empty-row"><td colspan="5">Không có quản lý</td></tr>';

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
        const currentUser = JSON.parse(localStorage.getItem('ot_current_user') || 'null');
        let users = usersData.users;
        if (currentUser && currentUser.username !== 'admin') {
            // Lọc chỉ xuất báo cáo của chính Admin đó và nhân viên thuộc team mình quản lý
            users = users.filter(u => u.id === currentUser.id || u.managerId === currentUser.id);
        }
        users.sort((a, b) => a.fullname.localeCompare(b.fullname, 'vi'));

        const recData = await api(`/api/records?month=${month}`);
        const records = recData.records;

        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        const exportTime = `${formatDateFull(now)} lúc ${timeStr}`;

        // Khởi tạo workbook mới của ExcelJS
        const workbook = new ExcelJS.Workbook();
        
        // ------------------ SHEET 1: TỔNG HỢP ------------------
        const wsSummary = workbook.addWorksheet('Tổng Hợp', {
            views: [{ showGridLines: true }]
        });

        // 1. Tiêu đề chính
        wsSummary.mergeCells('A1:G1');
        const title1 = wsSummary.getCell('A1');
        title1.value = `BÁO CÁO TĂNG CA - THÁNG ${month}`;
        title1.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
        title1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF312E81' } }; // Indigo 900
        title1.alignment = { vertical: 'middle', horizontal: 'center' };
        wsSummary.getRow(1).height = 40;

        // 2. Ngày xuất báo cáo
        wsSummary.mergeCells('A2:G2');
        const subtitle1 = wsSummary.getCell('A2');
        subtitle1.value = `Ngày xuất báo cáo: ${exportTime}`;
        subtitle1.font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FF4B5563' } };
        subtitle1.alignment = { vertical: 'middle', horizontal: 'center' };
        wsSummary.getRow(2).height = 20;

        // 3. Dòng trống
        wsSummary.getRow(3).height = 15;

        // 4. Tiêu đề bảng
        wsSummary.getCell('A4').value = "I. BẢNG TỔNG HỢP GIỜ TĂNG CA";
        wsSummary.getCell('A4').font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FF111827' } };
        wsSummary.getRow(4).height = 22;

        // 5. Headers
        const headers1 = ["STT", "Họ và tên", "Mã nhân viên", "Số ngày OT", "OT Trưa (giờ)", "OT Chiều (giờ)", "Tổng OT (giờ)"];
        wsSummary.getRow(5).values = headers1;
        wsSummary.getRow(5).height = 28;
        wsSummary.getRow(5).font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
        
        for (let col = 1; col <= 7; col++) {
            const cell = wsSummary.getCell(5, col);
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } }; // Indigo 600
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
            cell.border = {
                top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
                left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
                bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
                right: { style: 'thin', color: { argb: 'FFCCCCCC' } }
            };
        }

        // 6. Dữ liệu nhân viên
        let summaryStartRow = 6;
        users.forEach((u, i) => {
            const ur = records.filter(r => r.userId === u.id);
            const days = ur.length;
            const lh = ur.filter(r => r.hasLunchOT).length * OT_LUNCH_HOURS;
            const eh = ur.reduce((s, r) => s + r.eveningOTHours, 0);

            const rowNum = summaryStartRow + i;
            const row = wsSummary.getRow(rowNum);
            row.values = [
                i + 1,
                u.fullname,
                u.username,
                days,
                lh,
                eh,
                lh + eh
            ];
            row.height = 22;
            row.font = { name: 'Arial', size: 10 };

            for (let col = 1; col <= 7; col++) {
                const cell = row.getCell(col);
                cell.border = {
                    top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                    left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                    bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                    right: { style: 'thin', color: { argb: 'FFE5E7EB' } }
                };

                if (col === 2) {
                    cell.alignment = { vertical: 'middle', horizontal: 'left' };
                } else {
                    cell.alignment = { vertical: 'middle', horizontal: 'center' };
                }

                if (col === 1 || col === 4) {
                    cell.numFmt = '0';
                } else if (col >= 5) {
                    cell.numFmt = '#,##0.0';
                }
            }
        });

        // 7. Dòng Tổng cộng
        const totalRow1Num = summaryStartRow + users.length;
        wsSummary.mergeCells(`A${totalRow1Num}:C${totalRow1Num}`);
        wsSummary.getCell(`A${totalRow1Num}`).value = "Tổng cộng";
        
        wsSummary.getCell(`D${totalRow1Num}`).value = { formula: `SUM(D6:D${totalRow1Num - 1})` };
        wsSummary.getCell(`E${totalRow1Num}`).value = { formula: `SUM(E6:E${totalRow1Num - 1})` };
        wsSummary.getCell(`F${totalRow1Num}`).value = { formula: `SUM(F6:F${totalRow1Num - 1})` };
        wsSummary.getCell(`G${totalRow1Num}`).value = { formula: `SUM(G6:G${totalRow1Num - 1})` };

        const rowTotal1 = wsSummary.getRow(totalRow1Num);
        rowTotal1.height = 26;
        rowTotal1.font = { name: 'Arial', size: 10, bold: true };
        
        for (let col = 1; col <= 7; col++) {
            const cell = rowTotal1.getCell(col);
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E7FF' } }; // Indigo 100
            cell.border = {
                top: { style: 'thin', color: { argb: 'FF9CA3AF' } },
                left: { style: 'thin', color: { argb: 'FF9CA3AF' } },
                bottom: { style: 'double', color: { argb: 'FF9CA3AF' } },
                right: { style: 'thin', color: { argb: 'FF9CA3AF' } }
            };
            if (col >= 4) {
                cell.alignment = { vertical: 'middle', horizontal: 'center' };
                cell.numFmt = col === 4 ? '0' : '#,##0.0';
            } else if (col === 1) {
                cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
            }
        }

        // Độ rộng cột
        wsSummary.columns = [
            { width: 8 },   // STT
            { width: 28 },  // Họ và tên
            { width: 16 },  // Mã nhân viên
            { width: 14 },  // Số ngày OT
            { width: 18 },  // OT Trưa
            { width: 18 },  // OT Chiều
            { width: 18 }   // Tổng OT
        ];

        // ------------------ SHEET 2: CHI TIẾT ------------------
        const wsDetail = workbook.addWorksheet('Chi Tiết', {
            views: [{ showGridLines: true }]
        });

        // 1. Tiêu đề chính
        wsDetail.mergeCells('A1:J1');
        const title2 = wsDetail.getCell('A1');
        title2.value = `CHI TIẾT TĂNG CA - THÁNG ${month}`;
        title2.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
        title2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF312E81' } };
        title2.alignment = { vertical: 'middle', horizontal: 'center' };
        wsDetail.getRow(1).height = 40;

        // 2. Ngày xuất báo cáo
        wsDetail.mergeCells('A2:J2');
        const subtitle2 = wsDetail.getCell('A2');
        subtitle2.value = `Ngày xuất báo cáo: ${exportTime}`;
        subtitle2.font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FF4B5563' } };
        subtitle2.alignment = { vertical: 'middle', horizontal: 'center' };
        wsDetail.getRow(2).height = 20;

        // 3. Dòng trống
        wsDetail.getRow(3).height = 15;

        // 4. Tiêu đề bảng
        wsDetail.getCell('A4').value = "II. BẢNG CHI TIẾT TĂNG CA TỪNG NGÀY";
        wsDetail.getCell('A4').font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FF111827' } };
        wsDetail.getRow(4).height = 22;

        // 5. Headers
        const headers2 = ["STT", "Ngày", "Họ và tên", "Mã nhân viên", "OT Trưa", "OT Chiều", "Giờ bắt đầu", "Giờ kết thúc", "Tổng OT (giờ)", "Ghi chú"];
        wsDetail.getRow(5).values = headers2;
        wsDetail.getRow(5).height = 28;
        wsDetail.getRow(5).font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
        
        for (let col = 1; col <= 10; col++) {
            const cell = wsDetail.getCell(5, col);
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
            cell.border = {
                top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
                left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
                bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
                right: { style: 'thin', color: { argb: 'FFCCCCCC' } }
            };
        }

        // 6. Điền dữ liệu chi tiết
        let currentDetailRow = 6;
        let detailedIdx = 1;
        let isFirstUser = true;

        users.forEach(u => {
            const userRecords = records.filter(r => r.userId === u.id);
            if (userRecords.length === 0) return;
            userRecords.sort((a, b) => a.date.localeCompare(b.date));

            // Thêm dòng trống ngăn cách giữa các nhân viên
            if (!isFirstUser) {
                wsDetail.addRow([]);
                wsDetail.getRow(currentDetailRow).height = 12;
                for (let col = 1; col <= 10; col++) {
                    const cell = wsDetail.getCell(currentDetailRow, col);
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
                    cell.border = {
                        top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                        bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } }
                    };
                }
                currentDetailRow++;
            }
            isFirstUser = false;

            userRecords.forEach(r => {
                const lunchVal = r.hasLunchOT ? OT_LUNCH_HOURS : 0;
                const eveningVal = r.eveningOTHours > 0 ? r.eveningOTHours : 0;

                const row = wsDetail.getRow(currentDetailRow);
                row.values = [
                    detailedIdx++,
                    formatDate(r.date),
                    u.fullname,
                    u.username,
                    lunchVal,
                    eveningVal,
                    r.otStart || '—',
                    r.otEnd || '—',
                    r.totalHours,
                    r.note || '—'
                ];
                row.height = 22;
                row.font = { name: 'Arial', size: 10 };

                for (let col = 1; col <= 10; col++) {
                    const cell = row.getCell(col);
                    cell.border = {
                        top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                        left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                        bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                        right: { style: 'thin', color: { argb: 'FFE5E7EB' } }
                    };

                    if (col === 3 || col === 10) {
                        cell.alignment = { vertical: 'middle', horizontal: 'left' };
                    } else {
                        cell.alignment = { vertical: 'middle', horizontal: 'center' };
                    }

                    if (col === 1) {
                        cell.numFmt = '0';
                    } else if (col === 5 || col === 6 || col === 9) {
                        cell.numFmt = '#,##0.0';
                    }
                }
                currentDetailRow++;
            });
        });

        // 7. Tổng cộng chi tiết
        if (detailedIdx > 1) {
            const totalRow2Num = currentDetailRow;
            wsDetail.mergeCells(`A${totalRow2Num}:D${totalRow2Num}`);
            wsDetail.getCell(`A${totalRow2Num}`).value = "Tổng cộng";
            
            wsDetail.getCell(`E${totalRow2Num}`).value = { formula: `SUM(E6:E${totalRow2Num - 1})` };
            wsDetail.getCell(`F${totalRow2Num}`).value = { formula: `SUM(F6:F${totalRow2Num - 1})` };
            wsDetail.getCell(`I${totalRow2Num}`).value = { formula: `SUM(I6:I${totalRow2Num - 1})` };

            const rowTotal2 = wsDetail.getRow(totalRow2Num);
            rowTotal2.height = 26;
            rowTotal2.font = { name: 'Arial', size: 10, bold: true };
            
            for (let col = 1; col <= 10; col++) {
                const cell = rowTotal2.getCell(col);
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E7FF' } }; // Indigo 100
                cell.border = {
                    top: { style: 'thin', color: { argb: 'FF9CA3AF' } },
                    left: { style: 'thin', color: { argb: 'FF9CA3AF' } },
                    bottom: { style: 'double', color: { argb: 'FF9CA3AF' } },
                    right: { style: 'thin', color: { argb: 'FF9CA3AF' } }
                };
                if (col === 5 || col === 6 || col === 9) {
                    cell.alignment = { vertical: 'middle', horizontal: 'center' };
                    cell.numFmt = '#,##0.0';
                } else if (col === 1) {
                    cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
                }
            }
        } else {
            wsDetail.mergeCells(`A${currentDetailRow}:J${currentDetailRow}`);
            const emptyCell = wsDetail.getCell(`A${currentDetailRow}`);
            emptyCell.value = "Chưa có dữ liệu chi tiết tăng ca cho tháng này.";
            emptyCell.alignment = { vertical: 'middle', horizontal: 'center' };
            wsDetail.getRow(currentDetailRow).height = 30;
        }

        // Độ rộng cột sheet Chi tiết
        wsDetail.columns = [
            { width: 8 },   // STT
            { width: 14 },  // Ngày
            { width: 28 },  // Họ và tên
            { width: 16 },  // Mã nhân viên
            { width: 12 },  // OT Trưa
            { width: 12 },  // OT Chiều
            { width: 14 },  // Giờ bắt đầu
            { width: 14 },  // Giờ kết thúc
            { width: 16 },  // Tổng OT (giờ)
            { width: 35 }   // Ghi chú
        ];

        // 8. Lưu file Excel
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `bao-cao-tang-ca-chi-tiet-${month}.xlsx`;
        a.click();
        window.URL.revokeObjectURL(url);

        showToast('Đã xuất file Excel chi tiết có định dạng!');
    } catch (e) {
        showToast('Lỗi xuất Excel: ' + e.message, 'error');
        console.error(e);
    }
}

async function handleCloseMonth() {
    const month = document.getElementById('report-filter-month').value;
    if (!month) {
        showToast('Vui lòng chọn tháng cần chốt công!', 'error');
        return;
    }

    // Bước 1: Yêu cầu tải báo cáo Excel trước
    showModal(
        'Xác nhận Chốt công & Dọn dẹp',
        `<p style="font-size: 14px; line-height: 1.6; color: var(--text-primary);">
            Hệ thống yêu cầu bạn đã xuất báo cáo Excel lưu trữ về máy tính trước khi thực hiện.<br><br>
            <strong>Bạn đã tải báo cáo Excel tháng ${month} về chưa?</strong>
         </p>`,
        [
            {
                text: 'Chưa tải (Tải ngay)',
                class: 'btn-ghost',
                action: async () => {
                    await exportExcel();
                }
            },
            {
                text: 'Đã tải (Tiếp tục dọn dẹp)',
                class: 'btn-primary',
                action: () => {
                    // Bước 2: Cảnh báo xóa dữ liệu vĩnh viễn trên Server
                    showModal(
                        'CẢNH BÁO QUAN TRỌNG',
                        `<p style="font-size: 14px; line-height: 1.6; color: var(--accent-red); font-weight: 600;">
                            CẢNH BÁO: Tất cả dữ liệu tăng ca của tháng ${month} và các tháng cũ hơn sẽ bị xóa sạch khỏi Server.<br><br>
                            Hệ thống sẽ tự động tạo file sao lưu trên Server và GitHub Gist, tuy nhiên dữ liệu hiển thị hiện tại sẽ bị xóa vĩnh viễn.<br><br>
                            Thao tác này KHÔNG THỂ HOÀN TÁC! Bạn vẫn muốn tiếp tục?
                         </p>`,
                        [
                            {
                                text: 'Hủy bỏ',
                                class: 'btn-ghost',
                                action: null
                            },
                            {
                                text: 'Xác nhận xóa dữ liệu',
                                class: 'btn-danger',
                                action: async () => {
                                    try {
                                        showToast('Đang thực hiện dọn dẹp...');
                                        const res = await api('/api/records/cleanup', 'POST', { month });
                                        showToast('Dọn dẹp dữ liệu thành công!');
                                        await Promise.all([
                                            refreshAdminRecords(),
                                            refreshAdminStats(),
                                            refreshReport()
                                        ]);
                                    } catch (err) {
                                        showToast(err.message, 'error');
                                    }
                                }
                            }
                        ]
                    );
                }
            }
        ]
    );
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
        document.getElementById('ot-end').value = '16:30';
        document.getElementById('ot-note').value = '';
        updateOTPreview();
        await refreshEmployeeRecords();
        setTimeout(() => { successEl.textContent = ''; }, 3000);
    } catch (err) {
        errorEl.textContent = err.message;
    }
}

async function handleAdminOTSubmit(e) {
    e.preventDefault();
    const userId = document.getElementById('admin-ot-user').value;
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
    if (!note) { errorEl.textContent = 'Vui lòng nhập ghi chú!'; return; }

    let eveningHours = 0;
    let totalHours = 0;

    if (isBackfill) {
        const hoursVal = parseFloat(document.getElementById('admin-ot-backfill-hours').value) || 0;
        if (hoursVal <= 0) { errorEl.textContent = 'Vui lòng nhập số giờ bù hợp lệ!'; return; }
        totalHours = hoursVal;
        eveningHours = hoursVal;
        note = '[BÙ THÁNG TRƯỚC] ' + note;
    } else {
        eveningHours = calculateEveningOT(otStart, otEnd);
        const lunchHours = hasLunch ? OT_LUNCH_HOURS : 0;
        totalHours = lunchHours + eveningHours;
        if (totalHours <= 0) { errorEl.textContent = 'Vui lòng chọn ít nhất một loại OT!'; return; }
    }

    try {
        const data = await api('/api/records', 'POST', {
            userId, date, hasLunchOT: isBackfill ? false : hasLunch,
            otStart: (!isBackfill && eveningHours > 0) ? otStart : '',
            otEnd: (!isBackfill && eveningHours > 0) ? otEnd : '',
            eveningOTHours: eveningHours, totalHours, note, isBackfill
        });

        const action = data.updated ? 'Đã cập nhật' : 'Đã lưu';
        successEl.textContent = `${action} ${totalHours.toFixed(1)} giờ tăng ca thành công!`;
        showToast(`${action} ${totalHours.toFixed(1)} giờ tăng ca`);

        document.getElementById('admin-ot-user').value = '';
        if (adminOtBackfill) adminOtBackfill.checked = false;
        const normalInputs = document.getElementById('admin-ot-normal-inputs');
        const backfillGroup = document.getElementById('admin-ot-backfill-hours-group');
        if (normalInputs) normalInputs.style.display = 'block';
        if (backfillGroup) backfillGroup.style.display = 'none';
        const backfillHoursEl = document.getElementById('admin-ot-backfill-hours');
        if (backfillHoursEl) backfillHoursEl.value = '';

        document.getElementById('admin-ot-lunch').checked = false;
        document.getElementById('admin-ot-start').value = '16:30';
        document.getElementById('admin-ot-end').value = '16:30';
        document.getElementById('admin-ot-note').value = '';

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
        const res = await fetch(`${localServerUrl}/api/cloud-url`);
        const data = await res.json();
        if (data.cloudUrl) {
            API_BASE = data.cloudUrl;
            if (API_BASE.endsWith('/')) {
                API_BASE = API_BASE.slice(0, -1);
            }
            console.log("[Desktop App] API Base trỏ tới Cloud:", API_BASE);
            if (isElectron) {
                showCloudWakeupOverlay();
                await wakeupCloudServer();
            } else {
                initSseConnection();
            }
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
        // 1. Lấy thông tin Cloud URL từ local server
        const cloudConfRes = await fetch(`${localServerUrl}/api/cloud-url`);
        const cloudConf = await cloudConfRes.json();
        const cloudUrl = cloudConf.cloudUrl;

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
        const localRes = await fetch(`${localServerUrl}/api/version`);
        const localData = await localRes.json();
        const localVer = localData.version || '1.0.0';

        // 3. Lấy version mới nhất trên Cloud Server
        const cloudRes = await fetch(`${cloudUrl}/api/version`);
        const cloudData = await cloudRes.json();
        const cloudVer = cloudData.version || '1.0.0';

        const cmp = compareVersions(localVer, cloudVer);
        if (cmp < 0) {
            const checkRes = await fetch(`${localServerUrl}/download/desktop?check=true`);
            const checkData = await checkRes.json();

            if (checkData.ready) {
                showModal(
                    'Có phiên bản mới!',
                    `<p style="color: var(--text-secondary); line-height: 1.6; margin-bottom: 12px;">
                        Phát hiện phiên bản mới của ứng dụng trên hệ thống Cloud:<br>
                        • Phiên bản hiện tại: <strong style="color: var(--accent-orange);">v${localVer}</strong><br>
                        • Phiên bản mới nhất: <strong style="color: var(--accent-green-light);">v${cloudVer}</strong>
                    </p>
                    <p style="color: var(--text-muted); font-size: 13px;">
                        Bạn có muốn tải xuống phiên bản mới nhất ngay trong ứng dụng không?
                    </p>`,
                    [
                        { text: 'Để sau', class: 'btn-ghost' },
                        { 
                            text: 'Tải về ngay', 
                            class: 'btn btn-primary btn-sm', 
                            action: async () => {
                                const downloadUrl = cloudData.desktopDownloadUrl || `${cloudUrl}/download/desktop`;
                                try {
                                    await fetch(`${localServerUrl}/api/trigger-update`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ downloadUrl, version: cloudVer })
                                    });
                                } catch (e) {
                                    console.error('Lỗi khi kích hoạt cập nhật:', e);
                                    window.open(downloadUrl, '_blank');
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
        showToast('Không thể kết nối đến Cloud Server để check cập nhật', 'error');
        console.error('Lỗi check cập nhật:', err);
    }
}

async function checkUpdateSilent() {
    if (!isElectron) return;
    try {
        const cloudConfRes = await fetch(`${localServerUrl}/api/cloud-url`);
        const cloudConf = await cloudConfRes.json();
        const cloudUrl = cloudConf.cloudUrl;
        if (!cloudUrl) return;

        const localRes = await fetch(`${localServerUrl}/api/version`);
        const localData = await localRes.json();
        const localVer = localData.version || '1.0.0';

        const cloudRes = await fetch(`${cloudUrl}/api/version`);
        const cloudData = await cloudRes.json();
        const cloudVer = cloudData.version || '1.0.0';

        const cmp = compareVersions(localVer, cloudVer);
        if (cmp < 0) {
            const checkRes = await fetch(`${localServerUrl}/download/desktop?check=true`);
            const checkData = await checkRes.json();

            if (checkData.ready) {
                showModal(
                    'Có phiên bản mới!',
                    `<p style="color: var(--text-secondary); line-height: 1.6; margin-bottom: 12px;">
                        Phát hiện phiên bản mới của ứng dụng trên hệ thống Cloud:<br>
                        • Phiên bản hiện tại: <strong style="color: var(--accent-orange);">v${localVer}</strong><br>
                        • Phiên bản mới nhất: <strong style="color: var(--accent-green-light);">v${cloudVer}</strong>
                    </p>
                    <p style="color: var(--text-muted); font-size: 13px;">
                        Bạn có muốn tải xuống phiên bản mới nhất ngay trong ứng dụng không?
                    </p>`,
                    [
                        { text: 'Để sau', class: 'btn-ghost' },
                        { 
                            text: 'Tải về ngay', 
                            class: 'btn btn-primary btn-sm', 
                            action: async () => {
                                const downloadUrl = cloudData.desktopDownloadUrl || `${cloudUrl}/download/desktop`;
                                try {
                                    await fetch(`${localServerUrl}/api/trigger-update`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ downloadUrl, version: cloudVer })
                                    });
                                } catch (e) {
                                    console.error('Lỗi khi kích hoạt cập nhật:', e);
                                    window.open(downloadUrl, '_blank');
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

// ==================== EVENT LISTENERS ====================
document.addEventListener('DOMContentLoaded', async () => {
    if (!isElectron) {
        document.body.classList.add('is-web-browser');
    }
    const otDateEl = document.getElementById('ot-date');
    if (otDateEl) otDateEl.max = new Date().toISOString().split('T')[0];

    // 1. Cấu hình và đồng bộ hóa Cloud Server trước khi tải trang dashboard
    await initCloudConfig();
    
    // Hide check update button on Web (non-Electron)
    const btnCheckUpdate = document.getElementById('btn-check-update');
    if (btnCheckUpdate) {
        if (!isElectron) {
            btnCheckUpdate.style.display = 'none';
        } else {
            btnCheckUpdate.style.display = 'flex';
        }
    }

    if (isElectron) {
        // Tự động kiểm tra cập nhật ngầm khi khởi động
        checkUpdateSilent();
        // Định kỳ mỗi 30 phút kiểm tra cập nhật một lần
        setInterval(checkUpdateSilent, 30 * 60 * 1000);
    }

    // 2. Kiểm tra phiên bản và trạng thái session để quyết định tự động đăng nhập
    try {
        const versionRes = await fetch(`${localServerUrl}/api/version`);
        const versionData = await versionRes.json();
        const currentVersion = versionData.version || '1.0.0';

        const verEl = document.getElementById('login-version');
        if (verEl) {
            verEl.textContent = 'Phiên bản v' + currentVersion;
        }

        const storedVersion = localStorage.getItem('ot_app_version');
        const isSessionActive = sessionStorage.getItem('ot_session_active');

        // Nếu là phiên làm việc mới (app bị tắt hoàn toàn và bật lại)
        if (isElectron && !isSessionActive) {
            // Nếu không phải là cập nhật (phiên bản cũ và mới giống nhau)
            if (storedVersion === currentVersion) {
                // Tắt app hoàn toàn và bật lại bản cũ -> bắt đăng nhập lại
                localStorage.removeItem('ot_current_user');
                localStorage.removeItem('ot_login_date');
            } else {
                // Đây là cập nhật phiên bản -> giữ nguyên login, chỉ cập nhật version lưu trữ
                localStorage.setItem('ot_app_version', currentVersion);
            }
            // Đánh dấu session hiện tại là active
            sessionStorage.setItem('ot_session_active', 'true');
        } else if (!isElectron) {
            // Trên web, chỉ cần cập nhật version lưu trữ, không log out
            localStorage.setItem('ot_app_version', currentVersion);
        }
    } catch (e) {
        console.error('Lỗi kiểm tra phiên bản:', e);
        const verEl = document.getElementById('login-version');
        if (verEl) {
            verEl.textContent = 'Phiên bản v1.1.3';
        }
    }

    // 3. Kiểm tra qua 00h (đăng nhập ngày mới)
    checkMidnightLogout();

    // Thêm lắng nghe sự kiện focus cửa sổ để kiểm tra qua 00h
    window.addEventListener('focus', checkMidnightLogout);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            checkMidnightLogout();
        }
    });

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

    // Login tabs (Nhân viên / Quản lý)
    const tabEmployeeBtn = document.getElementById('btn-tab-employee');
    const tabAdminBtn = document.getElementById('btn-tab-admin');
    const formLoginEmployee = document.getElementById('form-login-employee');
    const formLoginAdmin = document.getElementById('form-login-admin');

    if (tabEmployeeBtn && tabAdminBtn && formLoginEmployee && formLoginAdmin) {
        tabEmployeeBtn.addEventListener('click', () => {
            tabEmployeeBtn.classList.add('active');
            tabAdminBtn.classList.remove('active');
            formLoginEmployee.classList.add('active');
            formLoginAdmin.classList.remove('active');
            formLoginEmployee.style.display = 'block';
            formLoginAdmin.style.display = 'none';
            const errorEl = document.getElementById('login-error-emp');
            if (errorEl) errorEl.textContent = '';
        });

        tabAdminBtn.addEventListener('click', () => {
            tabAdminBtn.classList.add('active');
            tabEmployeeBtn.classList.remove('active');
            formLoginAdmin.classList.add('active');
            formLoginEmployee.classList.remove('active');
            formLoginAdmin.style.display = 'block';
            formLoginEmployee.style.display = 'none';
            const errorEl = document.getElementById('login-error-admin');
            if (errorEl) errorEl.textContent = '';
        });
    }

    // Admin tabs
    document.querySelectorAll('.admin-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(`admin-tab-${tab.dataset.adminTab}`).classList.add('active');
        });
    });

    // User sub-tabs
    document.querySelectorAll('.sub-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const parent = tab.closest('.panel');
            parent.querySelectorAll('.sub-tab').forEach(t => t.classList.remove('active'));
            parent.querySelectorAll('.sub-tab-content').forEach(c => c.classList.remove('active'));
            
            tab.classList.add('active');
            const target = tab.dataset.subtab;
            parent.querySelector(`#subtab-content-${target}`).classList.add('active');
        });
    });

    // Show/hide password toggle
    const btnTogglePassword = document.getElementById('btn-toggle-password');
    const inputPassword = document.getElementById('login-password');
    if (btnTogglePassword && inputPassword) {
        btnTogglePassword.addEventListener('click', () => {
            const isPassword = inputPassword.getAttribute('type') === 'password';
            inputPassword.setAttribute('type', isPassword ? 'text' : 'password');
            btnTogglePassword.innerHTML = isPassword 
                ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                   </svg>`
                : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                   </svg>`;
        });
    }

    // Forms
    const formEmp = document.getElementById('form-login-employee');
    if (formEmp) formEmp.addEventListener('submit', handleEmployeeLogin);

    const formAdm = document.getElementById('form-login-admin');
    if (formAdm) formAdm.addEventListener('submit', handleAdminLogin);
    document.getElementById('form-ot').addEventListener('submit', handleOTSubmit);

    // Admin Add OT form
    const adminFormOt = document.getElementById('admin-form-ot');
    if (adminFormOt) {
        adminFormOt.addEventListener('submit', handleAdminOTSubmit);
        const adminOtStart = document.getElementById('admin-ot-start');
        if (adminOtStart) {
            adminOtStart.addEventListener('change', () => {
                const startVal = adminOtStart.value;
                const endVal = document.getElementById('admin-ot-end').value;
                if (startVal && endVal) {
                    const s = timeToMinutes(startVal);
                    const e = timeToMinutes(endVal);
                    if (e <= s) {
                        document.getElementById('admin-ot-end').value = startVal;
                    }
                }
            });
        }
        const adminOtBackfill = document.getElementById('admin-ot-backfill');
        if (adminOtBackfill) {
            adminOtBackfill.addEventListener('change', function() {
                const normalInputs = document.getElementById('admin-ot-normal-inputs');
                const backfillGroup = document.getElementById('admin-ot-backfill-hours-group');
                if (this.checked) {
                    if (normalInputs) normalInputs.style.display = 'none';
                    if (backfillGroup) backfillGroup.style.display = 'block';
                    const lunchEl = document.getElementById('admin-ot-lunch');
                    if (lunchEl) lunchEl.checked = false;
                    const startEl = document.getElementById('admin-ot-start');
                    if (startEl) startEl.value = '16:30';
                    const endEl = document.getElementById('admin-ot-end');
                    if (endEl) endEl.value = '16:30';
                } else {
                    if (normalInputs) normalInputs.style.display = 'block';
                    if (backfillGroup) backfillGroup.style.display = 'none';
                }
            });
        }
    }

    // Logout
    document.getElementById('btn-logout-admin').addEventListener('click', logout);
    document.getElementById('btn-logout-emp').addEventListener('click', logout);

    // Update Check
    if (btnCheckUpdate) {
        btnCheckUpdate.addEventListener('click', checkUpdateManual);
    }

    // OT Preview
    document.getElementById('ot-lunch').addEventListener('change', updateOTPreview);
    document.getElementById('ot-start').addEventListener('change', updateOTPreview);
    document.getElementById('ot-end').addEventListener('change', updateOTPreview);
    document.getElementById('ot-start').addEventListener('change', () => {
        const startVal = document.getElementById('ot-start').value;
        const endVal = document.getElementById('ot-end').value;
        if (startVal && endVal) {
            const s = timeToMinutes(startVal);
            const e = timeToMinutes(endVal);
            if (e <= s) {
                document.getElementById('ot-end').value = startVal;
                updateOTPreview();
            }
        }
    });

    // Filters
    document.getElementById('admin-filter-month').addEventListener('change', refreshAdminRecords);
    document.getElementById('admin-filter-user').addEventListener('change', refreshAdminRecords);
    document.getElementById('admin-search-user').addEventListener('input', refreshAdminRecords);
    document.getElementById('admin-search-note').addEventListener('input', refreshAdminRecords);
    document.getElementById('emp-filter-month').addEventListener('change', refreshEmployeeRecords);
    document.getElementById('report-filter-month').addEventListener('change', refreshReport);

    // Export & Cleanup
    document.getElementById('btn-export').addEventListener('click', exportExcel);
    document.getElementById('btn-close-month').addEventListener('click', handleCloseMonth);

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

        const isBackfill = record.isBackfill || (record.note && record.note.includes('[BÙ THÁNG TRƯỚC]'));
        const cleanedNote = record.note ? record.note.replace('[BÙ THÁNG TRƯỚC] ', '').replace('[BÙ THÁNG TRƯỚC]', '').trim() : '';

        const body = `
        <form id="modal-form-record" class="login-form active" style="text-align: left; padding: 0;">
            <div class="form-group" style="margin-bottom: 15px;">
                <label style="display:block;margin-bottom:6px;font-weight:600;">Ngày tăng ca</label>
                <div class="input-wrapper">
                    <input type="date" id="modal-rec-date" value="${record.date}" max="${new Date().toISOString().split('T')[0]}" style="padding-left:12px; height:38px; border-radius:8px;" required>
                </div>
            </div>
            <div class="form-group" style="display: flex; align-items: center; gap: 8px; margin-bottom: 15px;">
                <input type="checkbox" id="modal-rec-backfill" ${isBackfill ? 'checked' : ''} style="width:18px;height:18px;cursor:pointer;">
                <label for="modal-rec-backfill" style="margin-bottom: 0; cursor: pointer; user-select:none; font-weight:600;">Bù tăng ca</label>
            </div>

            <!-- Backfill hours input -->
            <div class="form-group" id="modal-rec-backfill-hours-group" style="display: ${isBackfill ? 'block' : 'none'}; margin-bottom: 15px;">
                <label style="display:block;margin-bottom:6px;font-weight:600;">Số giờ tăng ca cần bù</label>
                <input type="number" id="modal-rec-backfill-hours" step="0.1" min="0.1" max="24" value="${isBackfill ? record.totalHours : ''}" placeholder="Nhập số giờ bù (ví dụ: 8.0)" class="input-sm" style="width:100%; box-sizing:border-box; height:38px; border-radius:8px;">
            </div>

            <!-- Normal OT inputs -->
            <div id="modal-rec-normal-inputs" style="display: ${isBackfill ? 'none' : 'block'};">
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
                        <input type="time" id="modal-rec-end" value="${record.otEnd || '16:30'}" class="input-sm" style="width:100%; box-sizing:border-box;">
                    </div>
                </div>
            </div>

            <div class="form-group" style="margin-bottom: 0;">
                <label style="display:block;margin-bottom:6px;font-weight:600;">Ghi chú</label>
                <textarea id="modal-rec-note" class="input-sm" style="width:100%; height:60px; resize:none; box-sizing:border-box; padding:10px;">${cleanedNote}</textarea>
            </div>
        </form>`;

        showModal('Chỉnh sửa tăng ca', body, [
            { text: 'Hủy', class: 'btn-ghost' },
            { text: 'Lưu', class: 'btn btn-primary btn-sm', action: async () => {
                const date = document.getElementById('modal-rec-date').value;
                const recBackfill = document.getElementById('modal-rec-backfill');
                const isRecBackfill = recBackfill ? recBackfill.checked : false;
                const hasLunch = isRecBackfill ? false : (document.getElementById('modal-rec-lunch') ? document.getElementById('modal-rec-lunch').checked : false);
                const otStart = document.getElementById('modal-rec-start') ? document.getElementById('modal-rec-start').value : '';
                const otEnd = document.getElementById('modal-rec-end') ? document.getElementById('modal-rec-end').value : '';
                let note = document.getElementById('modal-rec-note').value.trim();

                if (!date) return showToast('Vui lòng chọn ngày!', 'error');
                if (!note) return showToast('Vui lòng nhập ghi chú!', 'error');

                let eveningHours = 0;
                let totalHours = 0;

                if (isRecBackfill) {
                    const hoursVal = parseFloat(document.getElementById('modal-rec-backfill-hours').value) || 0;
                    if (hoursVal <= 0) return showToast('Vui lòng nhập số giờ bù hợp lệ!', 'error');
                    totalHours = hoursVal;
                    eveningHours = hoursVal;
                    note = '[BÙ THÁNG TRƯỚC] ' + note;
                } else {
                    eveningHours = calculateEveningOT(otStart, otEnd);
                    const lunchHours = hasLunch ? OT_LUNCH_HOURS : 0;
                    totalHours = lunchHours + eveningHours;
                    if (totalHours <= 0) return showToast('Vui lòng chọn ít nhất một loại OT!', 'error');
                }

                try {
                    await api(`/api/records/${recordId}`, 'PUT', {
                        date,
                        hasLunchOT: isRecBackfill ? false : hasLunch,
                        otStart: (!isRecBackfill && eveningHours > 0) ? otStart : '',
                        otEnd: (!isRecBackfill && eveningHours > 0) ? otEnd : '',
                        eveningOTHours: eveningHours,
                        totalHours,
                        note,
                        isBackfill: isRecBackfill
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

        const modalBackfill = document.getElementById('modal-rec-backfill');
        if (modalBackfill) {
            modalBackfill.addEventListener('change', function() {
                const normalInputs = document.getElementById('modal-rec-normal-inputs');
                const backfillGroup = document.getElementById('modal-rec-backfill-hours-group');
                if (this.checked) {
                    if (normalInputs) normalInputs.style.display = 'none';
                    if (backfillGroup) backfillGroup.style.display = 'block';
                    const lunchEl = document.getElementById('modal-rec-lunch');
                    if (lunchEl) lunchEl.checked = false;
                    const startEl = document.getElementById('modal-rec-start');
                    if (startEl) startEl.value = '16:30';
                    const endEl = document.getElementById('modal-rec-end');
                    if (endEl) endEl.value = '16:30';
                } else {
                    if (normalInputs) normalInputs.style.display = 'block';
                    if (backfillGroup) backfillGroup.style.display = 'none';
                }
            });
        }

        const modalStart = document.getElementById('modal-rec-start');
        const modalEnd = document.getElementById('modal-rec-end');
        if (modalStart && modalEnd) {
            modalStart.addEventListener('change', () => {
                const s = timeToMinutes(modalStart.value);
                const e = timeToMinutes(modalEnd.value);
                if (e <= s) {
                    modalEnd.value = modalStart.value;
                }
            });
        }
    } catch (e) {
        showToast('Lỗi tải dữ liệu bản ghi', 'error');
    }
}

async function addUserDialog() {
    let admins = [];
    try {
        const uData = await api('/api/users');
        admins = uData.users.filter(u => u.role === 'admin');
    } catch (e) {
        console.error('Lỗi lấy danh sách admin:', e);
    }
    const currentUser = JSON.parse(localStorage.getItem('ot_current_user') || 'null');

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
        <div class="form-group" style="margin-bottom: 15px;">
            <label style="display:block;margin-bottom:6px;font-weight:600;">Vai trò</label>
            <select id="modal-user-role" class="input-sm" style="width:100%; box-sizing:border-box;">
                <option value="employee">Nhân viên (Điện thoại)</option>
                <option value="admin">Quản lý (Desktop)</option>
            </select>
        </div>
        <div class="form-group" id="modal-user-manager-group" style="margin-bottom: 0;">
            <label style="display:block;margin-bottom:6px;font-weight:600;">Quản lý trực tiếp (Team)</label>
            <select id="modal-user-manager" class="input-sm" style="width:100%; box-sizing:border-box;">
                <option value="">-- Chưa phân team --</option>
                ${admins.map(adm => `<option value="${adm.id}" ${currentUser && currentUser.id === adm.id ? 'selected' : ''}>${adm.fullname} (${adm.username})</option>`).join('')}
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
            const managerId = document.getElementById('modal-user-manager') ? document.getElementById('modal-user-manager').value : '';

            if (!fullname || !username) return showToast('Vui lòng điền họ tên và tên đăng nhập!', 'error');
            if (username.length < 3) return showToast('Tên đăng nhập tối thiểu 3 ký tự!', 'error');
            
            if (role === 'admin') {
                if (!password) return showToast('Tài khoản quản lý bắt buộc phải nhập mật khẩu!', 'error');
                if (password.length < 4) return showToast('Mật khẩu tối thiểu 4 ký tự!', 'error');
            }

            try {
                await api('/api/auth/register', 'POST', { fullname, username, password: password || '123', role, managerId });
                showToast('Thêm nhân viên thành công!');
                await Promise.all([populateUserFilter(), refreshAdminUsers(), refreshAdminStats(), refreshReport()]);
            } catch (err) {
                showToast(err.message, 'error');
            }
        }}
    ]);

    const roleSelect = document.getElementById('modal-user-role');
    const managerGroup = document.getElementById('modal-user-manager-group');
    if (roleSelect && managerGroup) {
        roleSelect.addEventListener('change', () => {
            if (roleSelect.value === 'admin') {
                managerGroup.style.display = 'none';
            } else {
                managerGroup.style.display = 'block';
            }
        });
    }
}

async function editUserDialog(userId) {
    try {
        const data = await api('/api/users');
        const user = data.users.find(u => u.id === userId);
        if (!user) return showToast('Không tìm thấy nhân viên', 'error');

        const admins = data.users.filter(u => u.role === 'admin');

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
            <div class="form-group" style="margin-bottom: 15px;">
                <label style="display:block;margin-bottom:6px;font-weight:600;">Vai trò</label>
                <select id="modal-user-role" class="input-sm" style="width:100%; box-sizing:border-box;">
                    <option value="employee" ${user.role === 'employee' ? 'selected' : ''}>Nhân viên (Điện thoại)</option>
                    <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Quản lý (Desktop)</option>
                </select>
            </div>
            <div class="form-group" id="modal-edit-user-manager-group" style="margin-bottom: 0; display: ${user.role === 'admin' ? 'none' : 'block'};">
                <label style="display:block;margin-bottom:6px;font-weight:600;">Quản lý trực tiếp (Team)</label>
                <select id="modal-user-manager" class="input-sm" style="width:100%; box-sizing:border-box;">
                    <option value="">-- Chưa phân team --</option>
                    ${admins.map(adm => `<option value="${adm.id}" ${user.managerId === adm.id ? 'selected' : ''}>${adm.fullname} (${adm.username})</option>`).join('')}
                </select>
            </div>
        </form>`;

        showModal('Sửa thông tin nhân viên', body, [
            { text: 'Hủy', class: 'btn-ghost' },
            { text: 'Lưu', class: 'btn btn-primary btn-sm', action: async () => {
                const fullname = document.getElementById('modal-user-fullname').value.trim();
                const password = document.getElementById('modal-user-password').value;
                const role = document.getElementById('modal-user-role').value;
                const managerId = document.getElementById('modal-user-manager') ? document.getElementById('modal-user-manager').value : '';

                if (!fullname) return showToast('Vui lòng điền họ tên!', 'error');

                const payload = { fullname, role };
                if (role !== 'admin') {
                    payload.managerId = managerId;
                }
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

        const roleSelect = document.getElementById('modal-user-role');
        const managerGroup = document.getElementById('modal-edit-user-manager-group');
        if (roleSelect && managerGroup) {
            roleSelect.addEventListener('change', () => {
                if (roleSelect.value === 'admin') {
                    managerGroup.style.display = 'none';
                } else {
                    managerGroup.style.display = 'block';
                }
            });
        }
    } catch (e) {
        showToast('Lỗi tải dữ liệu người dùng', 'error');
    }
}

async function resetUserDevice(userId, fullname, type = 'mobile') {
    const label = type === 'mobile' ? 'App điện thoại' : 'Trình duyệt web';
    const payload = type === 'mobile' ? { deviceId: null } : { browserDeviceId: null };
    showModal('Xóa liên kết thiết bị', `Bạn có chắc muốn xóa liên kết <strong>${label}</strong> của nhân viên <strong>${fullname}</strong>?<br>Sau khi xóa, nhân viên này có thể đăng nhập trên thiết bị/trình duyệt mới.`, [
        { text: 'Hủy', class: 'btn-ghost' },
        { text: 'Xóa liên kết', class: 'btn btn-danger btn-sm', action: async () => {
            try {
                await api(`/api/users/${userId}`, 'PUT', payload);
                await refreshAdminUsers();
                showToast(`Đã xóa liên kết ${label}!`);
            } catch (e) {
                showToast(e.message, 'error');
            }
        }}
    ]);
}

async function approveUnlinkDevice(userId, fullname) {
    showModal('Duyệt huỷ liên kết thiết bị', `Bạn có chắc muốn phê duyệt yêu cầu huỷ liên kết thiết bị của nhân viên <strong>${fullname}</strong>?<br>Thao tác này sẽ reset liên kết cả App điện thoại và Trình duyệt, nhân viên sẽ tự động đăng xuất.`, [
        { text: 'Hủy', class: 'btn-ghost' },
        { text: 'Duyệt', class: 'btn btn-primary btn-sm', action: async () => {
            try {
                await api(`/api/users/${userId}`, 'PUT', { deviceId: null, browserDeviceId: null, pendingUnlink: false });
                await refreshAdminUsers();
                showToast('Đã duyệt yêu cầu huỷ liên kết thiết bị!');
            } catch (e) {
                showToast(e.message, 'error');
            }
        }}
    ]);
}
