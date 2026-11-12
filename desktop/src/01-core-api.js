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
            if (window.sessionStorage.getItem('ot_session_temp') === '1') {
                return window.sessionStorage.getItem(key) || window.localStorage.getItem(key);
            }
            return window.localStorage.getItem(key) || window.sessionStorage.getItem(key);
        } catch (e) {
            return this._data[key] || null;
        }
    },
    setItem(key, val) {
        try {
            if (window.sessionStorage.getItem('ot_session_temp') === '1') {
                window.sessionStorage.setItem(key, val);
                window.localStorage.setItem(key, val);
            } else {
                window.localStorage.setItem(key, val);
            }
        } catch (e) {
            try {
                window.sessionStorage.setItem(key, val);
            } catch (e2) {
                this._data[key] = val;
            }
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

let hasManualLoginInThisPageLoad = false;

function getSessionCycleDateStr() {
    const shifted = new Date(Date.now() - 5 * 3600000);
    return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, '0')}-${String(shifted.getDate()).padStart(2, '0')}`;
}

function clearAuthSession() {
    ['ot_current_user', 'ot_login_date', 'ot_mobile_user', 'ot_login_time', 'ot_auth_token', 'ot_session_temp', 'ot_require_email_setup'].forEach(k => {
        localStorage.removeItem(k);
    });
}

function escapeHTML(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

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

function createDesktopWakeupController() {
    const loginScreen = document.getElementById('screen-login');
    const banner = document.getElementById('desktop-wakeup-banner');
    const textEl = document.getElementById('desktop-wakeup-text');
    const etaEl = document.getElementById('desktop-wakeup-eta');
    const barEl = document.getElementById('desktop-wakeup-bar');
    if (!loginScreen || !loginScreen.classList.contains('active') || !banner) {
        return function noop() {};
    }
    let elapsed = 0;
    let stepInterval = null;
    const delayTimer = setTimeout(() => {
        banner.style.display = 'block';
        if (textEl) textEl.textContent = 'Máy chủ đang thức dậy từ chế độ nghỉ ban đêm...';
        if (etaEl) etaEl.textContent = '~25s';
        if (barEl) barEl.style.width = '22%';
        stepInterval = setInterval(() => {
            elapsed += 3;
            const pct = Math.min(92, 22 + elapsed * 2.5);
            const remain = Math.max(3, 28 - elapsed);
            if (barEl) barEl.style.width = pct + '%';
            if (etaEl) etaEl.textContent = '~' + remain + 's';
            if (elapsed >= 12 && textEl) {
                textEl.textContent = 'Đang nạp phiên bảo mật từ Supabase Cloud...';
            }
        }, 3000);
    }, 3200);

    return function stopWakeup() {
        clearTimeout(delayTimer);
        if (stepInterval) clearInterval(stepInterval);
        banner.style.display = 'none';
    };
}

function syncAdminThemeUI() {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    const iconDark = document.getElementById('icon-theme-dark');
    const iconLight = document.getElementById('icon-theme-light');
    const label = document.getElementById('label-theme-toggle');
    if (iconDark) iconDark.style.display = isLight ? 'none' : 'inline-block';
    if (iconLight) iconLight.style.display = isLight ? 'inline-block' : 'none';
    if (label) label.textContent = isLight ? 'Clean Light' : 'Emerald Dark';
}

function toggleAdminTheme() {
    const isCurrentlyLight = document.documentElement.getAttribute('data-theme') === 'light';
    const nextMode = isCurrentlyLight ? 'dark' : 'light';
    if (nextMode === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
    } else {
        document.documentElement.removeAttribute('data-theme');
    }
    try { window.localStorage.setItem('ot_theme_mode', nextMode); } catch (e) {}
    syncAdminThemeUI();
}

function syncDensityUI() {
    const isCompact = document.documentElement.classList.contains('density-compact');
    const btnCompact = document.getElementById('btn-density-compact');
    const btnComfort = document.getElementById('btn-density-comfort');
    if (btnCompact) btnCompact.classList.toggle('active', isCompact);
    if (btnComfort) btnComfort.classList.toggle('active', !isCompact);
}

function setTableDensity(mode) {
    const isCompact = mode === 'compact';
    document.documentElement.classList.toggle('density-compact', isCompact);
    try { window.localStorage.setItem('ot_table_density', isCompact ? 'compact' : 'comfortable'); } catch (e) {}
    syncDensityUI();
}

function resetAdminRecordFilters() {
    const dateEl = document.getElementById('admin-filter-date');
    const userEl = document.getElementById('admin-filter-user');
    const searchEl = document.getElementById('admin-search-user');
    const noteEl = document.getElementById('admin-search-note');
    const teamEl = document.getElementById('admin-filter-team');
    if (dateEl) dateEl.value = '';
    if (userEl) userEl.value = '';
    if (searchEl) searchEl.value = '';
    if (noteEl) noteEl.value = '';
    if (teamEl) teamEl.value = '';
    if (typeof refreshAdminRecords === 'function') refreshAdminRecords();
}

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

    const stopWakeup = endpoint.includes('/api/auth/') ? createDesktopWakeupController() : function() {};

    const promise = (async () => {
        try {
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
                    clearAuthSession();
                    window.location.reload();
                }
                throw new Error(data.error || 'Lỗi kết nối server');
            }
            return data;
        } finally {
            stopWakeup();
        }
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
    if (!startTime || !endTime) return 0;
    const startMin = timeToMinutes(startTime);
    let endMin = timeToMinutes(endTime);
    if (endMin === startMin) return 0;
    // Hỗ trợ tăng ca qua nửa đêm (từ 00:00 đến 12:00 sáng hôm sau)
    if (endMin < startMin && endMin <= 12 * 60) {
        endMin += 24 * 60;
    }
    if (endMin <= startMin) return 0;
    return Math.round(((endMin - startMin) / 60) * 100) / 100;
}
