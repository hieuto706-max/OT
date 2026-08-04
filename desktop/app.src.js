(function() {
/**
 * OT Manager - Desktop App (Admin)
 * Giờ làm chính: 7:00 - 16:30
 * Nghỉ trưa: 11:50 - 13:20
 * OT trưa: 12:20 - 13:20 (1 tiếng)
 *
 * Sử dụng Server API để đồng bộ dữ liệu với mobile
 */

// Safe localStorage wrapper to support sessionStorage fallback seamlessly
const localStorage = {
    getItem(key) {
        try {
            return window.localStorage.getItem(key) || window.sessionStorage.getItem(key);
        } catch (e) {
            return this._data[key] || null;
        }
    },
    setItem(key, val) {
        try {
            window.localStorage.setItem(key, val);
            window.sessionStorage.setItem(key, val);
        } catch (e) {
            this._data[key] = val;
        }
    },
    removeItem(key) {
        try {
            window.localStorage.removeItem(key);
            window.sessionStorage.removeItem(key);
        } catch (e) {
            delete this._data[key];
        }
    },
    _data: {}
};

// Prevent developer tools and right click
document.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('keydown', e => {
    if (
        e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J' || e.key === 'C' || e.key === 'K')) ||
        (e.ctrlKey && e.key === 'u')
    ) {
        e.preventDefault();
    }
});

const isElectron = navigator.userAgent.toLowerCase().includes('electron');
const isGitHubPages = window.location.hostname.includes('github.io') || window.location.hostname.includes('otmanager.id.vn');
let savedServerIp = localStorage.getItem('ot_server_ip') || 'https://api.otmanager.id.vn';
if (isGitHubPages && (
    savedServerIp.includes('otms.onrender.com') ||
    savedServerIp.includes('ot-manager-server.onrender.com') ||
    savedServerIp.includes('ot-manager-server-jbxd.onrender.com') ||
    savedServerIp.includes('github.io') ||
    savedServerIp.includes('otmanager.id.vn')
)) {
    localStorage.removeItem('ot_server_ip');
    savedServerIp = 'https://api.otmanager.id.vn';
}
const localServerUrl = isGitHubPages ? savedServerIp : window.location.origin;
let API_BASE = localServerUrl;
let OT_LUNCH_HOURS = 1;
let WORK_END = '16:30';
let TEAMS = [];
const PROVINCES = [
    "An Giang", "Bà Rịa – Vũng Tàu", "Bạc Liêu", "Bắc Giang", "Bắc Kạn", "Bắc Ninh", "Bến Tre", "Bình Dương", "Bình Định", "Bình Phước", "Bình Thuận", "Cà Mau", "Cần Thơ", "Cao Bằng", "Đà Nẵng", "Đắk Lắk", "Đắk Nông", "Điện Biên", "Đồng Nai", "Đồng Tháp", "Gia Lai", "Hà Giang", "Hà Nam", "Hà Nội", "Hà Tĩnh", "Hải Dương", "Hải Phòng", "Hậu Giang", "Hòa Bình", "Hưng Yên", "Khánh Hòa", "Kiên Giang", "Kon Tum", "Lai Châu", "Lạng Sơn", "Lào Cai", "Lâm Đồng", "Long An", "Nam Định", "Nghệ An", "Ninh Bình", "Ninh Thuận", "Phú Thọ", "Phú Yên", "Quảng Bình", "Quảng Nam", "Quảng Ngãi", "Quảng Ninh", "Quảng Trị", "Sóc Trăng", "Sơn La", "Tây Ninh", "Thái Bình", "Thái Nguyên", "Thanh Hóa", "Thừa Thiên Huế", "Tiền Giang", "TP. Hồ Chí Minh", "Trà Vinh", "Tuyên Quang", "Vĩnh Long", "Vĩnh Phúc", "Yên Bái"
];

let currentAdminRecType = 'ot';
let currentEmpRecType = 'ot';
let loadedUsers = [];
let loadedRecords = [];
let employeeOTRecords = [];

// Report Redesign global state variables
let reportSearchQuery = '';
let reportSortColumn = 'total'; // 'name', 'days', 'total'
let reportSortOrder = 'desc'; // 'asc', 'desc'

async function loadTeams(cachedTeams) {
    if (cachedTeams) {
        TEAMS = cachedTeams;
    } else {
        try {
            const res = await api('/api/teams');
            TEAMS = res.teams || [];
        } catch (e) {
            console.error('Lỗi load teams:', e);
            TEAMS = ['Team 1', 'Team 2', 'Team 3', 'Team 4', 'Team 5', 'Team 6', 'Team 7', 'Team 8', 'Team 9', 'Team 10'];
        }
    }
    populateTeamFilters();
}

function populateTeamFilters() {
    const adminFilter = document.getElementById('admin-filter-team');
    const reportFilter = document.getElementById('report-filter-team');
    
    const currentUser = JSON.parse(localStorage.getItem('ot_current_user') || 'null');
    const isSuperAdmin = currentUser && (currentUser.isSuperAdmin || currentUser.username === 'admin');
    
    const optionsHtml = `
        <option value="">Tất cả Team</option>
        ${isSuperAdmin ? '<option value="admin">admin</option>' : ''}
        <option value="unassigned">Chưa phân team</option>
        ${TEAMS.map(t => {
            const name = typeof t === 'string' ? t : (t.name || '');
            return `<option value="${name}">${name}</option>`;
        }).join('')}
    `;
    
    if (adminFilter) {
        const val = adminFilter.value;
        adminFilter.innerHTML = optionsHtml;
        if (val && [...adminFilter.options].some(opt => opt.value === val)) {
            adminFilter.value = val;
        }
    }
    if (reportFilter) {
        const val = reportFilter.value;
        reportFilter.innerHTML = optionsHtml;
        if (val && [...reportFilter.options].some(opt => opt.value === val)) {
            reportFilter.value = val;
        }
    }
}

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
const apiCache = new Map();

async function api(endpoint, method = 'GET', body = null) {
    const isGet = method.toUpperCase() === 'GET';
    const cacheKey = endpoint;

    // Clear cache immediately on write operations
    if (!isGet) {
        apiCache.clear();
    }

    if (isGet && apiCache.has(cacheKey)) {
        return apiCache.get(cacheKey);
    }

    const promise = (async () => {
        const opts = {
            method,
            headers: { 'Content-Type': 'application/json' },
        };
        // Gửi JWT Token nếu có
        const token = localStorage.getItem('ot_auth_token');
        if (token) {
            opts.headers['Authorization'] = `Bearer ${token}`;
        }
        const currentUser = JSON.parse(localStorage.getItem('ot_current_user') || 'null');
        if (currentUser && currentUser.id) {
            opts.headers['x-user-id'] = currentUser.id;
        }
        if (body) opts.body = JSON.stringify(body);
        const res = await fetch(`${API_BASE}${endpoint}`, opts);
        const data = await res.json();
        if (!res.ok) {
            if ((res.status === 401 || res.status === 403) && 
                !endpoint.includes('/api/auth/login') && 
                !endpoint.includes('/api/auth/verify-email-otp') && 
                !endpoint.includes('/api/auth/forgot-password')) {
                localStorage.removeItem('ot_auth_token');
                localStorage.removeItem('ot_current_user');
                window.location.reload();
            }
            throw new Error(data.error || 'Lỗi kết nối server');
        }
        return data;
    })();

    if (isGet) {
        apiCache.set(cacheKey, promise);
        // Tự động xoá cache sau 1 giây để đảm bảo dữ liệu mới nhất được nạp ở các lần tải sau
        setTimeout(() => {
            if (apiCache.get(cacheKey) === promise) {
                apiCache.delete(cacheKey);
            }
        }, 1000);
    }

    return promise;
}

// ==================== HELPERS ====================
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

function formatDate(dateStr) {
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
}

function getOTCoefficient(dateStr, holidaysList = []) {
    if (holidaysList && holidaysList.includes(dateStr)) {
        return 3.0;
    }
    const date = new Date(dateStr + 'T00:00:00');
    if (date.getDay() === 0) {
        return 2.0;
    }
    return 1.5;
}

function getStandardWorkingDays(monthStr) {
    if (!monthStr || !/^\d{4}-\d{2}$/.test(monthStr)) {
        return 26;
    }
    const parts = monthStr.split('-');
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const daysInMonth = new Date(year, month, 0).getDate();
    let workingDays = 0;
    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month - 1, day);
        const dayOfWeek = date.getDay();
        if (dayOfWeek !== 0) { // Exclude Sunday
            workingDays++;
        }
    }
    return workingDays;
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

let cachedPrivateModeResult = null;
async function isPrivateMode() {
    if (cachedPrivateModeResult !== null) return cachedPrivateModeResult;
    cachedPrivateModeResult = await checkPrivateModeInternal();
    return cachedPrivateModeResult;
}

async function checkPrivateModeInternal() {
    return new Promise((resolve) => {
        // Native mobile apps running under file:// protocol must bypass this check
        if (window.location.protocol === 'file:') {
            resolve(false);
            return;
        }

        // Only run incognito checks in secure contexts (HTTPS or localhost)
        const isSecureContext = window.location.protocol === 'https:' || 
                               window.location.hostname === 'localhost' || 
                               window.location.hostname === '127.0.0.1';
        if (!isSecureContext) {
            resolve(false);
            return;
        }

        try {
            const testKey = "__private_test__";
            localStorage.setItem(testKey, "1");
            localStorage.removeItem(testKey);
        } catch (e) {
            resolve(true);
            return;
        }

        // Engine-level detection for Safari
        const ua = navigator.userAgent.toLowerCase();
        let toFixedEngineID = 0;
        let neg = parseInt("-1");
        try {
            neg.toFixed(neg);
        } catch (e) {
            toFixedEngineID = e.message ? e.message.length : 0;
        }
        const isSafari = (ua.includes('safari') && !ua.includes('chrome') && !ua.includes('android')) || 
                         (toFixedEngineID === 44 || toFixedEngineID === 43);

        if (isSafari) {
            safariPrivateTest();
        } else {
            fallbackQuota();
        }

        async function safariPrivateTest() {
            if (navigator.storage && typeof navigator.storage.getDirectory === 'function') {
                try {
                    await navigator.storage.getDirectory();
                    resolve(false);
                } catch (e) {
                    const message = (e instanceof Error && typeof e.message === 'string') ? e.message : String(e);
                    if (message.includes('unknown transient reason')) {
                        resolve(true);
                    } else {
                        resolve(false);
                    }
                }
            } else if (navigator.maxTouchPoints !== undefined) {
                // Safari 13-18 IndexedDB Blob test
                const tmp = String(Math.random());
                try {
                    const dbReq = indexedDB.open(tmp, 1);
                    dbReq.onupgradeneeded = (ev) => {
                        const db = ev.target.result;
                        try {
                            db.createObjectStore('t', { autoIncrement: true }).put(new Blob());
                            resolve(false);
                        } catch (err) {
                            const message = (err instanceof Error && typeof err.message === 'string') ? err.message : String(err);
                            if (message.includes('are not yet supported')) {
                                resolve(true);
                            } else {
                                resolve(false);
                            }
                        } finally {
                            db.close();
                            indexedDB.deleteDatabase(tmp);
                        }
                    };
                    dbReq.onerror = () => resolve(false);
                } catch (err) {
                    resolve(false);
                }
            } else {
                if (window.openDatabase) {
                    try {
                        window.openDatabase(null, null, null, null);
                        resolve(false);
                    } catch (e) {
                        resolve(true);
                    }
                } else {
                    resolve(false);
                }
            }
        }

        function fallbackQuota() {
            const isMobile = /android|iphone|ipad|ipod/i.test(ua);
            if (isMobile) {
                resolve(false);
            } else if (navigator.storage && navigator.storage.estimate) {
                navigator.storage.estimate().then((est) => {
                    resolve(est.quota < 120000000);
                }).catch(() => resolve(false));
            } else {
                resolve(false);
            }
        }
    });
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (container) {
        container.innerHTML = '';
    }
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
    if (endMin <= startMin) return 0;
    return Math.round(((endMin - startMin) / 60) * 100) / 100;
}

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
            localStorage.setItem('ot_current_user', JSON.stringify(finalUser));
            if (data.token) localStorage.setItem('ot_auth_token', data.token);
            const todayStr = new Date().toISOString().split('T')[0];
            localStorage.setItem('ot_login_date', todayStr);
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
            localStorage.setItem('ot_current_user', JSON.stringify(finalUser));
            if (data.token) localStorage.setItem('ot_auth_token', data.token);
            const todayStr = new Date().toISOString().split('T')[0];
            localStorage.setItem('ot_login_date', todayStr);
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
    const todayStr = new Date().toISOString().split('T')[0];
    if (loginDate && loginDate !== todayStr) {
        logout();
        showToast('Đã qua ngày mới, vui lòng đăng nhập lại.', 'info');
    }
}

function logout() {
    localStorage.removeItem('ot_current_user');
    localStorage.removeItem('ot_login_date');
    localStorage.removeItem('ot_mobile_user');
    localStorage.removeItem('ot_login_time');
    localStorage.removeItem('ot_auth_token');
    
    sessionStorage.removeItem('ot_current_user');
    sessionStorage.removeItem('ot_login_date');
    sessionStorage.removeItem('ot_mobile_user');
    sessionStorage.removeItem('ot_login_time');
    sessionStorage.removeItem('ot_auth_token');
    sessionStorage.removeItem('ot_session_temp');
    
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
        if (isDefaultFilter && cachedRecords && cachedUsers) {
            records = [...cachedRecords];
            users = cachedUsers;
            // Sắp xếp các bản ghi mới nhất lên đầu
            records.sort((a, b) => b.date.localeCompare(a.date));
        } else {
            let url = '/api/records?';
            if (month) url += `month=${month}&`;
            if (userId) url += `userId=${userId}&`;

            const data = await api(url);
            records = data.records;
            const usersData = await api('/api/users');
            users = usersData.users;
        }
        loadedRecords = records;
        loadedUsers = users;
        const currentUser = JSON.parse(localStorage.getItem('ot_current_user') || 'null');
        const isAdmin = currentUser && (currentUser.username === 'admin' || currentUser.isSuperAdmin);

        let hasCustomActivities = false;
        let adminBtnText = '2. Hoạt động khác';
        if (isAdmin) {
            if (filterTeam && filterTeam !== 'unassigned' && typeof TEAMS !== 'undefined') {
                const teamObj = TEAMS.find(t => typeof t === 'object' && t.name === filterTeam);
                hasCustomActivities = !!(teamObj && teamObj.customActivities && teamObj.customActivities.length > 0);
                if (hasCustomActivities) {
                    adminBtnText = '2. ' + teamObj.customActivities.map(a => a.name).join(' / ');
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
                        adminBtnText = '2. ' + allActs.join(' / ');
                    } else {
                        adminBtnText = '2. Hoạt động khác';
                    }
                }
            }
        } else {
            const managerTeam = currentUser ? (currentUser.team || '') : '';
            if (managerTeam && typeof TEAMS !== 'undefined') {
                const teamObj = TEAMS.find(t => typeof t === 'object' && t.name === managerTeam);
                hasCustomActivities = !!(teamObj && teamObj.customActivities && teamObj.customActivities.length > 0);
                if (hasCustomActivities) {
                    adminBtnText = '2. ' + teamObj.customActivities.map(a => a.name).join(' / ');
                }
            }
        }

        const adminRecTypeSelector = document.getElementById('admin-rec-type-selector');
        const btnAdminRecTypeTrips = document.getElementById('btn-admin-rec-type-trips');
        if (hasCustomActivities) {
            if (adminRecTypeSelector) adminRecTypeSelector.style.display = 'flex';
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
            const matchesUser = !searchUser || (user && (
                user.fullname.toLowerCase().includes(searchUser) ||
                user.username.toLowerCase().includes(searchUser)
            ));
            const matchesNote = !searchNote || (r.note && r.note.toLowerCase().includes(searchNote));
            
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
                const employeeCell = `
                    <div class="user-profile-cell">
                        <div class="avatar-mini">${user ? user.fullname.charAt(0).toUpperCase() : 'N'}</div>
                        <div class="user-details">
                            <span class="user-fullname">${user ? user.fullname : 'N/A'}</span>
                            <span class="user-username">@${user ? user.username : 'N/A'}</span>
                        </div>
                    </div>
                `;
                const teamBadge = `<span class="tag-team">${teamName}</span>`;
                const noteDisplay = r.note ? `<span class="text-note" title="${r.note}">${r.note}</span>` : '<span class="text-muted">—</span>';

                if (currentAdminRecType === 'ot') {
                    const timeRange = (r.otStart || r.otEnd) ? `<span class="text-time">${r.otStart || '—'}</span> <span class="text-arrow">→</span> <span class="text-time">${r.otEnd || '—'}</span>` : '<span class="text-muted">—</span>';
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
                        ? `<span class="tag" style="background: rgba(245,158,11,0.15); color: #f59e0b; border: 1px solid rgba(245,158,11,0.3); font-weight: 500;">🚚 ${r.deliveryProvince || 'Chưa rõ'}</span>` 
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
                        <td><strong>${r.customActivity}</strong></td>
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
                const employeeCell = `
                    <div class="user-profile-cell">
                        <div class="avatar-mini">${user ? user.fullname.charAt(0).toUpperCase() : 'N'}</div>
                        <div class="user-details">
                            <span class="user-fullname">${user ? user.fullname : 'N/A'}</span>
                            <span class="user-username">@${user ? user.username : 'N/A'}</span>
                        </div>
                    </div>
                `;
                const teamBadge = `<span class="tag-team">${teamName}</span>`;
                const noteDisplay = r.note ? `<span class="text-note" title="${r.note}">${r.note}</span>` : '<span class="text-muted">—</span>';

                if (currentAdminRecType === 'ot') {
                    const timeRange = (r.otStart || r.otEnd) ? `<span class="text-time">${r.otStart || '—'}</span> <span class="text-arrow">→</span> <span class="text-time">${r.otEnd || '—'}</span>` : '<span class="text-muted">—</span>';
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
                        ? `<span class="tag" style="background: rgba(245,158,11,0.15); color: #f59e0b; border: 1px solid rgba(245,158,11,0.3); font-weight: 500;">🚚 ${r.deliveryProvince || 'Chưa rõ'}</span>` 
                        : `<span class="tag" style="background: rgba(99,102,241,0.15); color: #6366f1; border: 1px solid rgba(99,102,241,0.3); font-weight: 500;">⏱️ ${r.totalHours.toFixed(1)}h</span>`;
                    return `<tr>
                        <td style="text-align: center;"><input type="checkbox" class="chk-pending-record" value="${r.id}" style="width: 14px; height: 14px; margin: 0; cursor: pointer;" onchange="updatePendingBulkActionsVisibility()"></td>
                        <td>${employeeCell}</td>
                        <td>${teamBadge}</td>
                        <td><span class="text-date">${formatDate(r.date)}</span></td>
                        <td><strong>${r.customActivity}</strong></td>
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
                const employeeCell = `
                    <div class="user-profile-cell">
                        <div class="avatar-mini">${user ? user.fullname.charAt(0).toUpperCase() : 'N'}</div>
                        <div class="user-details">
                            <span class="user-fullname">${user ? user.fullname : 'N/A'}</span>
                            <span class="user-username">@${user ? user.username : 'N/A'}</span>
                        </div>
                    </div>
                `;
                const teamBadge = `<span class="tag-team">${teamName}</span>`;
                const noteDisplay = r.note ? `<span class="text-note" title="${r.note}">${r.note}</span>` : '<span class="text-muted">—</span>';
 
                if (currentAdminRecType === 'ot') {
                    const timeRange = (r.otStart || r.otEnd) ? `<span class="text-time">${r.otStart || '—'}</span> <span class="text-arrow">→</span> <span class="text-time">${r.otEnd || '—'}</span>` : '<span class="text-muted">—</span>';
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
                        ? `<span class="tag" style="background: rgba(245,158,11,0.15); color: #f59e0b; border: 1px solid rgba(245,158,11,0.3); font-weight: 500;">🚚 ${r.deliveryProvince || 'Chưa rõ'}</span>` 
                        : `<span class="tag" style="background: rgba(99,102,241,0.15); color: #6366f1; border: 1px solid rgba(99,102,241,0.3); font-weight: 500;">⏱️ ${r.totalHours.toFixed(1)}h</span>`;
                    return `<tr>
                        <td style="text-align: center;"><input type="checkbox" class="chk-rejected-record" value="${r.id}" style="width: 14px; height: 14px; margin: 0; cursor: pointer;" onchange="updateRejectedBulkActionsVisibility()"></td>
                        <td>${employeeCell}</td>
                        <td>${teamBadge}</td>
                        <td><span class="text-date">${formatDate(r.date)}</span></td>
                        <td><strong>${r.customActivity}</strong></td>
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

async function refreshAdminUsers(cachedUsers, cachedRecords) {
    try {
        const currentUser = JSON.parse(localStorage.getItem('ot_current_user') || 'null');
        const isSuperAdmin = currentUser && (currentUser.username === 'admin' || currentUser.isSuperAdmin);
        const isBelongToAdminTeam = currentUser && (currentUser.team === 'admin' || currentUser.username === 'admin' || currentUser.isSuperAdmin);

        let users;
        let records;

        if (cachedUsers && cachedRecords) {
            users = cachedUsers;
            records = cachedRecords;
        } else {
            const usersData = await api('/api/users');
            users = usersData.users;
            const currentMonth = getCurrentMonth();
            const recData = await api(`/api/records?month=${currentMonth}`);
            records = recData.records;
        }

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
            if (u.deviceId || u.browserDeviceId) {
                deviceUnlinkBtn = `
                    <button class="btn-reset btn-reset-mobile" onclick="showUnlinkOptions('${u.id}', '${u.fullname}', ${!!u.deviceId}, ${!!u.browserDeviceId})" title="Hủy liên kết thiết bị" style="margin-right: 4px;">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                            <path d="M18.36 6.64a9 9 0 1 1-12.73 0"/>
                            <line x1="12" y1="2" x2="12" y2="12"/>
                        </svg>
                        Hủy liên kết
                    </button>
                `;
            }
            let browserUnlinkBtn = '';
            let approveBtn = '';
            if (u.pendingUnlink) {
                approveBtn = `
                    <button class="btn-reset btn-reset-approve" onclick="approveUnlinkDevice('${u.id}', '${u.fullname}')" title="Duyệt yêu cầu huỷ liên kết" style="margin-right: 4px;">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                            <polyline points="20 6 9 17 4 12"/>
                        </svg>
                        Duyệt Huỷ
                    </button>
                    <button class="btn-reset btn-reset-reject" onclick="rejectUnlinkDevice('${u.id}', '${u.fullname}')" title="Từ chối yêu cầu huỷ liên kết" style="margin-right: 4px;">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                            <line x1="18" y1="6" x2="6" y2="18"/>
                            <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                        Từ Chối
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
                <td><span style="font-weight:600; color:var(--text-secondary);">${u.team || 'Chưa phân team'}</span></td>
                <td><span class="tag tag-employee">Nhân viên</span></td>
                <td><span class="text-purple text-bold">${totalOT.toFixed(1)}h</span></td>
                <td><div class="action-buttons">
                    ${approveBtn}
                    ${deviceUnlinkBtn}
                    ${browserUnlinkBtn}
                    ${(!u.team || u.team !== 'admin' || isBelongToAdminTeam || (currentUser && currentUser.id === u.id)) ? `
                    <button class="btn-icon-only edit" onclick="editUserDialog('${u.id}')" title="Sửa" style="margin-right: 4px;">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                    </button>
                    ` : ''}
                    ${(!u.team || u.team !== 'admin' || isBelongToAdminTeam) ? `
                    <button class="btn-icon-only delete" onclick="deleteUser('${u.id}')" title="Xóa">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                            <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                    </button>
                    ` : ''}
                </div></td>
            </tr>`;
        }).join('') || `<tr class="empty-row">
            <td colspan="7" style="padding: 80px 16px; text-align: center; background: rgba(255,255,255,0.01); border: 1px dashed rgba(255,255,255,0.06); border-radius: 8px;">
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="48" height="48" style="color: var(--text-muted); opacity: 0.6;">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                        <circle cx="9" cy="7" r="4"/>
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                        <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                    </svg>
                    <span style="font-size: 15px; font-weight: 600; color: var(--text-secondary);">Không có nhân viên</span>
                    <span style="font-size: 13px; color: var(--text-muted);">Hiện tại chưa có nhân viên nào trong danh sách.</span>
                </div>
            </td>
        </tr>`;

        // Render managers (admins)
        const tbodyMgr = document.getElementById('admin-managers-body');
        tbodyMgr.innerHTML = managers.map((u, i) => {
            return `<tr>
                <td>${i + 1}</td>
                <td><strong>${u.fullname}</strong></td>
                <td>${u.username}</td>
                <td><span style="font-weight:600; color:var(--text-secondary);">${u.team === 'admin' ? 'admin' : (u.team || 'admin')}</span></td>
                <td><span class="tag tag-admin">Quản lý</span></td>
                <td><div class="action-buttons">
                    ${(isSuperAdmin && (currentUser && currentUser.id !== u.id)) ? `
                    <button class="btn-icon-only edit" onclick="editUserDialog('${u.id}')" title="Sửa" style="margin-right: 4px;">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                    </button>
                    ` : ''}
                    ${(isSuperAdmin && !u.isSuperAdmin && u.username !== 'admin') ? `
                        <button class="btn-icon-only delete" onclick="deleteUser('${u.id}')" title="Xóa">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                                <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                            </svg>
                        </button>
                    ` : ''}
                </div></td>
            </tr>`;
        }).join('') || `<tr class="empty-row">
            <td colspan="6" style="padding: 80px 16px; text-align: center; background: rgba(255,255,255,0.01); border: 1px dashed rgba(255,255,255,0.06); border-radius: 8px;">
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="48" height="48" style="color: var(--text-muted); opacity: 0.6;">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                        <circle cx="12" cy="7" r="4"/>
                    </svg>
                    <span style="font-size: 15px; font-weight: 600; color: var(--text-secondary);">Không có quản lý</span>
                    <span style="font-size: 13px; color: var(--text-muted);">Không tìm thấy tài khoản quản lý nào.</span>
                </div>
            </td>
        </tr>`;

        // Render unassigned employees
        const tbodyUnassigned = document.getElementById('admin-users-unassigned-body');
        const unassigned = employees.filter(u => !u.team || u.team === 'unassigned');
        if (tbodyUnassigned) {
            tbodyUnassigned.innerHTML = unassigned.map((u, i) => {
                const userRecords = records.filter(r => r.userId === u.id);
                const totalOT = userRecords.reduce((sum, r) => sum + r.totalHours, 0);

                let deviceUnlinkBtn = '';
                if (u.deviceId || u.browserDeviceId) {
                    deviceUnlinkBtn = `
                        <button class="btn-reset btn-reset-mobile" onclick="showUnlinkOptions('${u.id}', '${u.fullname}', ${!!u.deviceId}, ${!!u.browserDeviceId})" title="Hủy liên kết thiết bị" style="margin-right: 4px;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                                <path d="M18.36 6.64a9 9 0 1 1-12.73 0"/>
                                <line x1="12" y1="2" x2="12" y2="12"/>
                            </svg>
                            Hủy liên kết
                        </button>
                    `;
                }
                let browserUnlinkBtn = '';
                let approveBtn = '';
                if (u.pendingUnlink) {
                    approveBtn = `
                        <button class="btn-reset btn-reset-approve" onclick="approveUnlinkDevice('${u.id}', '${u.fullname}')" title="Duyệt yêu cầu huỷ liên kết" style="margin-right: 4px;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                                <polyline points="20 6 9 17 4 12"/>
                            </svg>
                            Duyệt Huỷ
                        </button>
                        <button class="btn-reset btn-reset-reject" onclick="rejectUnlinkDevice('${u.id}', '${u.fullname}')" title="Từ chối yêu cầu huỷ liên kết" style="margin-right: 4px;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                                <line x1="18" y1="6" x2="6" y2="18"/>
                                <line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                            Từ Chối
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
                    <td><span style="font-weight:600; color:var(--text-secondary);">${u.team || 'Chưa phân team'}</span></td>
                    <td><span class="tag tag-employee">Nhân viên</span></td>
                    <td><span class="text-purple text-bold">${totalOT.toFixed(1)}h</span></td>
                    <td><div class="action-buttons">
                        ${approveBtn}
                        ${deviceUnlinkBtn}
                        ${browserUnlinkBtn}
                        ${(!u.team || u.team !== 'admin' || isBelongToAdminTeam || (currentUser && currentUser.id === u.id)) ? `
                        <button class="btn-icon-only edit" onclick="editUserDialog('${u.id}')" title="Sửa" style="margin-right: 4px;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                        </button>
                        ` : ''}
                        ${(!u.team || u.team !== 'admin' || isBelongToAdminTeam) ? `
                        <button class="btn-icon-only delete" onclick="deleteUser('${u.id}')" title="Xóa">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                                <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                            </svg>
                        </button>
                        ` : ''}
                    </div></td>
                </tr>`;
            }).join('') || `<tr class="empty-row">
                <td colspan="7" style="padding: 80px 16px; text-align: center; background: rgba(255,255,255,0.01); border: 1px dashed rgba(255,255,255,0.06); border-radius: 8px;">
                    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px;">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="48" height="48" style="color: var(--text-muted); opacity: 0.6;">
                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                            <circle cx="9" cy="7" r="4"/>
                            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                        </svg>
                        <span style="font-size: 15px; font-weight: 600; color: var(--text-secondary);">Không có nhân viên chưa phân team</span>
                        <span style="font-size: 13px; color: var(--text-muted);">Tất cả nhân viên đã được phân bổ vào các nhóm làm việc.</span>
                    </div>
                </td>
            </tr>`;
        }

        // Show/hide unassigned warning alert
        const warningAlert = document.getElementById('unassigned-warning-alert');
        if (warningAlert) {
            if (unassigned.length > 0) {
                warningAlert.style.display = 'flex';
            } else {
                warningAlert.style.display = 'none';
            }
        }

        // Update badge for unassigned sub-tab
        const badgeUnassigned = document.getElementById('badge-sub-unassigned');
        if (badgeUnassigned) {
            if (unassigned.length > 0) {
                badgeUnassigned.textContent = unassigned.length;
                badgeUnassigned.style.display = 'inline-block';
            } else {
                badgeUnassigned.style.display = 'none';
            }
        }

    } catch (e) {}
}

// SVG Chart Renderers for Report Redesign
function renderTeamBarChart(teamOTs) {
    const entries = Object.entries(teamOTs).sort((a, b) => b[1] - a[1]);
    const totalHours = entries.reduce((sum, e) => sum + e[1], 0);
    if (entries.length === 0 || totalHours === 0) {
        return `<div class="chart-empty">Chưa có dữ liệu đội nhóm</div>`;
    }
    const maxVal = Math.max(...entries.map(e => e[1])) || 1;
    const width = 400;
    const rowHeight = 24;
    const paddingLeft = 110;
    const paddingRight = 60;
    const chartHeight = entries.length * rowHeight + 20;
    
    let svgHtml = `<svg width="100%" height="${chartHeight}" viewBox="0 0 ${width} ${chartHeight}" style="font-family: inherit;">`;
    
    // Gradients definition
    svgHtml += `
        <defs>
            <linearGradient id="barGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#0dd98b" stop-opacity="0.6"/>
                <stop offset="100%" stop-color="#0dd98b" stop-opacity="0.95"/>
            </linearGradient>
        </defs>`;
        
    entries.forEach(([team, val], idx) => {
        const y = idx * rowHeight + 10;
        const barMaxWidth = width - paddingLeft - paddingRight;
        const barWidth = (val / maxVal) * barMaxWidth;
        const displayTeam = team.length > 14 ? team.substring(0, 12) + '..' : team;
        
        // Team label
        svgHtml += `<text x="${paddingLeft - 10}" y="${y + 15}" fill="var(--text-secondary)" font-size="11" font-weight="500" text-anchor="end">${displayTeam}</text>`;
        // Background bar track
        svgHtml += `<rect x="${paddingLeft}" y="${y + 4}" width="${barMaxWidth}" height="12" rx="4" fill="rgba(255,255,255,0.03)" />`;
        // Value bar
        svgHtml += `<rect x="${paddingLeft}" y="${y + 4}" width="${barWidth}" height="12" rx="4" fill="url(#barGrad)" />`;
        // Value text
        svgHtml += `<text x="${paddingLeft + barWidth + 8}" y="${y + 14}" fill="var(--accent-green)" font-size="11" font-weight="bold">${val.toFixed(1)}h</text>`;
    });
    
    svgHtml += `</svg>`;
    return svgHtml;
}

function renderTrendLineChart(dailyOTs, month) {
    const entries = Object.entries(dailyOTs).sort((a, b) => a[0].localeCompare(b[0]));
    const values = entries.map(e => e[1]);
    const maxVal = Math.max(...values) || 1;
    const width = 480;
    const height = 120;
    const paddingLeft = 30;
    const paddingRight = 15;
    const paddingTop = 15;
    const paddingBottom = 22;
    
    const chartWidth = width - paddingLeft - paddingRight;
    const chartHeight = height - paddingTop - paddingBottom;
    
    const allZero = values.every(v => v === 0);
    if (allZero) {
        return `<div class="chart-empty">Chưa có dữ liệu xu hướng ngày</div>`;
    }
    
    let points = [];
    entries.forEach(([date, val], idx) => {
        const x = paddingLeft + (idx / (entries.length - 1)) * chartWidth;
        const y = paddingTop + chartHeight - (val / maxVal) * chartHeight;
        points.push(`${x},${y}`);
    });
    
    const pointsStr = points.join(' ');
    // Area polygon points under the line chart
    const firstPoint = points[0].split(',');
    const lastPoint = points[points.length - 1].split(',');
    const areaPointsStr = `${firstPoint[0]},${paddingTop + chartHeight} ${pointsStr} ${lastPoint[0]},${paddingTop + chartHeight}`;
    
    let svgHtml = `<svg width="100%" height="100%" viewBox="0 0 ${width} ${height}" style="font-family: inherit;">`;
    
    // Gradients definition
    svgHtml += `
        <defs>
            <linearGradient id="areaGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stop-color="#a855f7" stop-opacity="0.25"/>
                <stop offset="100%" stop-color="#a855f7" stop-opacity="0.0"/>
            </linearGradient>
            <linearGradient id="lineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#0dd98b"/>
                <stop offset="50%" stop-color="#a855f7"/>
                <stop offset="100%" stop-color="#3b82f6"/>
            </linearGradient>
        </defs>`;
        
    // Horizontal gridlines
    for (let i = 0; i <= 4; i++) {
        const y = paddingTop + (i / 4) * chartHeight;
        const label = (maxVal - (i / 4) * maxVal).toFixed(1) + 'h';
        svgHtml += `<line x1="${paddingLeft}" y1="${y}" x2="${width - paddingRight}" y2="${y}" stroke="rgba(255,255,255,0.05)" stroke-width="1" stroke-dasharray="2,2" />`;
        svgHtml += `<text x="${paddingLeft - 8}" y="${y + 4}" fill="var(--text-muted)" font-size="9" text-anchor="end">${label}</text>`;
    }
    
    // Area under path
    svgHtml += `<polygon points="${areaPointsStr}" fill="url(#areaGrad)" />`;
    
    // Trend line
    svgHtml += `<polyline points="${pointsStr}" fill="none" stroke="url(#lineGrad)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />`;
    
    // Key days (label start, mid, end days)
    const labelY = height - 10;
    svgHtml += `<text x="${paddingLeft}" y="${labelY}" fill="var(--text-muted)" font-size="9" text-anchor="start">Ngày 1</text>`;
    svgHtml += `<text x="${paddingLeft + chartWidth / 2}" y="${labelY}" fill="var(--text-muted)" font-size="9" text-anchor="middle">Ngày 15</text>`;
    svgHtml += `<text x="${width - paddingRight}" y="${labelY}" fill="var(--text-muted)" font-size="9" text-anchor="end">Ngày ${entries.length}</text>`;
    
    svgHtml += `</svg>`;
    return svgHtml;
}

// Expandable Detail Row Handler
window.toggleReportRow = function(row, userId) {
    const nextRow = row.nextElementSibling;
    const isExpanded = row.classList.contains('expanded');
    
    // Collapse all other detail rows first to keep layout clean
    document.querySelectorAll('.report-row.expanded').forEach(r => {
        if (r !== row) {
            r.classList.remove('expanded');
            if (r.nextElementSibling && r.nextElementSibling.classList.contains('detail-row')) {
                r.nextElementSibling.remove();
            }
        }
    });
    
    if (isExpanded) {
        row.classList.remove('expanded');
        if (nextRow && nextRow.classList.contains('detail-row')) {
            nextRow.remove();
        }
    } else {
        row.classList.add('expanded');
        const month = document.getElementById('report-filter-month').value;
        
        api(`/api/records?userId=${userId}&month=${month}`).then(data => {
            const detailedRecords = (data.records || []).filter(r => {
                const isBf = r.isBackfill || (r.note && (r.note.includes('[BÙ THÁNG TRƯỚC]') || r.note.includes('[TĂNG THÁNG NÀY]')));
                return isBf ? true : r.date.startsWith(month);
            });
            const holidays = (currentSystemSettings.holidays || "")
                .split(',')
                .map(d => d.trim())
                .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d));

            const detailRow = document.createElement('tr');
            detailRow.className = 'detail-row';
            
            let recordsHtml = '';
            if (detailedRecords.length === 0) {
                recordsHtml = '<div style="padding: 12px; color: var(--text-muted); text-align: center; font-style: italic;">Không có chi tiết tăng ca cho tháng này.</div>';
            } else {
                recordsHtml = `
                    <div class="report-detail-wrapper" style="padding: 16px 24px; background: rgba(0,0,0,0.18); margin: 6px 12px; border-radius: 8px;">
                        <h5 style="margin-top: 0; margin-bottom: 12px; color: var(--accent-green); font-size: 11px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase;">Chi tiết lịch sử làm thêm giờ</h5>
                        <table class="detail-table" style="width: 100%; border-collapse: collapse; font-size: 12px;">
                            <thead>
                                <tr style="border-bottom: 1px solid rgba(255,255,255,0.08); text-align: left;">
                                    <th style="color: var(--text-secondary); font-weight: 600;">Ngày làm việc</th>
                                    <th style="color: var(--text-secondary); font-weight: 600;">Hệ số</th>
                                    <th style="color: var(--text-secondary); font-weight: 600;">Giờ thực tế</th>
                                    <th style="color: var(--text-secondary); font-weight: 600;">Giờ quy đổi</th>
                                    <th style="color: var(--text-secondary); font-weight: 600;">Tuyến đường (Xe tỉnh)</th>
                                    <th style="color: var(--text-secondary); font-weight: 600;">Trạng thái</th>
                                    <th style="color: var(--text-secondary); font-weight: 600;">Ghi chú</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${detailedRecords.map(r => {
                                    const coef = getOTCoefficient(r.date, holidays);
                                    let coefText = '';
                                    if (coef === 3.0) {
                                        coefText = '<span style="font-weight:700;color:var(--accent-red);">3.0 (Lễ)</span>';
                                    } else if (coef === 2.0) {
                                        coefText = '<span style="font-weight:700;color:var(--accent-orange);">2.0 (CN)</span>';
                                    } else {
                                        coefText = '<span style="color:var(--text-secondary);">1.5 (Thường)</span>';
                                    }
                                    const actualHours = r.totalHours || 0;
                                    const eqHours = actualHours * coef;
                                    
                                    const province = r.deliveryProvince || '-';
                                    const statusText = r.status === 'approved' ? '<span class="tag tag-success">Đã duyệt</span>' : (r.status === 'pending' ? '<span class="tag tag-warning">Đang chờ</span>' : '<span class="tag tag-danger">Từ chối</span>');
                                    const isBackfillText = r.isBackfill ? '<span style="font-size: 9px; padding: 2px 5px; background: rgba(245,158,11,0.15); color: var(--accent-orange); border-radius: 4px; font-weight: 800; margin-left: 6px;">BÙ</span>' : '';
                                    return `
                                        <tr style="border-bottom: 1px solid rgba(255,255,255,0.04);">
                                            <td><strong>${formatDate(r.date)}</strong>${isBackfillText}</td>
                                            <td>${coefText}</td>
                                            <td><strong>${parseFloat(actualHours.toFixed(2))}</strong> giờ</td>
                                            <td><strong style="color:var(--accent-green);">${parseFloat(eqHours.toFixed(2))}</strong> giờ</td>
                                            <td><span style="color: var(--text-primary);">${province}</span></td>
                                            <td>${statusText}</td>
                                            <td style="max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${r.note || ''}">${r.note || '-'}</td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                `;
            }
            
            const cell = document.createElement('td');
            cell.colSpan = 8;
            cell.innerHTML = recordsHtml;
            detailRow.appendChild(cell);
            
            row.parentNode.insertBefore(detailRow, row.nextSibling);
        }).catch(err => {
            console.error('Error fetching details:', err);
            showToast('Lỗi khi tải chi tiết', 'error');
        });
    }
};

async function refreshReport(cachedUsers, cachedRecords) {
    const month = document.getElementById('report-filter-month').value;
    const filterTeam = document.getElementById('report-filter-team') ? document.getElementById('report-filter-team').value : '';
    const searchVal = document.getElementById('report-search-name') ? document.getElementById('report-search-name').value : '';
    
    try {
        const currentUser = JSON.parse(localStorage.getItem('ot_current_user') || 'null');
        const isAdmin = currentUser && (currentUser.username === 'admin' || currentUser.isSuperAdmin);
        
        let users;
        if (cachedUsers) {
            users = cachedUsers.filter(u => u.role === 'employee');
        } else {
            const usersData = await api('/api/users');
            users = usersData.users.filter(u => u.role === 'employee');
        }
        
        if (isAdmin) {
            if (filterTeam) {
                users = users.filter(u => {
                    const userTeam = u.team || '';
                    if (filterTeam === 'unassigned') {
                        return userTeam === '' || userTeam === 'unassigned';
                    }
                    return userTeam === filterTeam;
                });
            }
        } else {
            const managerTeam = currentUser ? (currentUser.team || '') : '';
            users = users.filter(u => u.team && u.team === managerTeam);
        }

        let rawRecords;
        const currentMonth = getCurrentMonth();
        if (month === currentMonth && cachedRecords) {
            rawRecords = cachedRecords;
        } else {
            const recData = await api(`/api/records?month=${month}`);
            rawRecords = (recData.records || []).filter(r => {
                const isBf = r.isBackfill || (r.note && (r.note.includes('[BÙ THÁNG TRƯỚC]') || r.note.includes('[TĂNG THÁNG NÀY]')));
                return isBf ? true : r.date.startsWith(month);
            });
        }
        const records = rawRecords.filter(r => {
            const isBackfill = r.isBackfill || (r.note && (r.note.includes('[BÙ THÁNG TRƯỚC]') || r.note.includes('[TĂNG THÁNG NÀY]')));
            return r.status === 'approved' || (!isBackfill && r.status !== 'pending' && r.status !== 'rejected');
        });
        
        // --- 1. Compute Overall Dashboard KPI Stats & Charts (prior to search filtration) ---
        let totalOTHours = 0;
        let activeEmployeesSet = new Set();
        const teamOTs = {};
        const dailyOTs = {};
        
        // Initialize daily trend map
        const year = parseInt(month.substring(0, 4));
        const monthVal = parseInt(month.substring(5, 7));
        const daysInMonth = new Date(year, monthVal, 0).getDate();
        for (let d = 1; d <= daysInMonth; d++) {
            const dayStr = `${month}-${String(d).padStart(2, '0')}`;
            dailyOTs[dayStr] = 0;
        }

        users.forEach(u => {
            const ur = records.filter(r => r.userId === u.id);
            const lunchH = ur.filter(r => r.hasLunchOT).length * OT_LUNCH_HOURS;
            const eveningH = ur.reduce((s, r) => s + (r.eveningOTHours || 0), 0);
            const totalH = ur.reduce((s, r) => s + (r.totalHours || 0), 0);
            
            if (totalH > 0) {
                totalOTHours += totalH;
                activeEmployeesSet.add(u.id);
            }
            
            // Team stats
            const teamName = u.team === 'admin' ? 'admin' : (u.team || 'Chưa phân team');
            teamOTs[teamName] = (teamOTs[teamName] || 0) + totalH;
        });
        
        // Sum daily trend
        records.forEach(r => {
            const belongsToMatchingUser = users.some(u => u.id === r.userId);
            if (belongsToMatchingUser && dailyOTs[r.date] !== undefined) {
                dailyOTs[r.date] += (r.totalHours || 0);
            }
        });
        
        // Find top team
        let topTeam = '-';
        let maxTeamHours = 0;
        Object.entries(teamOTs).forEach(([team, val]) => {
            if (val > maxTeamHours) {
                maxTeamHours = val;
                topTeam = `${team} (${parseFloat(val.toFixed(2))}h)`;
            }
        });
        
        // Update DOM KPIs
        const activeCount = activeEmployeesSet.size;
        const avgHours = activeCount > 0 ? (totalOTHours / activeCount) : 0;
        
        document.getElementById('rep-stat-total-hours').textContent = `${parseFloat(totalOTHours.toFixed(2))}h`;
        document.getElementById('rep-stat-avg-hours').textContent = `${parseFloat(avgHours.toFixed(2))}h`;
        document.getElementById('rep-stat-active-users').textContent = activeCount.toString();
        const topTeamEl = document.getElementById('rep-stat-top-team');
        topTeamEl.textContent = topTeam;
        topTeamEl.title = topTeam;
        


        // --- 2. Filter list by search query & Calculate Row Data ---
        let filteredUsers = [...users];
        if (searchVal) {
            const query = searchVal.toLowerCase().trim();
            filteredUsers = filteredUsers.filter(u => u.fullname.toLowerCase().includes(query) || (u.team && u.team.toLowerCase().includes(query)));
        }
        
        const userReportData = filteredUsers.map(u => {
            const ur = records.filter(r => r.userId === u.id);
            const days = ur.length;
            const lunchH = ur.filter(r => r.hasLunchOT).length * OT_LUNCH_HOURS;
            const eveningH = ur.reduce((s, r) => s + (r.eveningOTHours || 0), 0);
            const totalH = ur.reduce((s, r) => s + (r.totalHours || 0), 0);
            return { user: u, days, lunchH, eveningH, totalH };
        });
        
        // --- 3. Sorting ---
        userReportData.sort((a, b) => {
            let valA, valB;
            if (reportSortColumn === 'name') {
                valA = a.user.fullname.toLowerCase();
                valB = b.user.fullname.toLowerCase();
            } else if (reportSortColumn === 'days') {
                valA = a.days;
                valB = b.days;
            } else { // 'total'
                valA = a.totalH;
                valB = b.totalH;
            }
            
            if (valA < valB) return reportSortOrder === 'asc' ? -1 : 1;
            if (valA > valB) return reportSortOrder === 'asc' ? 1 : -1;
            return 0;
        });

        // Update Sorting Indicators
        ['name', 'days', 'total'].forEach(col => {
            const ind = document.getElementById(`sort-ind-${col}`);
            if (ind) {
                ind.className = 'sort-indicator';
                if (reportSortColumn === col) {
                    ind.classList.add(reportSortOrder);
                }
            }
        });

        // --- 4. Render Table Body ---
        const tbody = document.getElementById('report-body');
        if (userReportData.length === 0) {
            tbody.innerHTML = '<tr class="empty-row"><td colspan="7">Không tìm thấy kết quả phù hợp</td></tr>';
            return;
        }

        tbody.innerHTML = userReportData.map((data, i) => {
            const { user: u, days, lunchH, eveningH, totalH } = data;
            const teamName = u.team === 'admin' ? 'admin' : (u.team || 'Chưa phân team');

            return `<tr class="report-row" onclick="toggleReportRow(this, '${u.id}')">
                <td>${i + 1}</td>
                <td>
                    <div class="employee-name-cell">
                        <svg class="chevron-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                        <strong>${u.fullname}</strong>
                    </div>
                </td>
                <td><span class="tag" style="background: rgba(156,163,175,0.1); color: var(--text-primary);">${teamName}</span></td>
                <td style="text-align: center;">${days} ngày</td>
                <td style="text-align: center;">${parseFloat(lunchH.toFixed(2))}h</td>
                <td style="text-align: center;">${parseFloat(eveningH.toFixed(2))}h</td>
                <td style="text-align: center;"><span class="text-purple text-bold" style="font-size: 13px;">${parseFloat(totalH.toFixed(2))}h</span></td>
            </tr>`;
        }).join('');
        
        // Vẽ biểu đồ phân tích trực quan
        try {
            renderAnalyticsCharts(teamOTs, dailyOTs);
        } catch (err) {
            console.error("Lỗi vẽ biểu đồ phân tích:", err);
        }
    } catch (e) {
        console.error('Lỗi khi vẽ báo cáo:', e);
    }
}

function renderAnalyticsCharts(teamOTs, dailyOTs) {
    // 1. Vẽ biểu đồ cột ngang theo Team
    const teamBarsContainer = document.getElementById('chart-teams-bars');
    if (teamBarsContainer) {
        const teamEntries = Object.entries(teamOTs).sort((a, b) => b[1] - a[1]); // Sắp xếp giảm dần
        const maxHours = teamEntries.length > 0 ? Math.max(...teamEntries.map(e => e[1])) : 0;
        
        if (teamEntries.length === 0 || maxHours === 0) {
            teamBarsContainer.innerHTML = '<div style="text-align: center; color: #71717a; padding: 20px 0; font-size: 0.9rem;">Không có dữ liệu tăng ca</div>';
        } else {
            teamBarsContainer.innerHTML = teamEntries.map(([team, hours]) => {
                const percent = maxHours > 0 ? (hours / maxHours) * 100 : 0;
                return `
                    <div class="chart-team-row">
                        <span class="chart-team-label" title="${team}">${team}</span>
                        <div class="chart-team-progress-wrapper">
                            <div class="chart-team-progress" style="width: ${percent}%;"></div>
                        </div>
                        <span class="chart-team-value">${parseFloat(hours.toFixed(2))}h</span>
                    </div>
                `;
            }).join('');
        }
    }

    // 2. Vẽ biểu đồ xu hướng theo ngày của tháng
    const daysTrendContainer = document.getElementById('chart-days-trend');
    if (daysTrendContainer) {
        const dailyEntries = Object.entries(dailyOTs).sort((a, b) => a[0].localeCompare(b[0])); // Ngày tăng dần
        const maxDailyHours = dailyEntries.length > 0 ? Math.max(...dailyEntries.map(e => e[1])) : 0;
        
        if (dailyEntries.length === 0 || maxDailyHours === 0) {
            daysTrendContainer.innerHTML = '<div style="text-align: center; color: #71717a; width: 100%; font-size: 0.9rem;">Không có dữ liệu biến động</div>';
        } else {
            daysTrendContainer.innerHTML = dailyEntries.map(([dateStr, hours]) => {
                const dayNum = parseInt(dateStr.substring(8, 10));
                const percent = maxDailyHours > 0 ? (hours / maxDailyHours) * 100 : 0;
                return `
                    <div class="chart-day-column">
                        <div class="chart-day-tooltip">Ngày ${dayNum}: ${parseFloat(hours.toFixed(2))}h</div>
                        <div class="chart-day-bar" style="--height: ${percent}%;"></div>
                        <span class="chart-day-label">${dayNum}</span>
                    </div>
                `;
            }).join('');
        }
    }
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

async function approveRecord(recordId) {
    try {
        await api(`/api/records/${recordId}`, 'PUT', { status: 'approved' });
        showToast('Đã duyệt bản ghi tăng ca!');
        await Promise.all([refreshAdminRecords(), refreshAdminStats(), refreshReport()]);
    } catch (e) {
        showToast(e.message, 'error');
    }
}

async function rejectRecord(recordId) {
    showModal('Từ chối bản ghi', 'Bạn có chắc muốn từ chối bản ghi tăng ca này?', [
        { text: 'Hủy', class: 'btn-ghost' },
        { text: 'Từ chối', class: 'btn btn-danger btn-sm', action: async () => {
            try {
                await api(`/api/records/${recordId}`, 'PUT', { status: 'rejected' });
                await Promise.all([refreshAdminRecords(), refreshAdminStats(), refreshReport()]);
                showToast('Đã từ chối bản ghi');
            } catch (e) {
                showToast(e.message, 'error');
            }
        }}
    ]);
}

function updatePendingBulkActionsVisibility() {
    const chks = document.querySelectorAll('.chk-pending-record');
    const checkedChks = document.querySelectorAll('.chk-pending-record:checked');
    const selectAllChk = document.getElementById('chk-pending-select-all');
    
    if (selectAllChk) {
        selectAllChk.checked = chks.length > 0 && chks.length === checkedChks.length;
    }
    
    const bulkBar = document.getElementById('pending-bulk-actions');
    const countText = document.getElementById('pending-selected-count');
    
    if (bulkBar && countText) {
        if (checkedChks.length > 0) {
            bulkBar.style.display = 'flex';
            countText.textContent = `Đã chọn ${checkedChks.length} bản ghi`;
        } else {
            bulkBar.style.display = 'none';
        }
    }
}

async function bulkApproveRecords() {
    const checkedChks = document.querySelectorAll('.chk-pending-record:checked');
    const recordIds = Array.from(checkedChks).map(chk => chk.value);
    if (recordIds.length === 0) return;

    showModal('Duyệt hàng loạt', `Bạn có chắc chắn muốn duyệt ${recordIds.length} bản ghi đã chọn không?`, [
        { text: 'Hủy', class: 'btn-ghost' },
        { text: 'Duyệt', class: 'btn btn-primary btn-sm', action: async () => {
            try {
                showToast(`Đang duyệt ${recordIds.length} bản ghi...`, 'info');
                await Promise.all(recordIds.map(id => api(`/api/records/${id}`, 'PUT', { status: 'approved' })));
                showToast(`Đã duyệt thành công ${recordIds.length} bản ghi!`);
                await Promise.all([refreshAdminRecords(), refreshAdminStats(), refreshReport()]);
            } catch (e) {
                showToast(e.message, 'error');
            }
        }}
    ]);
}

async function bulkRejectRecords() {
    const checkedChks = document.querySelectorAll('.chk-pending-record:checked');
    const recordIds = Array.from(checkedChks).map(chk => chk.value);
    if (recordIds.length === 0) return;

    showModal('Từ chối hàng loạt', `Bạn có chắc chắn muốn từ chối ${recordIds.length} bản ghi đã chọn không?`, [
        { text: 'Hủy', class: 'btn-ghost' },
        { text: 'Từ chối', class: 'btn btn-danger btn-sm', action: async () => {
            try {
                showToast(`Đang từ chối ${recordIds.length} bản ghi...`, 'info');
                await Promise.all(recordIds.map(id => api(`/api/records/${id}`, 'PUT', { status: 'rejected' })));
                showToast(`Đã từ chối thành công ${recordIds.length} bản ghi!`);
                await Promise.all([refreshAdminRecords(), refreshAdminStats(), refreshReport()]);
            } catch (e) {
                showToast(e.message, 'error');
            }
        }}
    ]);
}

function updateRejectedBulkActionsVisibility() {
    const chks = document.querySelectorAll('.chk-rejected-record');
    const checkedChks = document.querySelectorAll('.chk-rejected-record:checked');
    const selectAllChk = document.getElementById('chk-rejected-select-all');
    
    if (selectAllChk) {
        selectAllChk.checked = chks.length > 0 && chks.length === checkedChks.length;
    }
    
    const bulkBar = document.getElementById('rejected-bulk-actions');
    const countText = document.getElementById('rejected-selected-count');
    
    if (bulkBar && countText) {
        if (checkedChks.length > 0) {
            bulkBar.style.display = 'flex';
            countText.textContent = `Đã chọn ${checkedChks.length} bản ghi`;
        } else {
            bulkBar.style.display = 'none';
        }
    }
}

async function bulkApproveRejectedRecords() {
    const checkedChks = document.querySelectorAll('.chk-rejected-record:checked');
    const recordIds = Array.from(checkedChks).map(chk => chk.value);
    if (recordIds.length === 0) return;

    showModal('Duyệt lại hàng loạt', `Bạn có chắc chắn muốn duyệt lại ${recordIds.length} bản ghi đã chọn không?`, [
        { text: 'Hủy', class: 'btn-ghost' },
        { text: 'Duyệt lại', class: 'btn btn-primary btn-sm', action: async () => {
            try {
                showToast(`Đang duyệt lại ${recordIds.length} bản ghi...`, 'info');
                await Promise.all(recordIds.map(id => api(`/api/records/${id}`, 'PUT', { status: 'approved' })));
                showToast(`Đã duyệt lại thành công ${recordIds.length} bản ghi!`);
                await Promise.all([refreshAdminRecords(), refreshAdminStats(), refreshReport()]);
            } catch (e) {
                showToast(e.message, 'error');
            }
        }}
    ]);
}

async function bulkDeleteRejectedRecords() {
    const checkedChks = document.querySelectorAll('.chk-rejected-record:checked');
    const recordIds = Array.from(checkedChks).map(chk => chk.value);
    if (recordIds.length === 0) return;

    showModal('Xóa hàng loạt', `Bạn có chắc chắn muốn xóa vĩnh viễn ${recordIds.length} bản ghi đã chọn không?`, [
        { text: 'Hủy', class: 'btn-ghost' },
        { text: 'Xóa', class: 'btn btn-danger btn-sm', action: async () => {
            try {
                showToast(`Đang xóa ${recordIds.length} bản ghi...`, 'info');
                await Promise.all(recordIds.map(id => api(`/api/records/${id}`, 'DELETE')));
                showToast(`Đã xóa thành công ${recordIds.length} bản ghi!`);
                await Promise.all([refreshAdminRecords(), refreshAdminStats(), refreshReport()]);
            } catch (e) {
                showToast(e.message, 'error');
            }
        }}
    ]);
}

function loadScript(src) {
    return new Promise((resolve, reject) => {
        const exists = document.querySelector(`script[src="${src}"]`);
        if (exists) {
            if (window.ExcelJS) return resolve();
            exists.onload = resolve;
            exists.onerror = reject;
            return;
        }
        const s = document.createElement('script');
        s.src = src;
        s.onload = resolve;
        s.onerror = reject;
        document.body.appendChild(s);
    });
}

async function exportExcel() {
    if (typeof ExcelJS === 'undefined') {
        const originalBtn = document.activeElement;
        let originalText = '';
        if (originalBtn && originalBtn.tagName === 'BUTTON') {
            originalBtn.disabled = true;
            originalText = originalBtn.textContent;
            originalBtn.textContent = 'Đang tải thư viện Excel...';
        }
        try {
            await loadScript('exceljs.min.js');
        } catch (err) {
            showToast('Lỗi tải thư viện Excel, vui lòng thử lại!', 'error');
            if (originalBtn) {
                originalBtn.disabled = false;
                originalBtn.textContent = originalText;
            }
            return;
        }
        if (originalBtn) {
            originalBtn.disabled = false;
            originalBtn.textContent = originalText;
        }
    }

    const month = document.getElementById('report-filter-month').value;
    const parts = month.split('-');
    const displayMonth = parts.length === 2 ? `${parts[1]}-${parts[0]}` : month;
    const filterTeam = document.getElementById('report-filter-team') ? document.getElementById('report-filter-team').value : '';
    try {
        const usersData = await api('/api/users');
        const currentUser = JSON.parse(localStorage.getItem('ot_current_user') || 'null');
        const isAdmin = currentUser && (currentUser.username === 'admin' || currentUser.isSuperAdmin);
        
        let users = usersData.users;
        
        if (isAdmin) {
            // Filter by selected team
            if (filterTeam) {
users = users.filter(u => {
                    const userTeam = u.team || '';
                    if (filterTeam === 'unassigned') {
                        return userTeam === '' || userTeam === 'unassigned';
                    }
                    return userTeam === filterTeam;
                });
            }
        } else {
            // Manager: only export reports of their team and themselves
            const managerTeam = currentUser ? (currentUser.team || '') : '';
            users = users.filter(u => u.id === currentUser.id || (u.team && u.team === managerTeam));
        }

        users.sort((a, b) => a.fullname.localeCompare(b.fullname, 'vi'));

        const recData = await api(`/api/records?month=${month}`);
        const records = recData.records.filter(r => {
            const isBackfill = r.isBackfill || (r.note && (r.note.includes('[BÙ THÁNG TRƯỚC]') || r.note.includes('[TĂNG THÁNG NÀY]')));
            // Lọc phía client: loại bỏ bản ghi không phải backfill mà ngày không thuộc tháng đang xem
            if (!isBackfill && !r.date.startsWith(month)) return false;
            return r.status === 'approved' || (!isBackfill && r.status !== 'pending' && r.status !== 'rejected');
        });

        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        const exportTime = `${formatDateFull(now)} lúc ${timeStr}`;

        // Khởi tạo workbook mới của ExcelJS
        const workbook = new ExcelJS.Workbook();
        
        // ------------------ SHEET 1: TỔNG HỢP ------------------
        const wsSummary = workbook.addWorksheet('Tổng Hợp', {
            views: [{ showGridLines: true }]
        });

        const holidays = (currentSystemSettings.holidays || "")
            .split(',')
            .map(d => d.trim())
            .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d));

        // 1. Tiêu đề chính
        wsSummary.mergeCells('A1:H1');
        const title1 = wsSummary.getCell('A1');
        title1.value = `BÁO CÁO TĂNG CA THÁNG ${displayMonth}`;
        title1.font = { name: 'Times New Roman', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
        title1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B365D' } }; // Navy Blue đậm
        title1.alignment = { vertical: 'middle', horizontal: 'center' };
        wsSummary.getRow(1).height = 40;

        // 2. Ngày xuất báo cáo
        wsSummary.mergeCells('A2:H2');
        const subtitle1 = wsSummary.getCell('A2');
        subtitle1.value = `Ngày xuất báo cáo: ${exportTime}`;
        subtitle1.font = { name: 'Times New Roman', size: 10, italic: true, color: { argb: 'FF4B5563' } };
        subtitle1.alignment = { vertical: 'middle', horizontal: 'center' };
        wsSummary.getRow(2).height = 20;

        // 3. Dòng trống
        wsSummary.getRow(3).height = 15;

        // 4. Tiêu đề bảng
        wsSummary.getCell('A4').value = "I. BẢNG TỔNG HỢP GIỜ TĂNG CA & CHUYẾN ĐI XE";
        wsSummary.getCell('A4').font = { name: 'Times New Roman', size: 12, bold: true, color: { argb: 'FF1F2937' } };
        wsSummary.getRow(4).height = 22;

        // 5. Headers
        const headers1 = ["STT", "Họ và tên", "Team", "Mã nhân viên", "Số ngày OT", "Tổng OT thực tế (giờ)", "Tổng OT quy đổi (giờ)", "Tổng chuyến xe"];
        wsSummary.getRow(5).values = headers1;
        wsSummary.getRow(5).height = 28;
        wsSummary.getRow(5).font = { name: 'Times New Roman', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
        
        for (let col = 1; col <= 8; col++) {
            const cell = wsSummary.getCell(5, col);
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2B6CB0' } }; // Medium Navy/Blue
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
            cell.border = {
                top: { style: 'thin', color: { argb: 'FF9CA3AF' } },
                left: { style: 'thin', color: { argb: 'FF9CA3AF' } },
                bottom: { style: 'thin', color: { argb: 'FF9CA3AF' } },
                right: { style: 'thin', color: { argb: 'FF9CA3AF' } }
            };
        }

        // 6. Dữ liệu nhân viên
        let summaryStartRow = 6;
        const activeUsers = users.filter(u => records.some(r => r.userId === u.id));
        
        activeUsers.forEach((u, i) => {
            const ur = records.filter(r => r.userId === u.id);
            const days = ur.length;
            const trips = ur.filter(r => r.calcMode === 'trip' || (!r.calcMode && r.deliveryProvince && r.deliveryProvince.trim() !== '')).length;
            const totalH = ur.reduce((s, r) => s + (r.totalHours || 0), 0);
            const totalEqH = ur.reduce((s, r) => {
                const coef = getOTCoefficient(r.date, holidays);
                return s + ((r.totalHours || 0) * coef);
            }, 0);

            const rowNum = summaryStartRow + i;
            const row = wsSummary.getRow(rowNum);
            row.values = [
                i + 1,
                u.fullname,
                u.team === 'admin' ? 'admin' : (u.team || 'Chưa phân team'),
                u.username,
                days,
                totalH,
                totalEqH,
                trips
            ];
            row.height = 22;
            row.font = { name: 'Times New Roman', size: 10 };

            for (let col = 1; col <= 8; col++) {
                const cell = row.getCell(col);
                cell.border = {
                    top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
                    left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
                    bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
                    right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
                };

                cell.alignment = { vertical: 'middle', horizontal: 'center' };

                if (col === 1 || col === 5 || col === 8) {
                    cell.numFmt = '0';
                } else if (col === 6 || col === 7) {
                    cell.numFmt = '#,##0.0';
                }
            }
        });

        // Thiết lập bộ lọc tự động cho Summary Sheet
        wsSummary.autoFilter = 'A5:H' + (summaryStartRow + activeUsers.length - 1);

        // Kiểm tra xem có dữ liệu OT hoặc Chuyến đi nào không để ẩn cột tương ứng
        const totalOTAllUsers = activeUsers.reduce((sum, u) => {
            const ur = records.filter(r => r.userId === u.id);
            return sum + ur.reduce((s, r) => s + (r.totalHours || 0), 0);
        }, 0);

        const totalTripsAllUsers = activeUsers.reduce((sum, u) => {
            const ur = records.filter(r => r.userId === u.id);
            return sum + ur.filter(r => r.calcMode === 'trip' || (!r.calcMode && r.deliveryProvince && r.deliveryProvince.trim() !== '')).length;
        }, 0);

        // Ẩn cột ở sheet Tổng Hợp nếu không có dữ liệu
        if (totalOTAllUsers === 0) {
            wsSummary.getColumn(6).hidden = true; // Cột F: Tổng OT thực tế
            wsSummary.getColumn(7).hidden = true; // Cột G: Tổng OT quy đổi
        }
        if (totalTripsAllUsers === 0) {
            wsSummary.getColumn(8).hidden = true; // Cột H: Tổng chuyến xe
        }

        // Độ rộng cột
        wsSummary.columns = [
            { width: 8 },   // STT
            { width: 28 },  // Họ và tên
            { width: 18 },  // Nhóm
            { width: 16 },  // Mã nhân viên
            { width: 14 },  // Số ngày OT
            { width: 20 },  // Tổng OT thực tế
            { width: 20 },  // Tổng OT quy đổi
            { width: 18 }   // Tổng chuyến xe
        ];

        // ------------------ SHEET 2: CHI TIẾT ------------------
        const wsDetail = workbook.addWorksheet('Chi Tiết', {
            views: [{ showGridLines: true }]
        });

        // 1. Tiêu đề chính
        wsDetail.mergeCells('A1:K1');
        const title2 = wsDetail.getCell('A1');
        title2.value = `CHI TIẾT TĂNG CA THÁNG ${displayMonth}`;
        title2.font = { name: 'Times New Roman', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
        title2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B365D' } }; // Navy Blue đậm
        title2.alignment = { vertical: 'middle', horizontal: 'center' };
        wsDetail.getRow(1).height = 40;

        // 2. Ngày xuất báo cáo
        wsDetail.mergeCells('A2:K2');
        const subtitle2 = wsDetail.getCell('A2');
        subtitle2.value = `Ngày xuất báo cáo: ${exportTime}`;
        subtitle2.font = { name: 'Times New Roman', size: 10, italic: true, color: { argb: 'FF4B5563' } };
        subtitle2.alignment = { vertical: 'middle', horizontal: 'center' };
        wsDetail.getRow(2).height = 20;

        // 3. Dòng trống
        wsDetail.getRow(3).height = 15;

        // 4. Tiêu đề bảng
        wsDetail.getCell('A4').value = "II. BẢNG CHI TIẾT TĂNG CA TỪNG NGÀY";
        wsDetail.getCell('A4').font = { name: 'Times New Roman', size: 12, bold: true, color: { argb: 'FF1F2937' } };
        wsDetail.getRow(4).height = 22;

        // 5. Headers
        const headers2 = ["STT", "Ngày", "Họ và tên", "Team", "Mã nhân viên", "Thời gian OT", "Hệ số", "Giờ thực tế (giờ)", "Giờ quy đổi (giờ)", "Hoạt động / Chuyến đi", "Ghi chú"];
        wsDetail.getRow(5).values = headers2;
        wsDetail.getRow(5).height = 28;
        wsDetail.getRow(5).font = { name: 'Times New Roman', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
        
        for (let col = 1; col <= 11; col++) {
            const cell = wsDetail.getCell(5, col);
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2B6CB0' } }; // Medium Navy/Blue
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
            cell.border = {
                top: { style: 'thin', color: { argb: 'FF9CA3AF' } },
                left: { style: 'thin', color: { argb: 'FF9CA3AF' } },
                bottom: { style: 'thin', color: { argb: 'FF9CA3AF' } },
                right: { style: 'thin', color: { argb: 'FF9CA3AF' } }
            };
        }

        // 6. Điền dữ liệu chi tiết
        let currentDetailRow = 6;
        let detailedIdx = 1;
        let isFirstUser = true;

        activeUsers.forEach(u => {
            const userRecords = records.filter(r => r.userId === u.id);
            if (userRecords.length === 0) return;
            userRecords.sort((a, b) => a.date.localeCompare(b.date));

            // Thêm dòng trống ngăn cách giữa các nhân viên
            if (!isFirstUser) {
                wsDetail.addRow([]);
                wsDetail.getRow(currentDetailRow).height = 14;
                for (let col = 1; col <= 11; col++) {
                    const cell = wsDetail.getCell(currentDetailRow, col);
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }; // Slate 100
                    cell.border = {
                        top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
                        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
                        bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
                        right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
                    };
                }
                currentDetailRow++;
            }
            isFirstUser = false;

            userRecords.forEach(r => {
                let timeRange = '—';
                if (r.hasLunchOT && r.eveningOTHours > 0) {
                    timeRange = `12:20-13:20, ${r.otStart}-${r.otEnd}`;
                } else if (r.hasLunchOT) {
                    timeRange = '12:20-13:20';
                } else if (r.eveningOTHours > 0) {
                    timeRange = `${r.otStart}-${r.otEnd}`;
                }

                let activityVal = '—';
                if (r.customActivity) {
                    if (r.calcMode === 'trip') {
                        activityVal = `${r.customActivity}${r.deliveryProvince ? ': ' + r.deliveryProvince : ''}`;
                    } else {
                        activityVal = r.customActivity;
                    }
                } else if (r.deliveryProvince && r.deliveryProvince.trim() !== '') {
                    activityVal = r.deliveryProvince;
                }

                const coef = getOTCoefficient(r.date, holidays);
                const actualHours = r.totalHours || 0;
                const eqHours = actualHours * coef;

                const row = wsDetail.getRow(currentDetailRow);
                row.values = [
                    detailedIdx++,
                    new Date(r.date + 'T00:00:00Z'),
                    u.fullname,
                    u.team === 'admin' ? 'admin' : (u.team || 'Chưa phân team'),
                    u.username,
                    timeRange,
                    coef,
                    actualHours,
                    eqHours,
                    activityVal,
                    r.note || '—'
                ];
                row.height = 22;
                row.font = { name: 'Times New Roman', size: 10 };

                for (let col = 1; col <= 11; col++) {
                    const cell = row.getCell(col);
                    cell.border = {
                        top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
                        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
                        bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
                        right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
                    };

                    cell.alignment = { vertical: 'middle', horizontal: 'center' };

                    if (col === 1) {
                        cell.numFmt = '0';
                    } else if (col === 2) {
                        cell.numFmt = 'dd/mm/yyyy';
                    } else if (col === 7) {
                        cell.numFmt = '0.0';
                    } else if (col === 8 || col === 9) {
                        cell.numFmt = '#,##0.0';
                    }
                }
                currentDetailRow++;
            });
        });

        // 7. Tổng cộng chi tiết
        if (detailedIdx > 1) {
            // Áp dụng bộ lọc cho toàn bộ vùng dữ liệu chi tiết (từ dòng 5 đến dòng cuối cùng trước dòng tổng cộng)
            wsDetail.autoFilter = 'A5:K' + (currentDetailRow - 1);
        } else {
            wsDetail.mergeCells(`A${currentDetailRow}:K${currentDetailRow}`);
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
            { width: 18 },  // Nhóm
            { width: 16 },  // Mã nhân viên
            { width: 24 },  // Thời gian OT
            { width: 12 },  // Hệ số
            { width: 18 },  // Giờ thực tế
            { width: 18 },  // Giờ quy đổi
            { width: 20 },  // Đi xe (Tỉnh)
            { width: 35 }   // Ghi chú
        ];

        // Ẩn cột ở sheet Chi Tiết nếu không có dữ liệu
        if (totalOTAllUsers === 0) {
            wsDetail.getColumn(6).hidden = true; // Cột F: Thời gian OT
            wsDetail.getColumn(7).hidden = true; // Cột G: Hệ số
            wsDetail.getColumn(8).hidden = true; // Cột H: Giờ thực tế (giờ)
            wsDetail.getColumn(9).hidden = true; // Cột I: Giờ quy đổi (giờ)
        }
        if (totalTripsAllUsers === 0) {
            const hasCustomActivities = records.some(r => r.customActivity && r.calcMode !== 'trip');
            if (!hasCustomActivities) {
                wsDetail.getColumn(10).hidden = true; // Cột J: Hoạt động / Chuyến đi
            }
        }

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
        'Xác nhận Chốt công & Khóa tháng',
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
                text: 'Đã tải (Khóa tháng)',
                class: 'btn-primary',
                action: () => {
                    setTimeout(() => {
                        // Bước 2: Cảnh báo và xác nhận khóa tháng
                        showModal(
                            'XÁC NHẬN KHÓA THÁNG',
                            `<p style="font-size: 14px; line-height: 1.6; color: var(--text-primary);">
                                Thao tác này sẽ **khóa ghi nhận tăng ca** của tháng ${month}.<br><br>
                                Sau khi khóa, nhân viên đăng ký OT trong tháng này sẽ phải được **Quản lý phê duyệt** mới được tính.<br><br>
                                Bạn có chắc chắn muốn khóa tháng ${month}?
                             </p>`,
                            [
                                {
                                    text: 'Hủy bỏ',
                                    class: 'btn-ghost',
                                    action: null
                                },
                                {
                                    text: 'Xác nhận khóa tháng',
                                    class: 'btn-warning',
                                    action: async () => {
                                        try {
                                            showToast('Đang thực hiện khóa tháng...');
                                            const res = await api('/api/records/close-month', 'POST', { month });
                                            showToast('Khóa tháng thành công!');
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
                    }, 50);
                }
            }
        ]
    );
}

let currentSystemSettings = {};

async function loadSystemSettings() {
    try {
        const settings = await api('/api/settings');
        if (settings) {
            currentSystemSettings = settings;
            OT_LUNCH_HOURS = Number(settings.lunchOTHours) || 1;
            WORK_END = settings.eveningOTStart || "16:30";
            

        }
    } catch (e) {
        console.error('Error loading system settings:', e);
    }
}





async function handleDatabaseCleanup() {
    const monthInput = document.getElementById('cleanup-month-input');
    if (!monthInput) return;
    const month = monthInput.value;
    if (!month) {
        showToast('Vui lòng chọn tháng cần dọn dẹp!', 'error');
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
                    const originalFilterVal = document.getElementById('report-filter-month').value;
                    document.getElementById('report-filter-month').value = month;
                    await exportExcel();
                    document.getElementById('report-filter-month').value = originalFilterVal;
                }
            },
            {
                text: 'Đã tải (Tiếp tục dọn dẹp)',
                class: 'btn-primary',
                action: () => {
                    setTimeout(() => {
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
                    }, 50);
                }
            }
        ]
    );
}

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
    setupEmployeeCustomActivitiesUI();
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
                items.push({ label: `OT Chiều (${otStart} - ${otEnd})`, value: `${parseFloat(eveningHours.toFixed(2))} giờ` });
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
                ticketEvening.innerHTML = `<span class="preview-active-badge">✓ ${otStart.value} - ${otEnd.value}</span> (${parseFloat(eveningHours.toFixed(2))} giờ)`;
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
        if (adminOtDateEl) adminOtDateEl.value = todayStr2;

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
                    <td>${r.note || '<span style="color:var(--text-muted)">—</span>'}</td>
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
                    ? `<span class="tag" style="background: rgba(245,158,11,0.15); color: #f59e0b; border: 1px solid rgba(245,158,11,0.3); font-weight: 500;">🚚 ${r.deliveryProvince || 'Chưa rõ'}</span>` 
                    : `<span class="tag" style="background: rgba(99,102,241,0.15); color: #6366f1; border: 1px solid rgba(99,102,241,0.3); font-weight: 500;">⏱️ ${r.totalHours.toFixed(1)}h</span>`;
                return `<tr>
                    <td>${formatDate(r.date)}</td>
                    <td><strong>${r.customActivity}</strong></td>
                    <td>${detail}</td>
                    <td><span class="status-badge ${badgeClass}">${badgeText}</span></td>
                    <td>${r.note || '<span style="color:var(--text-muted)">—</span>'}</td>
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
        const localVer = window.OT_LOCAL_VERSION || localStorage.getItem('ot_app_version') || '1.4.7';
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

        const localVer = window.OT_LOCAL_VERSION || localStorage.getItem('ot_app_version') || '1.4.7';
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

// ==================== EVENT LISTENERS ====================
document.addEventListener('DOMContentLoaded', () => {
    if (!isElectron) {
        document.body.classList.add('is-web-browser');
    }

    // Admin record type tab selector click handlers
    const btnAdminRecTypeOt = document.getElementById('btn-admin-rec-type-ot');
    const btnAdminRecTypeTrips = document.getElementById('btn-admin-rec-type-trips');
    if (btnAdminRecTypeOt && btnAdminRecTypeTrips) {
        btnAdminRecTypeOt.addEventListener('click', () => {
            currentAdminRecType = 'ot';
            btnAdminRecTypeOt.classList.remove('btn-ghost');
            btnAdminRecTypeOt.classList.add('btn-primary');
            btnAdminRecTypeTrips.classList.remove('btn-primary');
            btnAdminRecTypeTrips.classList.add('btn-ghost');
            refreshAdminRecords();
        });
        btnAdminRecTypeTrips.addEventListener('click', () => {
            currentAdminRecType = 'trips';
            btnAdminRecTypeTrips.classList.remove('btn-ghost');
            btnAdminRecTypeTrips.classList.add('btn-primary');
            btnAdminRecTypeOt.classList.remove('btn-primary');
            btnAdminRecTypeOt.classList.add('btn-ghost');
            refreshAdminRecords();
        });
    }

    // Employee record type tab selector click handlers
    const btnEmpRecTypeOt = document.getElementById('btn-emp-rec-type-ot');
    const btnEmpRecTypeTrips = document.getElementById('btn-emp-rec-type-trips');
    if (btnEmpRecTypeOt && btnEmpRecTypeTrips) {
        btnEmpRecTypeOt.addEventListener('click', () => {
            currentEmpRecType = 'ot';
            btnEmpRecTypeOt.classList.remove('btn-ghost');
            btnEmpRecTypeOt.classList.add('btn-primary');
            btnEmpRecTypeTrips.classList.remove('btn-primary');
            btnEmpRecTypeTrips.classList.add('btn-ghost');
            refreshEmployeeRecords();
        });
        btnEmpRecTypeTrips.addEventListener('click', () => {
            currentEmpRecType = 'trips';
            btnEmpRecTypeTrips.classList.remove('btn-ghost');
            btnEmpRecTypeTrips.classList.add('btn-primary');
            btnEmpRecTypeOt.classList.remove('btn-primary');
            btnEmpRecTypeOt.classList.add('btn-ghost');
            refreshEmployeeRecords();
        });
    }
    const otDateEl = document.getElementById('ot-date');
    if (otDateEl) {
        otDateEl.max = new Date().toISOString().split('T')[0];
        otDateEl.addEventListener('change', handleDateChange);
        otDateEl.addEventListener('input', handleDateChange);
    }

    // Populate provinces-datalist
    const provincesDatalist = document.getElementById('provinces-datalist');
    if (provincesDatalist) {
        provincesDatalist.innerHTML = PROVINCES.map(p => `<option value="${p}"></option>`).join('');
    }

    // Bind change/input listeners for Employee trip fields
    const otHasTrip = document.getElementById('ot-has-trip');
    const otProvinceGroup = document.getElementById('ot-province-group');
    const otProvinceInput = document.getElementById('ot-province');
    if (otHasTrip) {
        otHasTrip.addEventListener('change', function() {
            if (this.checked) {
                if (otProvinceGroup) otProvinceGroup.style.display = 'block';
                if (otProvinceInput) otProvinceInput.required = true;
            } else {
                if (otProvinceGroup) otProvinceGroup.style.display = 'none';
                if (otProvinceInput) {
                    otProvinceInput.required = false;
                    otProvinceInput.value = '';
                }
            }
            updateOTPreview();
        });
    }
    if (otProvinceInput) {
        otProvinceInput.addEventListener('input', updateOTPreview);
        otProvinceInput.addEventListener('change', updateOTPreview);
    }

    // Bind change/input listeners for Admin trip fields
    const adminOtHasTrip = document.getElementById('admin-ot-has-trip');
    const adminOtProvinceGroup = document.getElementById('admin-ot-province-group');
    const adminOtProvinceInput = document.getElementById('admin-ot-province');
    if (adminOtHasTrip) {
        adminOtHasTrip.addEventListener('change', function() {
            if (this.checked) {
                if (adminOtProvinceGroup) adminOtProvinceGroup.style.display = 'block';
                if (adminOtProvinceInput) adminOtProvinceInput.required = true;
            } else {
                if (adminOtProvinceGroup) adminOtProvinceGroup.style.display = 'none';
                if (adminOtProvinceInput) {
                    adminOtProvinceInput.required = false;
                    adminOtProvinceInput.value = '';
                }
            }
            updateAdminOTPreview();
        });
    }
    if (adminOtProvinceInput) {
        adminOtProvinceInput.addEventListener('input', updateAdminOTPreview);
        adminOtProvinceInput.addEventListener('change', updateAdminOTPreview);
    }

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

    // Kiểm tra qua 00h (đăng nhập ngày mới)
    checkMidnightLogout();

    // Thêm lắng nghe sự kiện focus cửa sổ để kiểm tra qua 00h
    window.addEventListener('focus', checkMidnightLogout);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            checkMidnightLogout();
        }
    });

    // Hàm khởi chạy bất đồng bộ để cấu hình Cloud, check version và tải dữ liệu dashboard
    async function runAsyncInit() {
        // Chạy kiểm tra chế độ ẩn danh ngầm trước để cache kết quả sẵn sàng
        isPrivateMode().catch(() => {});

        // 1. Cấu hình và đồng bộ hóa Cloud Server trước khi tải trang dashboard
        await initCloudConfig();

        // 2. Kiểm tra phiên bản và trạng thái session để quyết định tự động đăng nhập
        try {
            const versionRes = await fetch(`${localServerUrl}/api/version`);
            const versionData = await versionRes.json();
            const currentVersion = versionData.version || '1.0.0';

            const verEl = document.getElementById('login-version');
            if (verEl) {
                const valEl = verEl.querySelector('.login-ver-val');
                if (valEl) {
                    valEl.textContent = 'v' + currentVersion;
                } else {
                    verEl.textContent = 'Phiên bản v' + currentVersion;
                }
            }

            const storedVersion = localStorage.getItem('ot_app_version');
            const isSessionActive = sessionStorage.getItem('ot_session_active');

            // Nếu là phiên làm việc mới (app bị tắt hoàn toàn và bật lại)
            if (isElectron && !isSessionActive) {
                // Nếu không phải là cập nhật (phiên bản cũ và mới giống nhau)
                if (storedVersion === currentVersion) {
                    // Tắt app hoàn toàn và bật lại bản cũ -> bắt đăng nhập lại, dọn sạch session cũ
                    localStorage.removeItem('ot_current_user');
                    localStorage.removeItem('ot_login_date');
                    localStorage.removeItem('ot_mobile_user');
                    localStorage.removeItem('ot_login_time');
                    localStorage.removeItem('ot_auth_token');
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
                const valEl = verEl.querySelector('.login-ver-val');
                if (valEl) {
                    valEl.textContent = 'v' + (window.OT_LOCAL_VERSION || '1.4.7');
                } else {
                    verEl.textContent = 'Phiên bản v' + (window.OT_LOCAL_VERSION || '1.4.7');
                }
            }
        }

        // Force logout after 5 AM check
        const token = localStorage.getItem('ot_auth_token');
        if (token) {
            const parts = token.split('.');
            if (parts.length === 3) {
                try {
                    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
                    if (payload.iat) {
                        const now = new Date();
                        const today5AM = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 5, 0, 0, 0);
                        if (now.getTime() < today5AM.getTime()) {
                            today5AM.setDate(today5AM.getDate() - 1);
                        }
                        if ((payload.iat * 1000) < today5AM.getTime()) {
                            localStorage.removeItem('ot_auth_token');
                            localStorage.removeItem('ot_current_user');
                            window.location.reload();
                            return;
                        }
                    }
                } catch (e) {
                    localStorage.removeItem('ot_auth_token');
                    localStorage.removeItem('ot_current_user');
                    window.location.reload();
                    return;
                }
            }
        }

        // Tải dữ liệu dashboard nếu có user đã đăng nhập (Đọc lại sau khi đã dọn dẹp session mới nếu có)
        const currentUser = JSON.parse(localStorage.getItem('ot_current_user') || 'null');
        if (currentUser && token) {
            try {
                if (currentUser.role === 'admin') {
                    if (!currentUser.email) {
                        showEmailSetupOverlay(currentUser.username, (verifiedEmail) => {
                            currentUser.email = verifiedEmail;
                            localStorage.setItem('ot_current_user', JSON.stringify(currentUser));
                            localStorage.removeItem('ot_require_email_setup');
                            initAdminDashboard(currentUser);
                            showScreen('screen-admin');
                        });
                    } else {
                        await initAdminDashboard(currentUser);
                        showScreen('screen-admin');
                    }
                } else {
                    await initEmployeeDashboard(currentUser);
                    showScreen('screen-employee');
                }
            } catch (err) {
                console.error('[Dashboard] Lỗi khởi tạo dữ liệu:', err);
                if (isElectron) {
                    showScreen('screen-login');
                } else {
                    const needsOtPrefix = window.location.hostname.includes('github.io');
                    const mainPageUrl = needsOtPrefix ? '/OT/index.html' : '/index.html';
                    window.location.href = mainPageUrl;
                }
            }
        } else {
            // Nếu không có session trên bản Web, chuyển hướng thẳng về Landing Page
            if (!isElectron) {
                const needsOtPrefix = window.location.hostname.includes('github.io');
                const mainPageUrl = needsOtPrefix ? '/OT/index.html' : '/index.html';
                window.location.href = mainPageUrl;
            }
        }

        // Kết nối SSE để nhận sự kiện thời gian thực
        initSseConnection();
    }

    // Chạy các tác vụ Cloud & Data ngầm không làm block giao diện đăng nhập
    runAsyncInit();

    // Click events for stat cards
    const cardPendingOt = document.getElementById('stat-card-pending-ot');
    if (cardPendingOt) {
        cardPendingOt.addEventListener('click', () => {
            const recordsTab = document.querySelector('.admin-tab[data-admin-tab="records"]');
            if (recordsTab) recordsTab.click();
            const pendingSubTab = document.querySelector('.sub-tab[data-subtab="subtab-content-records-pending"]');
            if (pendingSubTab) pendingSubTab.click();
        });
    }

    const cardPendingUnlinks = document.getElementById('stat-card-pending-unlinks');
    if (cardPendingUnlinks) {
        cardPendingUnlinks.addEventListener('click', () => {
            const usersTab = document.querySelector('.admin-tab[data-admin-tab="users"]');
            if (usersTab) usersTab.click();
            const employeesSubTab = document.querySelector('.sub-tab[data-subtab="subtab-content-employees"]');
            if (employeesSubTab) employeesSubTab.click();
        });
    }

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
            
            // Cập nhật tiêu đề header động
            const headerTitleEl = document.getElementById('admin-header-title');
            if (headerTitleEl) {
                const spanText = tab.querySelector('span');
                if (spanText) {
                    headerTitleEl.textContent = spanText.textContent;
                }
            }
        });
    });

    // Employee tabs
    document.querySelectorAll('.emp-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.emp-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.emp-tab-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            const targetContent = document.getElementById(`emp-tab-${tab.dataset.empTab}`);
            if (targetContent) {
                targetContent.classList.add('active');
            }
            
            // Cập nhật tiêu đề header động
            const headerTitleEl = document.getElementById('emp-header-title');
            if (headerTitleEl) {
                const spanText = tab.querySelector('span');
                if (spanText) {
                    headerTitleEl.textContent = spanText.textContent;
                }
            }
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
            const syncAdminOtEnd = () => {
                const startVal = adminOtStart.value;
                const endVal = document.getElementById('admin-ot-end').value;
                if (startVal && endVal) {
                    const s = timeToMinutes(startVal);
                    const e = timeToMinutes(endVal);
                    if (e <= s) {
                        document.getElementById('admin-ot-end').value = startVal;
                    }
                }
            };
            adminOtStart.addEventListener('change', syncAdminOtEnd);
            adminOtStart.addEventListener('input', syncAdminOtEnd);
        }
        const adminOtBackfill = document.getElementById('admin-ot-backfill');
        if (adminOtBackfill) {
            adminOtBackfill.addEventListener('change', function() {
                const normalInputs = document.getElementById('admin-ot-normal-inputs');
                const backfillGroup = document.getElementById('admin-ot-backfill-hours-group');
                const customActGroup = document.getElementById('admin-ot-custom-activity-group');
                if (this.checked) {
                    if (normalInputs) normalInputs.style.display = 'none';
                    if (backfillGroup) backfillGroup.style.display = 'block';
                    if (customActGroup) customActGroup.style.display = 'none';
                    const lunchEl = document.getElementById('admin-ot-lunch');
                    if (lunchEl) lunchEl.checked = false;
                    const startEl = document.getElementById('admin-ot-start');
                    if (startEl) startEl.value = WORK_END;
                    const endEl = document.getElementById('admin-ot-end');
                    if (endEl) endEl.value = WORK_END;
                } else {
                    if (normalInputs) normalInputs.style.display = 'block';
                    if (backfillGroup) backfillGroup.style.display = 'none';
                    const targetSelf = document.getElementById('admin-ot-target-self');
                    let userId = '';
                    if (targetSelf && !targetSelf.checked) {
                        userId = document.getElementById('admin-ot-user').value;
                    }
                    setupAdminCustomActivitiesUI(userId);
                }
            });
        }
        const adminOtTargetSelf = document.getElementById('admin-ot-target-self');
        const adminOtTargetEmp = document.getElementById('admin-ot-target-emp');
        if (adminOtTargetSelf && adminOtTargetEmp) {
            const userGroup = document.getElementById('admin-ot-user-group');
            const userSelect = document.getElementById('admin-ot-user');
            adminOtTargetSelf.addEventListener('change', function() {
                if (this.checked) {
                    if (userGroup) userGroup.style.display = 'none';
                    if (userSelect) {
                        userSelect.required = false;
                        userSelect.value = '';
                    }
                    setupAdminCustomActivitiesUI('');
                }
            });
            adminOtTargetEmp.addEventListener('change', function() {
                if (this.checked) {
                    if (userGroup) userGroup.style.display = 'block';
                    if (userSelect) {
                        userSelect.required = true;
                    }
                    setupAdminCustomActivitiesUI(userSelect.value);
                }
            });
            if (userSelect) {
                userSelect.addEventListener('change', function() {
                    setupAdminCustomActivitiesUI(this.value);
                });
            }
        }

        // Live preview listeners
        const previewTriggerEls = [
            'admin-ot-target-self', 'admin-ot-target-emp', 'admin-ot-user',
            'admin-ot-date', 'admin-ot-backfill', 'admin-ot-backfill-hours',
            'admin-ot-lunch', 'admin-ot-start', 'admin-ot-end', 'admin-ot-note'
        ];
        previewTriggerEls.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('change', updateAdminOTPreview);
                el.addEventListener('input', updateAdminOTPreview);
            }
        });
        const adminOtDateEl = document.getElementById('admin-ot-date');
        if (adminOtDateEl) {
            adminOtDateEl.addEventListener('change', handleAdminDateChange);
            adminOtDateEl.addEventListener('input', handleAdminDateChange);
        }
        
        // Initial preview render call
        setTimeout(updateAdminOTPreview, 100);
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
    document.getElementById('ot-lunch').addEventListener('input', updateOTPreview);
    document.getElementById('ot-start').addEventListener('change', updateOTPreview);
    document.getElementById('ot-start').addEventListener('input', updateOTPreview);
    document.getElementById('ot-end').addEventListener('change', updateOTPreview);
    document.getElementById('ot-end').addEventListener('input', updateOTPreview);

    const syncOtEnd = () => {
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
    };
    document.getElementById('ot-start').addEventListener('change', syncOtEnd);
    document.getElementById('ot-start').addEventListener('input', syncOtEnd);

    const otBackfill = document.getElementById('ot-backfill');
    if (otBackfill) {
        otBackfill.addEventListener('change', function() {
            const normalInputs = document.getElementById('ot-normal-inputs');
            const backfillGroup = document.getElementById('ot-backfill-hours-group');
            const customActGroup = document.getElementById('ot-custom-activity-group');
            if (this.checked) {
                if (normalInputs) normalInputs.style.display = 'none';
                if (backfillGroup) backfillGroup.style.display = 'block';
                if (customActGroup) customActGroup.style.display = 'none';
                const lunchEl = document.getElementById('ot-lunch');
                if (lunchEl) lunchEl.checked = false;
                const startEl = document.getElementById('ot-start');
                if (startEl) startEl.value = WORK_END;
                const endEl = document.getElementById('ot-end');
                if (endEl) endEl.value = WORK_END;
            } else {
                if (normalInputs) normalInputs.style.display = 'block';
                if (backfillGroup) backfillGroup.style.display = 'none';
                setupEmployeeCustomActivitiesUI();
            }
            updateOTPreview();
        });
    }
    const otBackfillHours = document.getElementById('ot-backfill-hours');
    if (otBackfillHours) {
        otBackfillHours.addEventListener('input', updateOTPreview);
        otBackfillHours.addEventListener('change', updateOTPreview);
    }

    // Filters
    document.getElementById('admin-filter-month').addEventListener('change', refreshAdminRecords);
    const adminFilterDate = document.getElementById('admin-filter-date');
    if (adminFilterDate) {
        adminFilterDate.addEventListener('change', refreshAdminRecords);
    }
    document.getElementById('admin-filter-user').addEventListener('change', refreshAdminRecords);
    document.getElementById('admin-search-user').addEventListener('input', refreshAdminRecords);
    document.getElementById('admin-search-note').addEventListener('input', refreshAdminRecords);
    document.getElementById('emp-filter-month').addEventListener('change', refreshEmployeeRecords);
    document.getElementById('report-filter-month').addEventListener('change', refreshReport);

    const adminFilterTeam = document.getElementById('admin-filter-team');
    if (adminFilterTeam) {
        adminFilterTeam.addEventListener('change', refreshAdminRecords);
    }
    const reportFilterTeam = document.getElementById('report-filter-team');
    if (reportFilterTeam) {
        reportFilterTeam.addEventListener('change', refreshReport);
    }

    const reportSearch = document.getElementById('report-search-name');
    if (reportSearch) {
        reportSearch.addEventListener('input', (e) => {
            reportSearchQuery = e.target.value;
            refreshReport();
        });
    }

    const handleReportSort = (column) => {
        if (reportSortColumn === column) {
            reportSortOrder = reportSortOrder === 'asc' ? 'desc' : 'asc';
        } else {
            reportSortColumn = column;
            reportSortOrder = 'desc';
        }
        refreshReport();
    };

    const thName = document.getElementById('th-report-name');
    if (thName) thName.addEventListener('click', () => handleReportSort('name'));

    const thDays = document.getElementById('th-report-days');
    if (thDays) thDays.addEventListener('click', () => handleReportSort('days'));

    const thTotal = document.getElementById('th-report-total');
    if (thTotal) thTotal.addEventListener('click', () => handleReportSort('total'));

    // Export & Cleanup
    document.getElementById('btn-export').addEventListener('click', exportExcel);
    document.getElementById('btn-close-month').addEventListener('click', handleCloseMonth);

    // Toggle Report Charts
    const btnToggleCharts = document.getElementById('btn-toggle-charts');
    const chartsPanel = document.getElementById('charts-panel');
    if (btnToggleCharts && chartsPanel) {
        // Restore state on load
        const savedShowCharts = localStorage.getItem('ot_show_report_charts') === 'true';
        if (savedShowCharts) {
            chartsPanel.style.display = 'block';
            btnToggleCharts.style.backgroundColor = '#10b981';
            btnToggleCharts.style.borderColor = '#10b981';
            btnToggleCharts.style.color = '#ffffff';
        }
        
        btnToggleCharts.addEventListener('click', () => {
            const isHidden = chartsPanel.style.display === 'none' || !chartsPanel.style.display;
            if (isHidden) {
                chartsPanel.style.display = 'block';
                btnToggleCharts.style.backgroundColor = '#10b981';
                btnToggleCharts.style.borderColor = '#10b981';
                btnToggleCharts.style.color = '#ffffff';
                localStorage.setItem('ot_show_report_charts', 'true');
            } else {
                chartsPanel.style.display = 'none';
                btnToggleCharts.style.backgroundColor = '#27272a';
                btnToggleCharts.style.borderColor = '#3f3f46';
                btnToggleCharts.style.color = '#e4e4e7';
                localStorage.setItem('ot_show_report_charts', 'false');
            }
        });
    }
    const btnCleanupDatabase = document.getElementById('btn-cleanup-database');
    if (btnCleanupDatabase) {
        btnCleanupDatabase.addEventListener('click', handleDatabaseCleanup);
    }
    const btnSaveCompanySettings = document.getElementById('btn-save-company-settings');
    if (btnSaveCompanySettings) {
        btnSaveCompanySettings.addEventListener('click', saveCompanySettings);
    }

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

    // Team Settings trigger
    const btnTeamSettings = document.getElementById('btn-team-settings');
    if (btnTeamSettings) {
        btnTeamSettings.addEventListener('click', openTeamSettingsModal);
    }

});

// ==================== DYNAMIC DIALOGS (ADD/EDIT) ====================
async function editRecordDialog(recordId, source) {
    try {
        let record = loadedRecords.find(r => r.id === recordId);
        if (!record) {
            const data = await api(`/api/records`);
            loadedRecords = data.records || [];
            record = loadedRecords.find(r => r.id === recordId);
        }
        if (!record) return showToast('Không tìm thấy bản ghi', 'error');

        const isBackfill = record.isBackfill || (record.note && (record.note.includes('[BÙ THÁNG TRƯỚC]') || record.note.includes('[TĂNG THÁNG NÀY]')));
        const cleanedNote = record.note ? record.note.replace('[BÙ THÁNG TRƯỚC] ', '').replace('[BÙ THÁNG TRƯỚC]', '').replace('[TĂNG THÁNG NÀY] ', '').replace('[TĂNG THÁNG NÀY]', '').trim() : '';

        const body = `
        <form id="modal-form-record" class="login-form active" style="text-align: left; padding: 0;">
            <div class="form-group" style="margin-bottom: 15px;">
                <label style="display:block;margin-bottom:6px;font-weight:600;">Ngày tăng ca</label>
                <div class="input-wrapper">
                    <input type="date" id="modal-rec-date" value="${record.date}" max="${new Date().toISOString().split('T')[0]}" style="padding-left:12px; height:38px; border-radius:8px;" required>
                </div>
            </div>
            <div class="form-group" style="margin-bottom: 15px;">
                <label class="switch-label" for="modal-rec-backfill">
                    <input type="checkbox" id="modal-rec-backfill" ${isBackfill ? 'checked' : ''}>
                    <span class="switch-slider"></span>
                    <span class="switch-text">Bù tăng ca</span>
                </label>
            </div>

            <!-- Backfill hours input -->
            <div class="form-group" id="modal-rec-backfill-hours-group" style="display: ${isBackfill ? 'block' : 'none'}; margin-bottom: 15px;">
                <label style="display:block;margin-bottom:6px;font-weight:600;">Số giờ tăng ca cần bù</label>
                <input type="number" id="modal-rec-backfill-hours" step="0.1" min="0.1" max="24" value="${isBackfill ? record.totalHours : ''}" placeholder="Nhập số giờ bù (ví dụ: 8.0)" class="input-sm" style="width:100%; box-sizing:border-box; height:38px; border-radius:8px;">
            </div>

            <!-- Normal OT inputs -->
            <div id="modal-rec-normal-inputs" style="display: ${isBackfill ? 'none' : 'block'};">
                <div class="form-group" style="margin-bottom: 15px;">
                    <label class="switch-label" for="modal-rec-lunch">
                        <input type="checkbox" id="modal-rec-lunch" ${record.hasLunchOT ? 'checked' : ''}>
                        <span class="switch-slider"></span>
                        <span class="switch-text">Tăng ca trưa (12:20 - 13:20)</span>
                    </label>
                </div>
                <div class="form-group" style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 15px;">
                    <div>
                        <label style="display:block;margin-bottom:6px;font-weight:600;">Bắt đầu OT chiều</label>
                        <input type="time" id="modal-rec-start" value="${record.otStart || WORK_END}" class="input-sm" style="width:100%; box-sizing:border-box; height:38px; border-radius:8px;">
                    </div>
                    <div>
                        <label style="display:block;margin-bottom:6px;font-weight:600;">Kết thúc OT chiều</label>
                        <input type="time" id="modal-rec-end" value="${record.otEnd || WORK_END}" class="input-sm" style="width:100%; box-sizing:border-box; height:38px; border-radius:8px;">
                    </div>
                </div>
            </div>

            <!-- Nhóm Hoạt động ngoài giờ tùy chỉnh (Sửa) -->
            <div id="modal-rec-custom-activity-group" style="display: none; margin-bottom: 15px;">
                <div id="modal-rec-custom-activities-list"></div>
            </div>

            <div class="form-group" style="margin-bottom: 0;">
                <label style="font-weight: 600; display: block; margin-bottom: 6px;">Lý do tăng ca</label>
                <select id="modal-rec-note" class="input-sm" style="width:100%; height:38px; border-radius:8px; box-sizing:border-box;" required></select>
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

                // Get selected custom activity info
                const checkedAct = document.querySelector('.modal-rec-custom-activity-checkbox:checked');
                const customActivity = checkedAct ? checkedAct.dataset.actName : '';
                const customActivityMode = checkedAct ? checkedAct.dataset.actMode : '';
                
                const detailGroup = checkedAct ? document.getElementById(`modal-rec-custom-activity-detail-group-${checkedAct.dataset.actId}`) : null;
                const detailInput = detailGroup ? detailGroup.querySelector('.modal-rec-custom-activity-detail') : null;
                const detailValue = detailInput ? detailInput.value.trim() : '';

                if (checkedAct && !detailValue) {
                    return showToast('Vui lòng nhập chi tiết cho hoạt động ngoài giờ!', 'error');
                }

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
                    if (totalHours <= 0 && !checkedAct) return showToast('Vui lòng chọn ít nhất một loại OT hoặc hoạt động ngoài giờ!', 'error');
                }

                const deliveryProvince = checkedAct && customActivityMode === 'trip' ? detailValue : '';

                if (checkedAct && totalHours === 0 && !note) {
                    note = `${customActivity} ${detailValue}`;
                } else if (!note) {
                    return showToast('Vui lòng nhập ghi chú!', 'error');
                }

                try {
                    await api(`/api/records/${recordId}`, 'PUT', {
                        date,
                        hasLunchOT: isRecBackfill ? false : hasLunch,
                        otStart: (!isRecBackfill && eveningHours > 0) ? otStart : '',
                        otEnd: (!isRecBackfill && eveningHours > 0) ? otEnd : '',
                        eveningOTHours: eveningHours,
                        totalHours,
                        deliveryProvince,
                        customActivity,
                        calcMode: customActivityMode || (record.calcMode || ''),
                        note,
                        isBackfill: isRecBackfill,
                        createdMonth: isRecBackfill ? getCurrentMonth() : date.substring(0, 7)
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

        // Load custom activities list in edit modal
        const listContainer = document.getElementById('modal-rec-custom-activities-list');
        const activityGroup = document.getElementById('modal-rec-custom-activity-group');
        
        const currentUser = JSON.parse(localStorage.getItem('ot_current_user') || 'null');
        let userTeam = '';
        if (currentUser && currentUser.role === 'employee') {
            userTeam = currentUser.team || '';
        } else {
            const foundUser = loadedUsers.find(u => u.id === record.userId);
            userTeam = foundUser ? (foundUser.team || '') : '';
        }
        
        const teamObj = TEAMS.find(t => typeof t === 'object' && t.name === userTeam);
        const activities = (teamObj && teamObj.customActivities) ? teamObj.customActivities : [];
        
        if (activities.length > 0) {
            if (activityGroup) activityGroup.style.display = isBackfill ? 'none' : 'block';
            
            let activeActName = record.customActivity || '';
            // Backward compatibility: map legacy travel record to the first trip activity
            if (!activeActName && record.deliveryProvince) {
                const firstTripAct = activities.find(a => a.calcMode === 'trip');
                activeActName = firstTripAct ? firstTripAct.name : (activities[0]?.name || '');
            }
            
            if (listContainer) {
                listContainer.innerHTML = activities.map(act => {
                    const isSelected = act.name === activeActName;
                    const detailValue = isSelected ? (record.deliveryProvince || '') : '';
                    
                    return `
                    <div class="custom-activity-item" style="margin-bottom: 14px; text-align: left;">
                        <label class="switch-label" for="modal-chk-${act.id}" style="display: inline-flex; align-items: center; gap: 12px; cursor: pointer;">
                            <input type="checkbox" id="modal-chk-${act.id}" class="modal-rec-custom-activity-checkbox" data-act-id="${act.id}" data-act-name="${act.name}" data-act-mode="${act.calcMode}" onchange="toggleModalCustomActivityInput('${act.id}')" ${isSelected ? 'checked' : ''}>
                            <span class="switch-slider"></span>
                            <span class="switch-text" style="display: flex; flex-direction: column; gap: 2px;">
                                <strong>${act.name}</strong>
                                <small style="font-size: 11px; color: var(--text-secondary);">Tính chất: ${act.calcMode === 'trip' ? 'Tính theo Chuyến' : 'Tính theo Giờ'}</small>
                            </span>
                        </label>
                        <div class="form-group" id="modal-rec-custom-activity-detail-group-${act.id}" style="display: ${isSelected ? 'block' : 'none'}; margin-top: 8px; padding: 0 4px; margin-bottom: 0;">
                            <label style="display:block; margin-bottom:6px; font-size:13px; font-weight:600; color:var(--text-secondary);">${act.detailLabel || 'Chi tiết'}</label>
                            <input type="text" class="modal-rec-custom-activity-detail" data-act-id="${act.id}" placeholder="${act.placeholder || 'Nhập chi tiết...'}" value="${detailValue}" style="width: 100%; height: 38px; background: rgba(0,0,0,0.2); color: #fff; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; padding: 0 10px; font-size: 14px;">
                        </div>
                    </div>
                `}).join('');
            }
            
            // Adjust note requirement based on whether any activity is selected initially
            const noteEl = document.getElementById('modal-rec-note');
            if (activeActName && noteEl) {
                noteEl.required = false;
                noteEl.placeholder = `Mặc định: ${activeActName}...`;
            }
        } else {
            if (activityGroup) activityGroup.style.display = 'none';
        }

        const modalBackfill = document.getElementById('modal-rec-backfill');
        if (modalBackfill) {
            modalBackfill.addEventListener('change', function() {
                const normalInputs = document.getElementById('modal-rec-normal-inputs');
                const backfillGroup = document.getElementById('modal-rec-backfill-hours-group');
                const customActGroup = document.getElementById('modal-rec-custom-activity-group');
                if (this.checked) {
                    if (normalInputs) normalInputs.style.display = 'none';
                    if (backfillGroup) backfillGroup.style.display = 'block';
                    if (customActGroup) customActGroup.style.display = 'none';
                    // Uncheck custom activities
                    document.querySelectorAll('.modal-rec-custom-activity-checkbox').forEach(c => {
                        c.checked = false;
                        const dg = document.getElementById(`modal-rec-custom-activity-detail-group-${c.dataset.actId}`);
                        if (dg) dg.style.display = 'none';
                    });
                    const lunchEl = document.getElementById('modal-rec-lunch');
                    if (lunchEl) lunchEl.checked = false;
                    const startEl = document.getElementById('modal-rec-start');
                    if (startEl) startEl.value = WORK_END;
                    const endEl = document.getElementById('modal-rec-end');
                    if (endEl) endEl.value = WORK_END;
                } else {
                    if (normalInputs) normalInputs.style.display = 'block';
                    if (customActGroup && activities.length > 0) customActGroup.style.display = 'block';
                    if (backfillGroup) backfillGroup.style.display = 'none';
                }
            });
        }

        const modalStart = document.getElementById('modal-rec-start');
        const modalEnd = document.getElementById('modal-rec-end');
        if (modalStart && modalEnd) {
            const syncModalEnd = () => {
                const s = timeToMinutes(modalStart.value);
                const e = timeToMinutes(modalEnd.value);
                if (e <= s) {
                    modalEnd.value = modalStart.value;
                }
            };
            modalStart.addEventListener('change', syncModalEnd);
            modalStart.addEventListener('input', syncModalEnd);
        }
        
        const modalRecLunch = document.getElementById('modal-rec-lunch');
        const modalRecNote = document.getElementById('modal-rec-note');
        const updateModalPredefinedReasons = () => {
            const isLunchChecked = modalRecLunch ? modalRecLunch.checked : false;
            setupPredefinedReasonsSelect(userTeam, modalRecNote, isLunchChecked);
        };
        if (modalRecLunch) {
            modalRecLunch.addEventListener('change', updateModalPredefinedReasons);
        }
        updateModalPredefinedReasons();
        if (modalRecNote) {
            modalRecNote.value = cleanedNote;
        }
    } catch (e) {
        showToast('Lỗi tải dữ liệu bản ghi', 'error');
    }
}

async function addUserDialog() {
    let admins = [];
    if (loadedUsers && loadedUsers.length > 0) {
        admins = loadedUsers.filter(u => u.role === 'admin');
    } else {
        try {
            const uData = await api('/api/users');
            loadedUsers = uData.users || [];
            admins = loadedUsers.filter(u => u.role === 'admin');
        } catch (e) {
            console.error('Lỗi lấy danh sách admin:', e);
        }
    }
    const currentUser = JSON.parse(localStorage.getItem('ot_current_user') || 'null');
    const isAdmin = currentUser && (currentUser.username === 'admin' || currentUser.isSuperAdmin);

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
            <label style="display:block;margin-bottom:6px;font-weight:600;">Địa chỉ Email</label>
            <input type="email" id="modal-user-email" placeholder="ten-cua-ban@company.com" class="input-sm" style="width:100%; box-sizing:border-box;">
        </div>
        <div class="form-group" id="modal-user-password-group" style="margin-bottom: 15px;">
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
            <label style="display:block;margin-bottom:6px;font-weight:600;">Team</label>
            <select id="modal-user-team" class="input-sm" style="width:100%; box-sizing:border-box;">
                <option value="">-- Chưa phân team --</option>
                ${isAdmin ? '<option value="admin">admin</option>' : ''}
                ${TEAMS.map(t => {
                    const name = typeof t === 'string' ? t : (t.name || '');
                    return `<option value="${name}">${name}</option>`;
                }).join('')}
            </select>
        </div>
    </form>`;

    showModal('Thêm nhân viên mới', body, [
        { text: 'Hủy', class: 'btn-ghost' },
        { text: 'Thêm', class: 'btn btn-primary btn-sm', action: async () => {
            const fullname = document.getElementById('modal-user-fullname').value.trim();
            const username = document.getElementById('modal-user-username').value.trim();
            const email = document.getElementById('modal-user-email') ? document.getElementById('modal-user-email').value.trim() : '';
            const password = document.getElementById('modal-user-password').value;
            const role = document.getElementById('modal-user-role').value;
            const team = document.getElementById('modal-user-team') ? document.getElementById('modal-user-team').value : '';

            if (!fullname || !username) return showToast('Vui lòng điền họ tên và tên đăng nhập!', 'error');
            if (username.length < 3) return showToast('Tên đăng nhập tối thiểu 3 ký tự!', 'error');
            if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showToast('Địa chỉ Email không hợp lệ!', 'error');
            
            if (role === 'admin') {
                if (!password) return showToast('Tài khoản quản lý bắt buộc phải nhập mật khẩu!', 'error');
                if (password.length < 4) return showToast('Mật khẩu tối thiểu 4 ký tự!', 'error');
            }

            try {
                await api('/api/auth/register', 'POST', { fullname, username, password: password || '123', role, team, email });
                showToast('Thêm nhân viên thành công!');
                await Promise.all([populateUserFilter(), refreshAdminUsers(), refreshAdminStats(), refreshReport()]);
            } catch (err) {
                showToast(err.message, 'error');
            }
        }}
    ]);

    const roleSelect = document.getElementById('modal-user-role');
    const passwordGroup = document.getElementById('modal-user-password-group');
    if (roleSelect && passwordGroup) {
        const togglePassword = () => {
            if (roleSelect.value === 'employee') {
                passwordGroup.style.display = 'none';
                document.getElementById('modal-user-password').value = '';
            } else {
                passwordGroup.style.display = 'block';
            }
        };
        roleSelect.addEventListener('change', togglePassword);
        togglePassword();
    }
}

async function editUserDialog(userId) {
    try {
        const currentUser = JSON.parse(localStorage.getItem('ot_current_user') || 'null');
        const isSuperAdmin = currentUser && (currentUser.username === 'admin' || currentUser.isSuperAdmin);
        const isBelongToAdminTeam = currentUser && (currentUser.team === 'admin' || currentUser.username === 'admin' || currentUser.isSuperAdmin);

        let user = loadedUsers.find(u => u.id === userId);
        if (!user) {
            const data = await api('/api/users');
            loadedUsers = data.users || [];
            user = loadedUsers.find(u => u.id === userId);
        }
        if (!user) return showToast('Không tìm thấy nhân viên', 'error');

        // Chỉ có bản thân Quản trị viên tối cao mới được sửa thông tin của chính mình
        if (user.isSuperAdmin && currentUser.id !== user.id) {
            return showToast('Bạn không có quyền chỉnh sửa tài khoản Quản trị viên tối cao!', 'error');
        }

        // Phân quyền: các quản lý không được sửa thông tin của nhau, chỉ có superadmin mới được sửa thông tin quản lý
        if (user.role === 'admin' && currentUser.id !== user.id && !isSuperAdmin) {
            return showToast('Chỉ có Quản trị viên tối cao mới được chỉnh sửa tài khoản của quản lý khác!', 'error');
        }

        const body = `
        <form id="modal-form-edit-user" style="text-align: left; padding: 5px; display: flex; flex-direction: column; gap: 18px; font-family: 'Inter', sans-serif; color: #e4e4e7;">
            <!-- Grid for Basic Fields -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                <div class="form-group" style="display: flex; flex-direction: column; gap: 6px;">
                    <label style="font-size: 0.85rem; font-weight: 600; color: #a1a1aa;">Họ và tên</label>
                    <input type="text" id="modal-user-fullname" value="${user.fullname}" class="input-sm" style="width:100%; box-sizing:border-box; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 10px; color: #fff; transition: all 0.3s;" required>
                </div>
                <div class="form-group" style="display: flex; flex-direction: column; gap: 6px;">
                    <label style="font-size: 0.85rem; font-weight: 600; color: #a1a1aa;">Tên đăng nhập</label>
                    <input type="text" id="modal-user-username" value="${user.username}" class="input-sm" style="width:100%; box-sizing:border-box; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 10px; color: #fff; transition: all 0.3s;" required>
                </div>
            </div>

            <!-- Email Field (Crucial, styled nicely) -->
            <div class="form-group" style="display: flex; flex-direction: column; gap: 6px;">
                <label style="font-size: 0.85rem; font-weight: 600; color: #a1a1aa;">Địa chỉ Email</label>
                <div style="position: relative;">
                    <input type="email" id="modal-user-email" value="${user.email || ''}" placeholder="ten-cua-ban@company.com" class="input-sm" style="width:100%; box-sizing:border-box; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 10px 10px 10px 38px; color: #fff; transition: all 0.3s;">
                    <span style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: #71717a;">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                    </span>
                </div>
            </div>

            <!-- Role & Team (Hidden for SuperAdmin or when editing yourself, shown for others) -->
            <div id="modal-edit-user-role-team-group" style="display: ${(user.isSuperAdmin || currentUser.id === user.id) ? 'none' : 'grid'}; grid-template-columns: 1fr 1fr; gap: 15px;">
                <div class="form-group" style="display: flex; flex-direction: column; gap: 6px;">
                    <label style="font-size: 0.85rem; font-weight: 600; color: #a1a1aa;">Vai trò</label>
                    <select id="modal-user-role" class="input-sm" style="width:100%; box-sizing:border-box; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 10px; color: #fff; height: 42px;">
                        <option value="employee" ${user.role === 'employee' ? 'selected' : ''}>Nhân viên (Điện thoại)</option>
                        <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Quản lý (Desktop)</option>
                    </select>
                </div>
                <div class="form-group" id="modal-edit-user-manager-group" style="display: flex; flex-direction: column; gap: 6px;">
                    <label style="font-size: 0.85rem; font-weight: 600; color: #a1a1aa;">Team</label>
                    <select id="modal-user-team" class="input-sm" style="width:100%; box-sizing:border-box; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 10px; color: #fff; height: 42px;">
                        <option value="">-- Chưa phân team --</option>
                        ${isSuperAdmin ? `<option value="admin" ${user.team === 'admin' ? 'selected' : ''}>admin</option>` : ''}
                        ${TEAMS.map(t => {
                            const name = typeof t === 'string' ? t : (t.name || '');
                            return `<option value="${name}" ${user.team === name ? 'selected' : ''}>${name}</option>`;
                        }).join('')}
                    </select>
                </div>
            </div>

            <!-- Password Reset Section -->
            <div id="modal-user-password-trigger-wrapper" style="margin-top: 5px;">
                <button type="button" id="btn-change-password-trigger" style="width:100%; display: flex; align-items: center; justify-content: center; gap: 8px; background: rgba(255, 255, 255, 0.04); border: 1px dashed rgba(255, 255, 255, 0.2); border-radius: 8px; color: #e4e4e7; padding: 12px; font-weight: 600; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.08)'; this.style.borderColor='rgba(255,255,255,0.3)';" onmouseout="this.style.background='rgba(255,255,255,0.04)'; this.style.borderColor='rgba(255,255,255,0.2)';">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" style="color: #fbbf24;"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
                    Đổi mật khẩu tài khoản
                </button>
            </div>
            <div class="form-group" id="modal-user-password-group" style="display: none; flex-direction: column; gap: 6px; animation: fadeIn 0.3s ease;">
                <label style="font-size: 0.85rem; font-weight: 600; color: #ef4444;">Mật khẩu mới</label>
                <input type="password" id="modal-user-password" placeholder="Nhập mật khẩu mới" class="input-sm" style="width:100%; box-sizing:border-box; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 10px; color: #fff;">
            </div>

            <!-- OTP Verification Section -->
            <div id="modal-otp-verification-section" style="display: none; background: rgba(16, 185, 129, 0.05); border: 1px solid rgba(16, 185, 129, 0.2); border-radius: 12px; padding: 15px; margin-top: 5px; animation: fadeIn 0.3s ease;">
                <label style="display: flex; align-items: center; gap: 6px; font-size: 0.9rem; font-weight: 700; color: #10b981; margin-bottom: 10px;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="16" height="16"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                    Xác thực thay đổi qua OTP
                </label>
                <div style="display: flex; gap: 10px; margin-bottom: 8px;">
                    <input type="text" id="modal-verification-otp" placeholder="Nhập mã OTP" class="input-sm" style="flex: 1; text-align: center; font-size: 1.1rem; letter-spacing: 4px; font-weight: bold; background: rgba(0,0,0,0.2); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 8px; padding: 8px; color: #fff;" maxlength="6" oninput="this.value = this.value.replace(/[^0-9]/g, '')">
                    <button type="button" id="btn-send-verification-otp" style="background: #10b981; color: #020604; border: none; border-radius: 8px; padding: 0 16px; font-weight: bold; cursor: pointer; transition: all 0.2s; white-space: nowrap;" onmouseover="this.style.background='#059669';" onmouseout="this.style.background='#10b981';">Gửi OTP</button>
                </div>
                <p style="font-size: 0.8rem; color: #a1a1aa; margin: 0;" id="verification-otp-status"></p>
            </div>
        </form>`;

        showModal('Sửa thông tin nhân viên', body, [
            { text: 'Hủy', class: 'btn-ghost' },
            { text: 'Lưu', class: 'btn btn-primary btn-sm', action: async () => {
                const fullname = document.getElementById('modal-user-fullname').value.trim();
                const username = document.getElementById('modal-user-username').value.trim();
                const passwordGroupEl = document.getElementById('modal-user-password-group');
                const password = passwordGroupEl && passwordGroupEl.style.display !== 'none' ? document.getElementById('modal-user-password').value : '';
                const role = document.getElementById('modal-user-role') ? document.getElementById('modal-user-role').value : user.role;
                const team = document.getElementById('modal-user-team') ? document.getElementById('modal-user-team').value : user.team;
                const email = document.getElementById('modal-user-email').value.trim();

                const otpSection = document.getElementById('modal-otp-verification-section');
                const isOtpVisible = otpSection && otpSection.style.display !== 'none';
                const otpVal = isOtpVisible ? document.getElementById('modal-verification-otp').value.trim() : '';

                if (!fullname || !username) return showToast('Vui lòng điền họ tên và tên đăng nhập!', 'error');
                if (username.length < 3) return showToast('Tên đăng nhập tối thiểu 3 ký tự!', 'error');
                if (isOtpVisible && !otpVal) return showToast('Vui lòng nhập mã OTP xác thực thay đổi!', 'error');

                const payload = { fullname, username, role, team, email };
                if (password) {
                    if (password.length < 4) return showToast('Mật khẩu tối thiểu 4 ký tự!', 'error');
                    payload.password = password;
                }
                if (isOtpVisible) {
                    payload.otpCode = otpVal;
                }

                try {
                    await api(`/api/users/${userId}`, 'PUT', payload);
                    showToast('Cập nhật nhân viên thành công!');
                    if (currentUser && currentUser.id === userId) {
                        const updatedUser = { ...currentUser, fullname, username, role, team };
                        localStorage.setItem('ot_current_user', JSON.stringify(updatedUser));
                        const elUserName = document.getElementById('user-fullname');
                        if (elUserName) elUserName.textContent = fullname;
                    }
                    await Promise.all([populateUserFilter(), refreshAdminUsers(), refreshAdminRecords(), refreshReport(), refreshAdminStats()]);
                } catch (err) {
                    showToast(err.message, 'error');
                }
            }}
        ]);

        const passwordTrigger = document.getElementById('btn-change-password-trigger');
        const passwordGroup = document.getElementById('modal-user-password-group');
        const passwordTriggerWrapper = document.getElementById('modal-user-password-trigger-wrapper');
        const otpSection = document.getElementById('modal-otp-verification-section');
        const emailInput = document.getElementById('modal-user-email');
        const otpStatus = document.getElementById('verification-otp-status');
        const btnSendOtp = document.getElementById('btn-send-verification-otp');
        
        let isChangePasswordClicked = false;

        const checkVerificationNeeded = () => {
            if (user.role !== 'admin') {
                if (otpSection) otpSection.style.display = 'none';
                return;
            }
            const isEmailChanged = emailInput.value.trim().toLowerCase() !== (user.email || '').toLowerCase();
            const isPasswordGroupVisible = passwordGroup && passwordGroup.style.display !== 'none';
            if (isEmailChanged || isPasswordGroupVisible) {
                if (otpSection) otpSection.style.display = 'block';
            } else {
                if (otpSection) otpSection.style.display = 'none';
            }
        };

        if (emailInput) {
            emailInput.addEventListener('input', checkVerificationNeeded);
            emailInput.addEventListener('change', checkVerificationNeeded);
        }
        
        if (passwordTrigger && passwordGroup && passwordTriggerWrapper) {
            passwordTrigger.onclick = () => {
                isChangePasswordClicked = true;
                passwordTriggerWrapper.style.display = 'none';
                passwordGroup.style.display = 'block';
                checkVerificationNeeded();
                const inputPass = document.getElementById('modal-user-password');
                if (inputPass) inputPass.focus();
            };
        }

        if (btnSendOtp) {
            let countdown = 0;
            let timer = null;
            btnSendOtp.onclick = async (e) => {
                e.preventDefault();
                const targetEmail = emailInput.value.trim();
                if (!targetEmail) {
                    return showToast('Vui lòng điền Email hợp lệ để nhận mã OTP!', 'error');
                }
                btnSendOtp.disabled = true;
                otpStatus.textContent = 'Đang gửi mã OTP...';
                otpStatus.style.color = '#a1a1aa';
                try {
                    await api('/api/auth/send-email-otp', 'POST', { username: user.username, email: targetEmail });
                    showToast('Đã gửi mã OTP xác nhận đến email!');
                    otpStatus.textContent = `Mã OTP đã được gửi tới ${targetEmail}. Hiệu lực trong 5 phút.`;
                    otpStatus.style.color = '#10b981';
                    
                    countdown = 60;
                    btnSendOtp.disabled = true;
                    timer = setInterval(() => {
                        countdown--;
                        if (countdown <= 0) {
                            clearInterval(timer);
                            btnSendOtp.disabled = false;
                            btnSendOtp.textContent = 'Gửi OTP';
                        } else {
                            btnSendOtp.textContent = `Gửi lại (${countdown}s)`;
                        }
                    }, 1000);
                } catch (err) {
                    showToast(err.message, 'error');
                    otpStatus.textContent = `Lỗi: ${err.message}`;
                    otpStatus.style.color = '#ef4444';
                    btnSendOtp.disabled = false;
                }
            };
        }

        const roleSelect = document.getElementById('modal-user-role');
        if (roleSelect) {
            const togglePassword = () => {
                if (roleSelect.value === 'employee') {
                    if (passwordTriggerWrapper) passwordTriggerWrapper.style.display = 'none';
                    if (passwordGroup) passwordGroup.style.display = 'none';
                    const inputPass = document.getElementById('modal-user-password');
                    if (inputPass) inputPass.value = '';
                } else {
                    if (isChangePasswordClicked) {
                        if (passwordTriggerWrapper) passwordTriggerWrapper.style.display = 'none';
                        if (passwordGroup) passwordGroup.style.display = 'block';
                    } else {
                        if (passwordTriggerWrapper) passwordTriggerWrapper.style.display = 'block';
                        if (passwordGroup) passwordGroup.style.display = 'none';
                    }
                }
                checkVerificationNeeded();
            };
            roleSelect.addEventListener('change', togglePassword);
            togglePassword();
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

function showUnlinkOptions(userId, fullname, hasMobile, hasWeb) {
    showModal('Xóa tất cả liên kết thiết bị', `Bạn có chắc muốn xóa tất cả liên kết (App điện thoại & Trình duyệt web) của nhân viên <strong>${fullname}</strong>?<br>Sau khi xóa, nhân viên này có thể đăng nhập trên thiết bị/trình duyệt mới.`, [
        { text: 'Hủy', class: 'btn-ghost' },
        { text: 'Xóa liên kết', class: 'btn btn-danger btn-sm', action: async () => {
            try {
                await api(`/api/users/${userId}`, 'PUT', { deviceId: null, browserDeviceId: null });
                await refreshAdminUsers();
                showToast(`Đã xóa toàn bộ liên kết thiết bị của ${fullname}!`);
            } catch (e) {
                showToast(e.message, 'error');
            }
        }}
    ]);
}

window.showUnlinkOptions = showUnlinkOptions;

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
async function rejectUnlinkDevice(userId, fullname) {
    showModal('Từ chối huỷ liên kết thiết bị', `Bạn có chắc muốn từ chối yêu cầu huỷ liên kết thiết bị của nhân viên <strong>${fullname}</strong>?`, [
        { text: 'Hủy', class: 'btn-ghost' },
        { text: 'Từ chối', class: 'btn btn-danger btn-sm', action: async () => {
            try {
                await api(`/api/users/${userId}`, 'PUT', { pendingUnlink: false });
                await refreshAdminUsers();
                showToast('Đã từ chối yêu cầu huỷ liên kết thiết bị!');
            } catch (e) {
                showToast(e.message, 'error');
            }
        }}
    ]);
}


// ==================== PREDEFINED OT REASONS UTILITIES ====================
function setupPredefinedReasonsSelect(teamName, selectEl, isLunchChecked = false) {
    if (!selectEl) return;
    
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
    
    selectEl.innerHTML = `
        <option value="">${placeholder}</option>
        ${filteredReasons.map(r => `<option value="${r.replace(/"/g, '&quot;')}">${r}</option>`).join('')}
    `;
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
    const adminOtNoteEl = document.getElementById('admin-ot-note');
    const updateAdminPredefinedReasons = () => {
        const isLunchChecked = adminOtLunchEl ? adminOtLunchEl.checked : false;
        setupPredefinedReasonsSelect(userTeam, adminOtNoteEl, isLunchChecked);
    };
    
    if (adminOtLunchEl && !adminOtLunchEl.dataset.reasonsListenerBound) {
        adminOtLunchEl.addEventListener('change', updateAdminPredefinedReasons);
        adminOtLunchEl.dataset.reasonsListenerBound = 'true';
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
    const otNoteEl = document.getElementById('ot-note');
    const updateEmployeePredefinedReasons = () => {
        const isLunchChecked = otLunchEl ? otLunchEl.checked : false;
        setupPredefinedReasonsSelect(userTeam, otNoteEl, isLunchChecked);
    };
    
    if (otLunchEl && !otLunchEl.dataset.reasonsListenerBound) {
        otLunchEl.addEventListener('change', updateEmployeePredefinedReasons);
        otLunchEl.dataset.reasonsListenerBound = 'true';
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
})();


