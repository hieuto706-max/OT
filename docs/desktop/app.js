/* eslint-disable */
(function() {
/**
 * OT Manager - Desktop App (Admin)
 * Giá» lĂ m chĂ­nh: 7:00 - 16:30
 * Nghá»‰ trÆ°a: 11:50 - 13:20
 * OT trÆ°a: 12:20 - 13:20 (1 tiáº¿ng)
 *
 * Sá»­ dá»¥ng Server API Ä‘á»ƒ Ä‘á»“ng bá»™ dá»¯ liá»‡u vá»›i mobile
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
const OT_LUNCH_HOURS = 1;
const WORK_END = '16:30';
let TEAMS = [];
const PROVINCES = [
    "An Giang", "BĂ  Rá»‹a â€“ VÅ©ng TĂ u", "Báº¡c LiĂªu", "Báº¯c Giang", "Báº¯c Káº¡n", "Báº¯c Ninh", "Báº¿n Tre", "BĂ¬nh DÆ°Æ¡ng", "BĂ¬nh Äá»‹nh", "BĂ¬nh PhÆ°á»›c", "BĂ¬nh Thuáº­n", "CĂ  Mau", "Cáº§n ThÆ¡", "Cao Báº±ng", "ÄĂ  Náºµng", "Äáº¯k Láº¯k", "Äáº¯k NĂ´ng", "Äiá»‡n BiĂªn", "Äá»“ng Nai", "Äá»“ng ThĂ¡p", "Gia Lai", "HĂ  Giang", "HĂ  Nam", "HĂ  Ná»™i", "HĂ  TÄ©nh", "Háº£i DÆ°Æ¡ng", "Háº£i PhĂ²ng", "Háº­u Giang", "HĂ²a BĂ¬nh", "HÆ°ng YĂªn", "KhĂ¡nh HĂ²a", "KiĂªn Giang", "Kon Tum", "Lai ChĂ¢u", "Láº¡ng SÆ¡n", "LĂ o Cai", "LĂ¢m Äá»“ng", "Long An", "Nam Äá»‹nh", "Nghá»‡ An", "Ninh BĂ¬nh", "Ninh Thuáº­n", "PhĂº Thá»", "PhĂº YĂªn", "Quáº£ng BĂ¬nh", "Quáº£ng Nam", "Quáº£ng NgĂ£i", "Quáº£ng Ninh", "Quáº£ng Trá»‹", "SĂ³c TrÄƒng", "SÆ¡n La", "TĂ¢y Ninh", "ThĂ¡i BĂ¬nh", "ThĂ¡i NguyĂªn", "Thanh HĂ³a", "Thá»«a ThiĂªn Huáº¿", "Tiá»n Giang", "TP. Há»“ ChĂ­ Minh", "TrĂ  Vinh", "TuyĂªn Quang", "VÄ©nh Long", "VÄ©nh PhĂºc", "YĂªn BĂ¡i"
];

let currentAdminRecType = 'ot';
let currentEmpRecType = 'ot';
let loadedUsers = [];
let loadedRecords = [];

// Report Redesign global state variables
let reportSearchQuery = '';
let reportSortColumn = 'total'; // 'name', 'days', 'total'
let reportSortOrder = 'desc'; // 'asc', 'desc'

async function loadTeams() {
    try {
        const res = await api('/api/teams');
        TEAMS = res.teams || [];
    } catch (e) {
        console.error('Lá»—i load teams:', e);
        TEAMS = ['Team 1', 'Team 2', 'Team 3', 'Team 4', 'Team 5', 'Team 6', 'Team 7', 'Team 8', 'Team 9', 'Team 10'];
    }
    populateTeamFilters();
}

function populateTeamFilters() {
    const adminFilter = document.getElementById('admin-filter-team');
    const reportFilter = document.getElementById('report-filter-team');
    
    const currentUser = JSON.parse(localStorage.getItem('ot_current_user') || 'null');
    const isSuperAdmin = currentUser && (currentUser.isSuperAdmin || currentUser.username === 'admin');
    
    const optionsHtml = `
        <option value="">Táº¥t cáº£ Team</option>
        ${isSuperAdmin ? '<option value="admin">admin</option>' : ''}
        <option value="unassigned">ChÆ°a phĂ¢n team</option>
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
        // Gá»­i JWT Token náº¿u cĂ³
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
            throw new Error(data.error || 'Lá»—i káº¿t ná»‘i server');
        }
        return data;
    })();

    if (isGet) {
        apiCache.set(cacheKey, promise);
        // Tá»± Ä‘á»™ng xoĂ¡ cache sau 1 giĂ¢y Ä‘á»ƒ Ä‘áº£m báº£o dá»¯ liá»‡u má»›i nháº¥t Ä‘Æ°á»£c náº¡p á»Ÿ cĂ¡c láº§n táº£i sau
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

function formatDateFull(date) {
    const days = ['Chá»§ nháº­t', 'Thá»© 2', 'Thá»© 3', 'Thá»© 4', 'Thá»© 5', 'Thá»© 6', 'Thá»© 7'];
    const months = ['thĂ¡ng 1', 'thĂ¡ng 2', 'thĂ¡ng 3', 'thĂ¡ng 4', 'thĂ¡ng 5', 'thĂ¡ng 6',
                    'thĂ¡ng 7', 'thĂ¡ng 8', 'thĂ¡ng 9', 'thĂ¡ng 10', 'thĂ¡ng 11', 'thĂ¡ng 12'];
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

async function isPrivateMode() {
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
            if (navigator.serviceWorker && typeof navigator.serviceWorker.register === 'function') {
                navigator.serviceWorker.register('sw.js').then((reg) => {
                    reg.unregister();
                    detectChromiumOrFallback();
                }).catch((err) => {
                    if (err && err.name === 'SecurityError') {
                        resolve(true);
                    } else {
                        detectChromiumOrFallback();
                    }
                });
            } else {
                detectChromiumOrFallback();
            }
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

        function detectChromiumOrFallback() {
            if (navigator.storage && typeof navigator.storage.getDirectory === 'function' && typeof Worker === 'function') {
                try {
                    const src = `(async()=>{try{const r=await navigator.storage.getDirectory(),f=await(await r.getFileHandle('_',{create:true})).createSyncAccessHandle(),b=new Uint8Array(1);let m=1/0;for(let i=0;i<5;i++){f.write(b,{at:0});const s=performance.now();f.flush();const dt=performance.now()-s;if(dt<m)m=dt}f.close();postMessage(m<.04)}catch(e){postMessage(false)}})()`;
                    const blob = new Blob([src], { type: 'application/javascript' });
                    const w = new Worker(URL.createObjectURL(blob));
                    w.onmessage = (e) => {
                        w.terminate();
                        if (e.data) {
                            resolve(true);
                        } else {
                            fallbackQuota();
                        }
                    };
                    w.onerror = () => {
                        w.terminate();
                        fallbackQuota();
                    };
                    setTimeout(() => {
                        w.terminate();
                        fallbackQuota();
                    }, 2000);
                } catch (err) {
                    fallbackQuota();
                }
            } else {
                fallbackQuota();
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
    const icons = { success: 'âœ“', error: 'âœ•', info: 'â„¹' };
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

    if (await isPrivateMode()) {
        errorEl.textContent = 'Há»‡ thá»‘ng khĂ´ng cho phĂ©p Ä‘Äƒng nháº­p tá»« trĂ¬nh duyá»‡t áº©n danh (Incognito Mode) Ä‘á»ƒ Ä‘áº£m báº£o an toĂ n thiáº¿t bá»‹!';
        return;
    }

    try {
        const data = await api('/api/auth/login', 'POST', { username });
        const user = data.user;

        if (user.role !== 'employee') {
            errorEl.textContent = 'TĂ i khoáº£n nĂ y khĂ´ng pháº£i lĂ  nhĂ¢n viĂªn!';
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
            showToast(`Xin chĂ o, ${finalUser.fullname}!`, 'info');
            e.target.reset();
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
    }
}

async function handleAdminLogin(e) {
    e.preventDefault();
    const username = document.getElementById('login-admin-username').value.trim();
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error-admin');
    errorEl.textContent = '';

    if (await isPrivateMode()) {
        errorEl.textContent = 'Há»‡ thá»‘ng khĂ´ng cho phĂ©p Ä‘Äƒng nháº­p tá»« trĂ¬nh duyá»‡t áº©n danh (Incognito Mode) Ä‘á»ƒ Ä‘áº£m báº£o an toĂ n thiáº¿t bá»‹!';
        return;
    }

    try {
        const data = await api('/api/auth/login', 'POST', { username, password });
        const user = data.user;

        if (user.role !== 'admin') {
            errorEl.textContent = 'TĂ i khoáº£n nhĂ¢n viĂªn khĂ´ng Ä‘Æ°á»£c phĂ©p Ä‘Äƒng nháº­p bĂªn pháº§n quáº£n trá»‹!';
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
            showToast(`Xin chĂ o, ${finalUser.fullname}!`, 'info');
            e.target.reset();
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
    }
}

function checkMidnightLogout() {
    const currentUser = localStorage.getItem('ot_current_user');
    if (!currentUser) return;

    const loginDate = localStorage.getItem('ot_login_date');
    const todayStr = new Date().toISOString().split('T')[0];
    if (loginDate && loginDate !== todayStr) {
        logout();
        showToast('ÄĂ£ qua ngĂ y má»›i, vui lĂ²ng Ä‘Äƒng nháº­p láº¡i.', 'info');
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
        // Trong Electron, reset vĂ  hiá»ƒn thá»‹ láº¡i mĂ n hĂ¬nh Ä‘Äƒng nháº­p thay vĂ¬ chuyá»ƒn hÆ°á»›ng ra Landing Page
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
                'Cáº£nh bĂ¡o Ä‘á»“ng bá»™ Ä‘Ă¡m mĂ¢y',
                `<p style="color: var(--accent-red); font-weight: 600; font-size: 15px; margin-bottom: 8px;">
                    â ï¸ Lá»—i Ä‘á»“ng bá»™ Ä‘Ă¡m mĂ¢y (GitHub Gist)
                </p>
                <p style="color: var(--text-secondary); line-height: 1.6; margin-bottom: 12px;">
                    Chi tiáº¿t lá»—i: <strong>${data.message}</strong>
                </p>
                <p style="color: var(--text-muted); font-size: 13px;">
                    Dá»¯ liá»‡u cá»§a báº¡n sáº½ bá»‹ máº¥t má»—i khi server Render khá»Ÿi Ä‘á»™ng láº¡i hoáº·c táº¡m dá»«ng do dá»‹ch vá»¥ Ä‘Ă¡m mĂ¢y chÆ°a Ä‘Æ°á»£c cáº¥u hĂ¬nh Ä‘Ăºng. Vui lĂ²ng kiá»ƒm tra láº¡i cáº¥u hĂ¬nh biáº¿n mĂ´i trÆ°á»ng (Environment Variables) trĂªn Render Dashboard.
                </p>`,
                [{ text: 'ÄĂ³ng', class: 'btn-ghost' }]
            );
        }
    } catch (e) {
        console.error('Lá»—i kiá»ƒm tra tráº¡ng thĂ¡i Gist:', e);
    }
}

// ==================== ADMIN DASHBOARD ====================
async function initAdminDashboard(user) {
    const welcomeEl = document.getElementById('admin-welcome');
    if (welcomeEl) welcomeEl.textContent = `Xin chĂ o, ${user.fullname}`;
    
    // Update top header user profile details dynamically
    const headerFullnameEl = document.getElementById('header-user-fullname');
    const headerAvatarEl = document.getElementById('header-user-avatar');
    const headerRoleEl = document.getElementById('header-user-role');
    if (headerFullnameEl) headerFullnameEl.textContent = user.fullname;
    if (headerAvatarEl) headerAvatarEl.textContent = user.fullname.charAt(0).toUpperCase();
    if (headerRoleEl) headerRoleEl.textContent = user.role === 'admin' ? 'Quáº£n lĂ½' : 'NhĂ¢n viĂªn';

    // Click to edit own profile
    const userProfileEl = document.getElementById('header-user-profile');
    if (userProfileEl) {
        userProfileEl.style.cursor = 'pointer';
        userProfileEl.title = 'Chá»‰nh sá»­a thĂ´ng tin cĂ¡ nhĂ¢n';
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

    await Promise.all([
        loadTeams(),
        populateUserFilter(),
        refreshAdminRecords(),
        refreshAdminUsers(),
        refreshReport(),
        refreshAdminStats()
    ]);
    checkGistStatus();
}

let selectedTeamIdForModal = null;
let modalAllUsers = [];

async function openTeamSettingsModal() {
    const modalEl = document.querySelector('.modal');
    if (modalEl) modalEl.style.maxWidth = '950px';

    try {
        const uData = await api('/api/users');
        modalAllUsers = uData.users || [];
    } catch (e) {
        console.error('Lá»—i khi láº¥y danh sĂ¡ch user:', e);
    }

    // Táº£i láº¡i danh sĂ¡ch team má»›i nháº¥t tá»« server
    await loadTeams();

    // Máº·c Ä‘á»‹nh chá»n team Ä‘áº§u tiĂªn náº¿u chÆ°a chá»n team nĂ o
    if (TEAMS.length > 0 && (!selectedTeamIdForModal || !TEAMS.some(t => t.id === selectedTeamIdForModal))) {
        selectedTeamIdForModal = TEAMS[0].id;
    }

    const body = `
    <div style="display: flex; gap: 20px; height: 500px; text-align: left;">
        <!-- LEFT PANEL: Danh sĂ¡ch nhĂ³m -->
        <div style="width: 280px; display: flex; flex-direction: column; border-right: 1px solid var(--border-color); padding-right: 20px;">
            <h4 style="margin: 0 0 12px 0; font-size: 14px; font-weight: 600; color: var(--text-secondary);">Danh sĂ¡ch nhĂ³m</h4>
            <div style="display: flex; gap: 8px; margin-bottom: 12px;">
                <input type="text" id="input-modal-new-team" class="input-sm" placeholder="TĂªn team má»›i..." style="flex: 1; height: 32px; background:var(--bg-input); color:var(--text-primary); border:1px solid var(--border-color); border-radius:6px; padding:0 8px; font-size:12px;">
                <button class="btn btn-primary btn-sm" onclick="addTeamFromModal()" style="height: 32px; padding: 0 10px; border-radius:6px; font-size:12px; white-space: nowrap;">ThĂªm</button>
            </div>
            <div style="flex: 1; overflow-y: auto;" id="modal-teams-list-container">
                ${renderModalTeamsRows()}
            </div>
        </div>

        <!-- RIGHT PANEL: Chi tiáº¿t & ThĂ nh viĂªn -->
        <div style="flex: 1; display: flex; flex-direction: column; overflow: hidden;" id="modal-team-details-container">
            ${renderSelectedTeamDetails()}
        </div>
    </div>`;

    showModal('Thiáº¿t láº­p danh sĂ¡ch Team', body, [
        {
            text: 'ÄĂ³ng',
            class: 'btn-ghost',
            action: () => {
                if (modalEl) modalEl.style.maxWidth = '';
            }
        }
    ]);

    // Láº¯ng nghe sá»± kiá»‡n click Ä‘Ă³ng modal Ä‘á»ƒ thu há»“i kĂ­ch thÆ°á»›c rá»™ng cá»§a modal
    const closeBtn = document.getElementById('modal-close');
    if (closeBtn) {
        const originalClose = closeBtn.onclick;
        closeBtn.onclick = () => {
            if (modalEl) modalEl.style.maxWidth = '';
            if (originalClose) originalClose();
            else closeModal();
        };
    }
    const overlay = document.getElementById('modal-overlay');
    if (overlay) {
        overlay.onclick = (e) => {
            if (e.target === e.currentTarget) {
                if (modalEl) modalEl.style.maxWidth = '';
                closeModal();
            }
        };
    }
}

function renderModalTeamsRows() {
    if (!TEAMS || TEAMS.length === 0) {
        return '<div style="color: var(--text-muted); text-align: center; padding: 20px; font-size:12px;">ChÆ°a cĂ³ team nĂ o.</div>';
    }
    return TEAMS.map(team => {
        const isSelected = selectedTeamIdForModal === team.id;
        const bg = isSelected ? 'rgba(59, 130, 246, 0.15)' : 'transparent';
        const border = isSelected ? '1px solid var(--accent-blue)' : '1px solid transparent';
        const memberCount = modalAllUsers.filter(u => u.team === team.name && u.role === 'employee').length;
        
        return `
        <div onclick="selectTeamInModal('${team.id}')" style="display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; border-radius: 8px; margin-bottom: 6px; cursor: pointer; background: ${bg}; border: ${border}; transition: all 0.2s;">
            <div style="display: flex; flex-direction: column; gap: 2px;">
                <span style="font-weight: 600; font-size: 13px; color: ${isSelected ? 'var(--accent-blue-text)' : 'var(--text-primary)'};">${team.name}</span>
                <span style="font-size: 11px; color: var(--text-muted);">${memberCount} nhĂ¢n viĂªn</span>
            </div>
            <div style="display: flex; gap: 4px;" onclick="event.stopPropagation();">
                <button class="btn-icon-only edit" onclick="renameTeamFromModal('${team.name}')" title="Äá»•i tĂªn" style="padding: 4px;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                </button>
                <button class="btn-icon-only delete" onclick="deleteTeamFromModal('${team.name}')" title="XĂ³a" style="padding: 4px;">
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
            <span>Vui lĂ²ng chá»n hoáº·c thĂªm má»™t team á»Ÿ cá»™t trĂ¡i Ä‘á»ƒ báº¯t Ä‘áº§u thiáº¿t láº­p.</span>
        </div>`;
    }

    // ThĂ nh viĂªn hiá»‡n táº¡i (chá»‰ láº¥y NhĂ¢n viĂªn, loáº¡i trá»« Quáº£n lĂ½/TrÆ°á»Ÿng nhĂ³m)
    const members = modalAllUsers.filter(u => u.team === team.name && u.role === 'employee');
    // Danh sĂ¡ch á»©ng viĂªn TrÆ°á»Ÿng nhĂ³m (Chá»‰ cĂ¡c tĂ i khoáº£n cĂ³ role === 'admin')
    const potentialLeaders = modalAllUsers.filter(u => u.role === 'admin');
    const activeLeaderIds = team.leaderIds || (team.leaderId ? [team.leaderId] : []);

    const leaderCheckboxes = potentialLeaders.map(u => {
        const isChecked = activeLeaderIds.includes(u.id);
        return `
            <label style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px; font-size: 12px; cursor: pointer; color: var(--text-primary); user-select: none;">
                <input type="checkbox" class="modal-team-leader-chk" value="${u.id}" ${isChecked ? 'checked' : ''} onchange="saveTeamSettingsFromModal('${team.id}')" style="width: 13px; height: 13px; margin: 0;">
                <span>${u.fullname} (@${u.username})</span>
            </label>
        `;
    }).join('') || '<span style="color: var(--text-muted); font-size: 11px;">ChÆ°a cĂ³ tĂ i khoáº£n Admin nĂ o lĂ m á»©ng viĂªn.</span>';

    const rules = team.autoApproveRules || { normalOT: false, backfill: false, sunday: false, customActivity: false };
    const activities = team.customActivities || [];

    const activitiesListHtml = activities.length === 0 
        ? '<div style="color: var(--text-muted); font-size: 11px; padding: 12px 0; text-align:center;">ChÆ°a cáº¥u hĂ¬nh hoáº¡t Ä‘á»™ng ngoĂ i giá» nĂ o.</div>'
        : activities.map((act, index) => `
            <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: 6px; padding: 6px 12px; margin-bottom: 6px; font-size: 12px;">
                <div style="display: flex; flex-direction: column; gap: 2px; text-align: left;">
                    <span style="font-weight: 600;">${act.name}</span>
                    <span style="font-size: 10px; color: var(--text-muted);">
                        TĂ­nh cháº¥t: ${act.calcMode === 'trip' ? 'TĂ­nh theo Chuyáº¿n' : 'TĂ­nh theo Giá»'} | NhĂ£n: ${act.detailLabel || 'KhĂ´ng cĂ³'}
                    </span>
                </div>
                <button class="btn-icon-only delete" onclick="deleteActivityFromTeam('${team.id}', ${index})" title="XĂ³a" style="padding: 2px;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2 2v2"/>
                    </svg>
                </button>
            </div>
        `).join('');

    const membersListHtml = members.length === 0
        ? '<div style="color: var(--text-muted); font-size: 11px; text-align: center; padding: 20px;">ChÆ°a cĂ³ thĂ nh viĂªn nĂ o trong team.</div>'
        : members.map(m => `
            <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: 6px; padding: 6px 10px; margin-bottom: 6px; font-size: 12px;">
                <span><strong>${m.fullname}</strong> (@${m.username})</span>
                <button class="btn-icon-only delete" onclick="removeMemberFromTeam('${m.id}')" title="XĂ³a khá»i nhĂ³m" style="padding: 2px;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
            </div>
        `).join('');

    const unassignedEmployees = modalAllUsers.filter(u => u.role === 'employee' && u.team !== team.name);
    const unassignedOptions = `
        <option value="">-- Chá»n nhĂ¢n viĂªn Ä‘á»ƒ thĂªm --</option>
        ${unassignedEmployees.map(u => `<option value="${u.id}">${u.fullname} (${u.team ? 'Äang á»Ÿ: ' + u.team : 'ChÆ°a cĂ³ nhĂ³m'})</option>`).join('')}
    `;

    return `
    <div style="flex: 1; display: flex; flex-direction: column; overflow: hidden; padding-left: 10px;">
        <h3 style="margin: 0 0 16px 0; font-size: 15px; color: var(--accent-blue-text); display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--border-color); padding-bottom: 8px;">
            <span>Cáº¥u hĂ¬nh nhĂ³m: ${team.name}</span>
            <span style="font-size: 11px; color: var(--text-muted); font-weight: normal;">Thiáº¿t láº­p Quá»¹ OT & Quy táº¯c</span>
        </h3>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; flex: 1; overflow: hidden;">
            <!-- LEFT SUB-COLUMN: CĂ i Ä‘áº·t vĂ  hoáº¡t Ä‘á»™ng -->
            <div style="display: flex; flex-direction: column; gap: 12px; overflow-y: auto; padding-right: 4px;">
                <!-- 1. Chá»n TrÆ°á»Ÿng nhĂ³m -->
                <div class="form-group" style="margin: 0;">
                    <label style="display: block; font-size: 11px; font-weight: 600; color: var(--text-secondary); margin-bottom: 6px;">TrÆ°á»Ÿng nhĂ³m (Leader duyá»‡t OT - CĂ³ thá»ƒ chá»n nhiá»u)</label>
                    <div style="max-height: 100px; overflow-y: auto; background: var(--bg-input); border: 1px solid var(--border-color); border-radius: 6px; padding: 8px; box-sizing: border-box; display: flex; flex-direction: column; gap: 4px;">
                        ${leaderCheckboxes}
                    </div>
                </div>

                <!-- 2. Quy táº¯c tá»± duyá»‡t -->
                <div style="background: rgba(255,255,255,0.01); border: 1px solid var(--border-color); border-radius: 8px; padding: 10px; display: flex; flex-direction: column; gap: 6px;">
                    <span style="font-size: 11px; font-weight: 600; color: var(--text-secondary); margin-bottom: 2px; display: block;">Quy táº¯c Tá»± Ä‘á»™ng duyá»‡t</span>
                    
                    <label style="display: flex; align-items: center; gap: 8px; font-size: 11px; cursor: pointer; user-select: none; color: var(--text-primary);">
                        <input type="checkbox" id="rule-normal" ${rules.normalOT ? 'checked' : ''} onchange="saveTeamSettingsFromModal('${team.id}')" style="width: 13px; height: 13px;">
                        Tá»± duyá»‡t giá» OT bĂ¬nh thÆ°á»ng
                    </label>
                    <label style="display: flex; align-items: center; gap: 8px; font-size: 11px; cursor: pointer; user-select: none; color: var(--text-primary);">
                        <input type="checkbox" id="rule-backfill" ${rules.backfill ? 'checked' : ''} onchange="saveTeamSettingsFromModal('${team.id}')" style="width: 13px; height: 13px;">
                        Tá»± duyá»‡t BĂ¹ tÄƒng ca (Backfill)
                    </label>
                    <label style="display: flex; align-items: center; gap: 8px; font-size: 11px; cursor: pointer; user-select: none; color: var(--text-primary);">
                        <input type="checkbox" id="rule-sunday" ${rules.sunday ? 'checked' : ''} onchange="saveTeamSettingsFromModal('${team.id}')" style="width: 13px; height: 13px;">
                        Tá»± duyá»‡t náº¿u Ä‘Äƒng kĂ½ vĂ o Chá»§ nháº­t
                    </label>
                    <label style="display: flex; align-items: center; gap: 8px; font-size: 11px; cursor: pointer; user-select: none; color: var(--text-primary);">
                        <input type="checkbox" id="rule-custom" ${rules.customActivity ? 'checked' : ''} onchange="saveTeamSettingsFromModal('${team.id}')" style="width: 13px; height: 13px;">
                        Tá»± duyá»‡t Hoáº¡t Ä‘á»™ng ngoĂ i giá» tĂ¹y chá»‰nh
                    </label>
                </div>

                <!-- 3. Quáº£n lĂ½ hoáº¡t Ä‘á»™ng tĂ¹y chá»n -->
                <div style="display: flex; flex-direction: column; flex: 1; min-height: 200px;">
                    <span style="font-size: 11px; font-weight: 600; color: var(--text-secondary); margin-bottom: 4px; display: block;">Hoáº¡t Ä‘á»™ng ngoĂ i giá» cá»§a Team</span>
                    <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 6px;">
                        <input type="text" id="modal-new-act-name" placeholder="TĂªn hoáº¡t Ä‘á»™ng..." style="flex: 1.5; min-width: 100px; height: 28px; background:var(--bg-input); color:var(--text-primary); border:1px solid var(--border-color); border-radius:6px; padding:0 6px; font-size:11px;">
                        <select id="modal-new-act-mode" style="flex: 1.2; min-width: 100px; height: 28px; background:var(--bg-input); color:var(--text-primary); border:1px solid var(--border-color); border-radius:6px; padding:0 2px; font-size:11px;">
                            <option value="hour">TĂ­nh theo Giá»</option>
                            <option value="trip">TĂ­nh theo Chuyáº¿n</option>
                        </select>
                        <input type="text" id="modal-new-act-label" placeholder="NhĂ£n (Tá»‰nh Ä‘i xe...)" style="flex: 1.5; min-width: 100px; height: 28px; background:var(--bg-input); color:var(--text-primary); border:1px solid var(--border-color); border-radius:6px; padding:0 6px; font-size:11px;">
                        <button class="btn btn-primary btn-sm" onclick="addActivityToTeam('${team.id}')" style="height: 28px; border-radius:6px; font-size:11px; padding:0 10px; white-space:nowrap; flex: 1;">ThĂªm</button>
                    </div>
                    <div style="flex: 1; overflow-y: auto; border: 1px solid var(--border-color); border-radius: 6px; padding: 4px; background: rgba(0,0,0,0.05); min-height: 100px;">
                        ${activitiesListHtml}
                    </div>
                </div>
            </div>

            <!-- RIGHT SUB-COLUMN: Danh sĂ¡ch nhĂ¢n viĂªn -->
            <div style="display: flex; flex-direction: column; overflow: hidden;">
                <span style="font-size: 11px; font-weight: 600; color: var(--text-secondary); margin-bottom: 4px; display: block;">Quáº£n lĂ½ thĂ nh viĂªn (${members.length})</span>
                <div style="display: flex; gap: 8px; margin-bottom: 8px;">
                    <select id="modal-add-member-select" style="flex: 1; height: 30px; background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 0 8px; font-size: 11px;">
                        ${unassignedOptions}
                    </select>
                    <button class="btn btn-primary btn-sm" onclick="addMemberToTeamFromModal('${team.id}')" style="height: 30px; border-radius: 6px; font-size: 11px; padding: 0 10px; white-space:nowrap;">ThĂªm</button>
                </div>
                <div style="flex: 1; overflow-y: auto; border: 1px solid var(--border-color); border-radius: 6px; padding: 6px; background: rgba(0,0,0,0.05);">
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
 
    team.leaderIds = leaderIds;
    team.leaderId = leaderIds[0] || null;
    team.autoApproveRules = {
        normalOT: !!ruleNormal,
        backfill: !!ruleBackfill,
        sunday: !!ruleSunday,
        customActivity: !!ruleCustom
    };

    try {
        await api('/api/teams', 'POST', { teams: TEAMS });
        await loadTeams();
        
        // Refresh users list locally
        const uData = await api('/api/users');
        modalAllUsers = uData.users || [];
        
        showToast('ÄĂ£ lÆ°u cáº¥u hĂ¬nh team!');
        refreshModalTeamsView();
        await populateUserFilter();
        await refreshAdminUsers();
    } catch (e) {
        showToast(e.message, 'error');
    }
}

async function addActivityToTeam(teamId) {
    const team = TEAMS.find(t => t.id === teamId);
    if (!team) return;

    const nameInput = document.getElementById('modal-new-act-name');
    const modeSelect = document.getElementById('modal-new-act-mode');
    const labelInput = document.getElementById('modal-new-act-label');

    const name = nameInput?.value.trim();
    const calcMode = modeSelect?.value;
    const detailLabel = labelInput?.value.trim();

    if (!name) return showToast('Vui lĂ²ng nháº­p tĂªn hoáº¡t Ä‘á»™ng!', 'error');

    if (!team.customActivities) team.customActivities = [];
    if (team.customActivities.some(a => a.name.toLowerCase() === name.toLowerCase())) {
        return showToast('Hoáº¡t Ä‘á»™ng nĂ y Ä‘Ă£ tá»“n táº¡i!', 'error');
    }

    team.customActivities.push({
        id: 'act_' + Date.now(),
        name,
        calcMode,
        detailLabel: detailLabel || 'Chi tiáº¿t',
        placeholder: `Nháº­p ${detailLabel || 'chi tiáº¿t'}...`
    });

    try {
        await api('/api/teams', 'POST', { teams: TEAMS });
        await loadTeams();
        showToast('ÄĂ£ thĂªm hoáº¡t Ä‘á»™ng!');
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
        showToast('ÄĂ£ xĂ³a hoáº¡t Ä‘á»™ng!');
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
    if (!userId) return showToast('Vui lĂ²ng chá»n nhĂ¢n viĂªn!', 'error');

    const user = modalAllUsers.find(u => u.id === userId);
    if (!user) return;

    try {
        await api('/api/users/' + userId, 'PUT', { team: team.name });
        showToast(`ÄĂ£ thĂªm ${user.fullname} vĂ o ${team.name}!`);
        
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
        showToast(`ÄĂ£ xĂ³a ${user.fullname} khá»i nhĂ³m!`);
        
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
    if (!teamName) return showToast('Vui lĂ²ng nháº­p tĂªn team!', 'error');

    if (TEAMS.some(t => t.name.toLowerCase() === teamName.toLowerCase())) {
        return showToast('Team nĂ y Ä‘Ă£ tá»“n táº¡i!', 'error');
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
            customActivity: false
        }
    };
    const updatedTeams = [...TEAMS, newTeam];
    try {
        await api('/api/teams', 'POST', { teams: updatedTeams });
        TEAMS = updatedTeams;
        input.value = '';
        showToast('ThĂªm team thĂ nh cĂ´ng!');
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
        <div style="margin-bottom: 12px; font-weight: 500;">Nháº­p tĂªn team má»›i cho <strong>${oldName}</strong>:</div>
        <input type="text" id="modal-rename-team-input" class="input-sm" value="${oldName}" style="width: 100%; box-sizing: border-box; height: 36px; padding: 0 12px; font-size:14px; background:var(--bg-input); color:var(--text-primary); border:1px solid var(--border-color); border-radius:8px;">
    </div>`;

    showModal('Äá»•i tĂªn Team', body, [
        {
            text: 'Há»§y',
            class: 'btn-ghost',
            action: () => {
                setTimeout(() => openTeamSettingsModal(), 50);
            }
        },
        {
            text: 'LÆ°u',
            class: 'btn-primary btn-sm',
            action: async () => {
                const input = document.getElementById('modal-rename-team-input');
                if (!input) return;
                const newName = input.value.trim();
                if (!newName) {
                    showToast('TĂªn team khĂ´ng Ä‘Æ°á»£c Ä‘á»ƒ trá»‘ng!', 'error');
                    setTimeout(() => openTeamSettingsModal(), 50);
                    return;
                }
                if (newName === oldName) {
                    setTimeout(() => openTeamSettingsModal(), 50);
                    return;
                }
                if (TEAMS.some(t => t.name.toLowerCase() === newName.toLowerCase())) {
                    showToast('TĂªn team nĂ y Ä‘Ă£ tá»“n táº¡i!', 'error');
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
                    showToast('Äá»•i tĂªn team thĂ nh cĂ´ng!');
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
        
        let confirmMsg = `Báº¡n cĂ³ cháº¯c muá»‘n xĂ³a team "${teamName}"?`;
        if (userCount > 0) {
            confirmMsg += `<br><br><span style="color: var(--status-rejected-text); font-weight: bold;">Cáº£nh bĂ¡o: Hiá»‡n cĂ³ ${userCount} nhĂ¢n viĂªn thuá»™c team nĂ y. Há» sáº½ bá»‹ Ä‘Æ°a vá» tráº¡ng thĂ¡i "ChÆ°a phĂ¢n team".</span>`;
        }

        showModal('XĂ³a Team', confirmMsg, [
            {
                text: 'Há»§y',
                class: 'btn-ghost',
                action: () => {
                    setTimeout(() => openTeamSettingsModal(), 50);
                }
            },
            {
                text: 'XĂ³a',
                class: 'btn-danger btn-sm',
                action: async () => {
                    const updatedTeams = TEAMS.filter(t => t.name !== teamName);
                    if (selectedTeamIdForModal && !updatedTeams.some(t => t.id === selectedTeamIdForModal)) {
                        selectedTeamIdForModal = null;
                    }
                    try {
                        await api('/api/teams', 'POST', { teams: updatedTeams, deletedTeam: teamName });
                        TEAMS = updatedTeams;
                        showToast('ÄĂ£ xĂ³a team!');
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
        showToast('Lá»—i khi láº¥y thĂ´ng tin nhĂ¢n viĂªn', 'error');
        setTimeout(() => openTeamSettingsModal(), 50);
    }
}

// Khá»Ÿi táº¡o kĂªnh nháº­n sá»± kiá»‡n thá»i gian thá»±c (SSE)
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
                    // Tá»± Ä‘á»™ng lĂ m má»›i dá»¯ liá»‡u khi cĂ³ cáº­p nháº­t tá»« Ä‘iá»‡n thoáº¡i
                    refreshAdminRecords();
                    refreshAdminStats();
                    refreshReport();
                    refreshAdminUsers();
                }
            }
        } catch (e) {
            console.error('Lá»—i xá»­ lĂ½ sá»± kiá»‡n SSE:', e);
        }
    };
    
    sse.onerror = function() {
        console.warn('Máº¥t káº¿t ná»‘i SSE, Ä‘ang thá»­ káº¿t ná»‘i láº¡i...');
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
        loadedUsers = users;
        users.sort((a, b) => a.fullname.localeCompare(b.fullname, 'vi'));

        const currentUser = JSON.parse(localStorage.getItem('ot_current_user') || 'null');
        const isSuperAdmin = currentUser && (currentUser.username === 'admin' || currentUser.isSuperAdmin);
        const managerTeam = currentUser ? (currentUser.team || '') : '';

        if (select) {
            select.innerHTML = '<option value="">Táº¥t cáº£</option>';
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
            adminOtUser.innerHTML = '<option value="">-- Chá»n nhĂ¢n viĂªn --</option>';
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

async function refreshAdminStats() {
    try {
        const stats = await api('/api/stats');
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

        let statsLabel = 'Tá»•ng chuyáº¿n xe (ÄĂ£ duyá»‡t)';
        if (isAdmin) {
            const hasCustomActivities = typeof TEAMS !== 'undefined' && TEAMS.some(t => typeof t === 'object' && t.customActivities && t.customActivities.length > 0);
            if (hasCustomActivities) {
                statsLabel = 'Tá»•ng hoáº¡t Ä‘á»™ng khĂ¡c (ÄĂ£ duyá»‡t)';
            }
        } else {
            const managerTeam = currentUser ? (currentUser.team || '') : '';
            if (managerTeam && typeof TEAMS !== 'undefined') {
                const teamObj = TEAMS.find(t => typeof t === 'object' && t.name === managerTeam);
                const hasCustomActivities = !!(teamObj && teamObj.customActivities && teamObj.customActivities.length > 0);
                if (hasCustomActivities) {
                    const activityNames = teamObj.customActivities.map(a => a.name).join(' / ');
                    statsLabel = `Tá»•ng ${activityNames} (ÄĂ£ duyá»‡t)`;
                }
            }
        }

        const labelEl = document.getElementById('stat-total-trips-label');
        if (labelEl) labelEl.textContent = statsLabel;
    } catch (e) {}
}

async function refreshAdminRecords() {
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
        let url = '/api/records?';
        if (month) url += `month=${month}&`;
        if (userId) url += `userId=${userId}&`;

        const data = await api(url);
        const records = data.records;
        loadedRecords = records;
        const usersData = await api('/api/users');
        const users = usersData.users;
        loadedUsers = users;
        const currentUser = JSON.parse(localStorage.getItem('ot_current_user') || 'null');
        const isAdmin = currentUser && (currentUser.username === 'admin' || currentUser.isSuperAdmin);

        let hasCustomActivities = false;
        let adminBtnText = '2. Hoáº¡t Ä‘á»™ng khĂ¡c';
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
                        adminBtnText = '2. Hoáº¡t Ä‘á»™ng khĂ¡c';
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
                    <th>NhĂ¢n viĂªn</th>
                    <th>NhĂ³m</th>
                    <th>NgĂ y</th>
                    <th>OT TrÆ°a</th>
                    <th>OT Chiá»u</th>
                    <th>Khung giá» (Chiá»u)</th>
                    <th>Tá»•ng OT (giá»)</th>
                    <th>Ghi chĂº</th>
                    <th>Tráº¡ng thĂ¡i</th>
                    <th>Thao tĂ¡c</th>
                </tr>`;
            } else {
                approvedTbody.previousElementSibling.innerHTML = `<tr>
                    <th>NhĂ¢n viĂªn</th>
                    <th>NhĂ³m</th>
                    <th>NgĂ y</th>
                    <th>Hoáº¡t Ä‘á»™ng</th>
                    <th>HĂ¬nh thá»©c / Chi tiáº¿t</th>
                    <th>Ghi chĂº</th>
                    <th>Tráº¡ng thĂ¡i</th>
                    <th>Thao tĂ¡c</th>
                </tr>`;
            }
        }
        if (pendingTbody && pendingTbody.previousElementSibling) {
            if (currentAdminRecType === 'ot') {
                pendingTbody.previousElementSibling.innerHTML = `<tr>
                    <th style="width: 40px; text-align: center;"><input type="checkbox" id="chk-pending-select-all" style="width: 14px; height: 14px; margin: 0; cursor: pointer;"></th>
                    <th>NhĂ¢n viĂªn</th>
                    <th>NhĂ³m</th>
                    <th>NgĂ y</th>
                    <th>OT TrÆ°a</th>
                    <th>OT Chiá»u</th>
                    <th>Khung giá» (Chiá»u)</th>
                    <th>Tá»•ng OT (giá»)</th>
                    <th>Ghi chĂº</th>
                    <th>Thao tĂ¡c</th>
                </tr>`;
            } else {
                pendingTbody.previousElementSibling.innerHTML = `<tr>
                    <th style="width: 40px; text-align: center;"><input type="checkbox" id="chk-pending-select-all" style="width: 14px; height: 14px; margin: 0; cursor: pointer;"></th>
                    <th>NhĂ¢n viĂªn</th>
                    <th>NhĂ³m</th>
                    <th>NgĂ y</th>
                    <th>Hoáº¡t Ä‘á»™ng</th>
                    <th>HĂ¬nh thá»©c / Chi tiáº¿t</th>
                    <th>Ghi chĂº</th>
                    <th>Thao tĂ¡c</th>
                </tr>`;
            }
        }
        if (rejectedTbody && rejectedTbody.previousElementSibling) {
            if (currentAdminRecType === 'ot') {
                rejectedTbody.previousElementSibling.innerHTML = `<tr>
                    <th style="width: 40px; text-align: center;"><input type="checkbox" id="chk-rejected-select-all" style="width: 14px; height: 14px; margin: 0; cursor: pointer;"></th>
                    <th>NhĂ¢n viĂªn</th>
                    <th>NhĂ³m</th>
                    <th>NgĂ y</th>
                    <th>OT TrÆ°a</th>
                    <th>OT Chiá»u</th>
                    <th>Khung giá» (Chiá»u)</th>
                    <th>Tá»•ng OT (giá»)</th>
                    <th>Ghi chĂº</th>
                    <th>Thao tĂ¡c</th>
                </tr>`;
            } else {
                rejectedTbody.previousElementSibling.innerHTML = `<tr>
                    <th style="width: 40px; text-align: center;"><input type="checkbox" id="chk-rejected-select-all" style="width: 14px; height: 14px; margin: 0; cursor: pointer;"></th>
                    <th>NhĂ¢n viĂªn</th>
                    <th>NhĂ³m</th>
                    <th>NgĂ y</th>
                    <th>Hoáº¡t Ä‘á»™ng</th>
                    <th>HĂ¬nh thá»©c / Chi tiáº¿t</th>
                    <th>Ghi chĂº</th>
                    <th>Thao tĂ¡c</th>
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
                            <span style="font-size: 15px; font-weight: 600; color: var(--text-secondary);">KhĂ´ng cĂ³ dá»¯ liá»‡u Ä‘Ă£ duyá»‡t</span>
                            <span style="font-size: 13px; color: var(--text-muted);">KhĂ´ng tĂ¬m tháº¥y báº£n ghi ${currentAdminRecType === 'ot' ? 'tÄƒng ca' : 'hoáº¡t Ä‘á»™ng tĂ¹y chá»n'} nĂ o Ä‘Ă£ Ä‘Æ°á»£c duyá»‡t trong thĂ¡ng nĂ y.</span>
                        </div>
                    </td>
                </tr>
            `;
        } else {
            approvedTbody.innerHTML = approved.map(r => {
                const user = users.find(u => u.id === r.userId);
                const teamName = user ? (user.team === 'admin' ? 'admin' : (user.team || 'ChÆ°a phĂ¢n team')) : 'N/A';
                const isBackfill = r.isBackfill || (r.note && (r.note.includes('[BĂ™ THĂNG TRÆ¯á»C]') || r.note.includes('[TÄ‚NG THĂNG NĂ€Y]')));
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
                const noteDisplay = r.note ? `<span class="text-note" title="${r.note}">${r.note}</span>` : '<span class="text-muted">â€”</span>';

                if (currentAdminRecType === 'ot') {
                    const timeRange = (r.otStart || r.otEnd) ? `<span class="text-time">${r.otStart || 'â€”'}</span> <span class="text-arrow">â†’</span> <span class="text-time">${r.otEnd || 'â€”'}</span>` : '<span class="text-muted">â€”</span>';
                    const totalOtBadge = `<span class="badge-total-ot">${r.totalHours.toFixed(1)}h</span>`;
                    return `<tr>
                        <td>${employeeCell}</td>
                        <td>${teamBadge}</td>
                        <td><span class="text-date">${formatDate(r.date)}</span></td>
                        <td>${r.hasLunchOT ? '<span class="tag tag-yes">âœ“ CĂ³</span>' : '<span class="tag tag-no">KhĂ´ng</span>'}</td>
                        <td>${r.eveningOTHours > 0 ? `<span class="text-green text-bold">${r.eveningOTHours.toFixed(1)}h</span>` : '<span class="text-muted">â€”</span>'}</td>
                        <td>${timeRange}</td>
                        <td>${totalOtBadge}</td>
                        <td>${noteDisplay}</td>
                        <td>${isBackfill ? '<span class="tag tag-yes" style="background:rgba(16,185,129,0.1); color:#10b981;">BĂ¹ tÄƒng ca</span>' : '<span class="tag tag-no" style="background:rgba(99,102,241,0.1); color:#6366f1;">ThÆ°á»ng</span>'}</td>
                        <td><div class="action-buttons">
                            <button class="btn-icon-only edit" onclick="editRecordDialog('${r.id}', 'admin')" title="Sá»­a" style="margin-right: 4px;">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                    <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                </svg>
                            </button>
                            <button class="btn-icon-only delete" onclick="deleteRecord('${r.id}', 'admin')" title="XĂ³a">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                                    <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2-2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                                </svg>
                            </button>
                        </div></td>
                    </tr>`;
                } else {
                    const detail = r.calcMode === 'trip' 
                        ? `<span class="tag" style="background: rgba(245,158,11,0.15); color: #f59e0b; border: 1px solid rgba(245,158,11,0.3); font-weight: 500;">đŸ ${r.deliveryProvince || 'ChÆ°a rĂµ'}</span>` 
                        : `<span class="tag" style="background: rgba(99,102,241,0.15); color: #6366f1; border: 1px solid rgba(99,102,241,0.3); font-weight: 500;">â±ï¸ ${r.totalHours.toFixed(1)}h</span>`;
                    
                    let badgeClass = 'status-approved';
                    let badgeText = 'ÄĂ£ duyá»‡t';
                    if (r.status === 'pending') {
                        badgeClass = 'status-pending';
                        badgeText = 'Chá» duyá»‡t';
                    } else if (r.status === 'rejected') {
                        badgeClass = 'status-rejected';
                        badgeText = 'Tá»« chá»‘i';
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
                            <button class="btn-icon-only edit" onclick="editRecordDialog('${r.id}', 'admin')" title="Sá»­a" style="margin-right: 4px;">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                    <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                </svg>
                            </button>
                            <button class="btn-icon-only delete" onclick="deleteRecord('${r.id}', 'admin')" title="XĂ³a">
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
                            <span style="font-size: 15px; font-weight: 600; color: var(--text-primary);">KhĂ´ng cĂ³ yĂªu cáº§u chá» duyá»‡t</span>
                            <span style="font-size: 13px; color: var(--text-muted);">Táº¥t cáº£ yĂªu cáº§u ${currentAdminRecType === 'ot' ? 'tÄƒng ca' : 'hoáº¡t Ä‘á»™ng tĂ¹y chá»n'} Ä‘Ă£ Ä‘Æ°á»£c xá»­ lĂ½ xong.</span>
                        </div>
                    </td>
                </tr>
            `;
        } else {
            pendingTbody.innerHTML = pending.map(r => {
                const user = users.find(u => u.id === r.userId);
                const teamName = user ? (user.team === 'admin' ? 'admin' : (user.team || 'ChÆ°a phĂ¢n team')) : 'N/A';
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
                const noteDisplay = r.note ? `<span class="text-note" title="${r.note}">${r.note}</span>` : '<span class="text-muted">â€”</span>';

                if (currentAdminRecType === 'ot') {
                    const timeRange = (r.otStart || r.otEnd) ? `<span class="text-time">${r.otStart || 'â€”'}</span> <span class="text-arrow">â†’</span> <span class="text-time">${r.otEnd || 'â€”'}</span>` : '<span class="text-muted">â€”</span>';
                    const totalOtBadge = `<span class="badge-total-ot">${r.totalHours.toFixed(1)}h</span>`;
                    return `<tr>
                        <td style="text-align: center;"><input type="checkbox" class="chk-pending-record" value="${r.id}" style="width: 14px; height: 14px; margin: 0; cursor: pointer;" onchange="updatePendingBulkActionsVisibility()"></td>
                        <td>${employeeCell}</td>
                        <td>${teamBadge}</td>
                        <td><span class="text-date">${formatDate(r.date)}</span></td>
                        <td>${r.hasLunchOT ? '<span class="tag tag-yes">âœ“ CĂ³</span>' : '<span class="tag tag-no">KhĂ´ng</span>'}</td>
                        <td>${r.eveningOTHours > 0 ? `<span class="text-green text-bold">${r.eveningOTHours.toFixed(1)}h</span>` : '<span class="text-muted">â€”</span>'}</td>
                        <td>${timeRange}</td>
                        <td>${totalOtBadge}</td>
                        <td>${noteDisplay}</td>
                        <td><div class="action-buttons">
                            <button class="btn btn-green btn-xs" onclick="approveRecord('${r.id}')" title="Duyá»‡t" style="margin-right: 4px; padding: 4px 8px; font-size: 11px;">
                                âœ“ Duyá»‡t
                            </button>
                            <button class="btn btn-danger btn-xs" onclick="rejectRecord('${r.id}')" title="Tá»« chá»‘i" style="padding: 4px 8px; font-size: 11px;">
                                âœ• Tá»« chá»‘i
                            </button>
                        </div></td>
                    </tr>`;
                } else {
                    const detail = r.calcMode === 'trip' 
                        ? `<span class="tag" style="background: rgba(245,158,11,0.15); color: #f59e0b; border: 1px solid rgba(245,158,11,0.3); font-weight: 500;">đŸ ${r.deliveryProvince || 'ChÆ°a rĂµ'}</span>` 
                        : `<span class="tag" style="background: rgba(99,102,241,0.15); color: #6366f1; border: 1px solid rgba(99,102,241,0.3); font-weight: 500;">â±ï¸ ${r.totalHours.toFixed(1)}h</span>`;
                    return `<tr>
                        <td style="text-align: center;"><input type="checkbox" class="chk-pending-record" value="${r.id}" style="width: 14px; height: 14px; margin: 0; cursor: pointer;" onchange="updatePendingBulkActionsVisibility()"></td>
                        <td>${employeeCell}</td>
                        <td>${teamBadge}</td>
                        <td><span class="text-date">${formatDate(r.date)}</span></td>
                        <td><strong>${r.customActivity}</strong></td>
                        <td>${detail}</td>
                        <td>${noteDisplay}</td>
                        <td><div class="action-buttons">
                            <button class="btn btn-green btn-xs" onclick="approveRecord('${r.id}')" title="Duyá»‡t" style="margin-right: 4px; padding: 4px 8px; font-size: 11px;">
                                âœ“ Duyá»‡t
                            </button>
                            <button class="btn btn-danger btn-xs" onclick="rejectRecord('${r.id}')" title="Tá»« chá»‘i" style="padding: 4px 8px; font-size: 11px;">
                                âœ• Tá»« chá»‘i
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
                            <span style="font-size: 15px; font-weight: 600; color: var(--text-secondary);">KhĂ´ng cĂ³ báº£n ghi bá»‹ tá»« chá»‘i</span>
                            <span style="font-size: 13px; color: var(--text-muted);">KhĂ´ng cĂ³ yĂªu cáº§u ${currentAdminRecType === 'ot' ? 'tÄƒng ca' : 'hoáº¡t Ä‘á»™ng tĂ¹y chá»n'} nĂ o bá»‹ tá»« chá»‘i duyá»‡t.</span>
                        </div>
                    </td>
                </tr>
            `;
        } else {
            rejectedTbody.innerHTML = rejected.map(r => {
                const user = users.find(u => u.id === r.userId);
                const teamName = user ? (user.team === 'admin' ? 'admin' : (user.team || 'ChÆ°a phĂ¢n team')) : 'N/A';
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
                const noteDisplay = r.note ? `<span class="text-note" title="${r.note}">${r.note}</span>` : '<span class="text-muted">â€”</span>';
 
                if (currentAdminRecType === 'ot') {
                    const timeRange = (r.otStart || r.otEnd) ? `<span class="text-time">${r.otStart || 'â€”'}</span> <span class="text-arrow">â†’</span> <span class="text-time">${r.otEnd || 'â€”'}</span>` : '<span class="text-muted">â€”</span>';
                    const totalOtBadge = `<span class="badge-total-ot">${r.totalHours.toFixed(1)}h</span>`;
                    return `<tr>
                        <td style="text-align: center;"><input type="checkbox" class="chk-rejected-record" value="${r.id}" style="width: 14px; height: 14px; margin: 0; cursor: pointer;" onchange="updateRejectedBulkActionsVisibility()"></td>
                        <td>${employeeCell}</td>
                        <td>${teamBadge}</td>
                        <td><span class="text-date">${formatDate(r.date)}</span></td>
                        <td>${r.hasLunchOT ? '<span class="tag tag-yes">âœ“ CĂ³</span>' : '<span class="tag tag-no">KhĂ´ng</span>'}</td>
                        <td>${r.eveningOTHours > 0 ? `<span class="text-green text-bold">${r.eveningOTHours.toFixed(1)}h</span>` : '<span class="text-muted">â€”</span>'}</td>
                        <td>${timeRange}</td>
                        <td>${totalOtBadge}</td>
                        <td>${noteDisplay}</td>
                        <td><div class="action-buttons" style="display: flex; align-items: center; gap: 8px;">
                            <button class="btn btn-primary btn-xs" onclick="approveRecord('${r.id}')" title="Duyá»‡t láº¡i" style="padding: 4px 8px; font-size: 11px;">
                                âœ“ Duyá»‡t láº¡i
                            </button>
                            <button class="btn-icon-only delete" onclick="deleteRecord('${r.id}', 'admin')" title="XĂ³a" style="padding: 2px; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); border-radius: 4px; color: #ef4444; cursor: pointer;">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13" height="13">
                                    <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                                </svg>
                            </button>
                        </div></td>
                    </tr>`;
                } else {
                    const detail = r.calcMode === 'trip' 
                        ? `<span class="tag" style="background: rgba(245,158,11,0.15); color: #f59e0b; border: 1px solid rgba(245,158,11,0.3); font-weight: 500;">đŸ ${r.deliveryProvince || 'ChÆ°a rĂµ'}</span>` 
                        : `<span class="tag" style="background: rgba(99,102,241,0.15); color: #6366f1; border: 1px solid rgba(99,102,241,0.3); font-weight: 500;">â±ï¸ ${r.totalHours.toFixed(1)}h</span>`;
                    return `<tr>
                        <td style="text-align: center;"><input type="checkbox" class="chk-rejected-record" value="${r.id}" style="width: 14px; height: 14px; margin: 0; cursor: pointer;" onchange="updateRejectedBulkActionsVisibility()"></td>
                        <td>${employeeCell}</td>
                        <td>${teamBadge}</td>
                        <td><span class="text-date">${formatDate(r.date)}</span></td>
                        <td><strong>${r.customActivity}</strong></td>
                        <td>${detail}</td>
                        <td>${noteDisplay}</td>
                        <td><div class="action-buttons" style="display: flex; align-items: center; gap: 8px;">
                            <button class="btn btn-primary btn-xs" onclick="approveRecord('${r.id}')" title="Duyá»‡t láº¡i" style="padding: 4px 8px; font-size: 11px;">
                                âœ“ Duyá»‡t láº¡i
                            </button>
                            <button class="btn-icon-only delete" onclick="deleteRecord('${r.id}', 'admin')" title="XĂ³a" style="padding: 2px; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); border-radius: 4px; color: #ef4444; cursor: pointer;">
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
            totalEveningOT += r.eveningOTHours;
            totalHours += r.totalHours;
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
            <div class="summary-item"><span class="summary-label">Tá»•ng báº£n ghi:</span><span class="summary-value">${approvedAll.length}</span></div>
            <div class="summary-item"><span class="summary-label">OT TrÆ°a:</span><span class="summary-value">${totalLunchOT.toFixed(1)}h</span></div>
            <div class="summary-item"><span class="summary-label">OT Chiá»u:</span><span class="summary-value">${totalEveningOT.toFixed(1)}h</span></div>
            <div class="summary-item"><span class="summary-label">Tá»•ng OT:</span><span class="summary-value">${totalHours.toFixed(1)}h</span></div>
            <div class="summary-item"><span class="summary-label">Tá»•ng chuyáº¿n xe:</span><span class="summary-value">${totalTrips}</span></div>`;

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

async function refreshAdminUsers() {
    try {
        const currentUser = JSON.parse(localStorage.getItem('ot_current_user') || 'null');
        const isSuperAdmin = currentUser && (currentUser.username === 'admin' || currentUser.isSuperAdmin);
        const isBelongToAdminTeam = currentUser && (currentUser.team === 'admin' || currentUser.username === 'admin' || currentUser.isSuperAdmin);

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

            // NĂºt reset liĂªn káº¿t thiáº¿t bá»‹
            let deviceUnlinkBtn = '';
            if (u.deviceId || u.browserDeviceId) {
                deviceUnlinkBtn = `
                    <button class="btn-reset btn-reset-mobile" onclick="showUnlinkOptions('${u.id}', '${u.fullname}', ${!!u.deviceId}, ${!!u.browserDeviceId})" title="Há»§y liĂªn káº¿t thiáº¿t bá»‹" style="margin-right: 4px;">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                            <path d="M18.36 6.64a9 9 0 1 1-12.73 0"/>
                            <line x1="12" y1="2" x2="12" y2="12"/>
                        </svg>
                        Há»§y liĂªn káº¿t
                    </button>
                `;
            }
            let browserUnlinkBtn = '';
            let approveBtn = '';
            if (u.pendingUnlink) {
                approveBtn = `
                    <button class="btn-reset btn-reset-approve" onclick="approveUnlinkDevice('${u.id}', '${u.fullname}')" title="Duyá»‡t yĂªu cáº§u huá»· liĂªn káº¿t" style="margin-right: 4px;">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                            <polyline points="20 6 9 17 4 12"/>
                        </svg>
                        Duyá»‡t Huá»·
                    </button>
                    <button class="btn-reset btn-reset-reject" onclick="rejectUnlinkDevice('${u.id}', '${u.fullname}')" title="Tá»« chá»‘i yĂªu cáº§u huá»· liĂªn káº¿t" style="margin-right: 4px;">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                            <line x1="18" y1="6" x2="6" y2="18"/>
                            <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                        Tá»« Chá»‘i
                    </button>
                `;
            }

            const unlinkBadge = u.pendingUnlink ? `
                <span class="unlink-badge" style="display:inline-block; font-size:0.75rem; background:rgba(239, 68, 68, 0.15); color:#ef4444; border:1px solid rgba(239, 68, 68, 0.3); padding:2px 8px; border-radius:12px; font-weight:700; margin-left:8px; animation: blink-red 1.5s infinite; cursor:pointer;" onclick="approveUnlinkDevice('${u.id}', '${u.fullname}')" title="Báº¥m vĂ o Ä‘Ă¢y Ä‘á»ƒ phĂª duyá»‡t huá»· liĂªn káº¿t thiáº¿t bá»‹">
                    â ï¸ Xin huá»· liĂªn káº¿t
                </span>
            ` : '';

            return `<tr>
                <td>${i + 1}</td>
                <td><strong>${u.fullname}</strong>${unlinkBadge}</td>
                <td>${u.username}</td>
                <td><span style="font-weight:600; color:var(--text-secondary);">${u.team || 'ChÆ°a phĂ¢n team'}</span></td>
                <td><span class="tag tag-employee">NhĂ¢n viĂªn</span></td>
                <td><span class="text-purple text-bold">${totalOT.toFixed(1)}h</span></td>
                <td><div class="action-buttons">
                    ${approveBtn}
                    ${deviceUnlinkBtn}
                    ${browserUnlinkBtn}
                    ${(!u.team || u.team !== 'admin' || isBelongToAdminTeam || (currentUser && currentUser.id === u.id)) ? `
                    <button class="btn-icon-only edit" onclick="editUserDialog('${u.id}')" title="Sá»­a" style="margin-right: 4px;">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                    </button>
                    ` : ''}
                    ${(!u.team || u.team !== 'admin' || isBelongToAdminTeam) ? `
                    <button class="btn-icon-only delete" onclick="deleteUser('${u.id}')" title="XĂ³a">
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
                    <span style="font-size: 15px; font-weight: 600; color: var(--text-secondary);">KhĂ´ng cĂ³ nhĂ¢n viĂªn</span>
                    <span style="font-size: 13px; color: var(--text-muted);">Hiá»‡n táº¡i chÆ°a cĂ³ nhĂ¢n viĂªn nĂ o trong danh sĂ¡ch.</span>
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
                <td><span class="tag tag-admin">Quáº£n lĂ½</span></td>
                <td><div class="action-buttons">
                    ${(isSuperAdmin && (currentUser && currentUser.id !== u.id)) ? `
                    <button class="btn-icon-only edit" onclick="editUserDialog('${u.id}')" title="Sá»­a" style="margin-right: 4px;">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                    </button>
                    ` : ''}
                    ${(isSuperAdmin && !u.isSuperAdmin && u.username !== 'admin') ? `
                        <button class="btn-icon-only delete" onclick="deleteUser('${u.id}')" title="XĂ³a">
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
                    <span style="font-size: 15px; font-weight: 600; color: var(--text-secondary);">KhĂ´ng cĂ³ quáº£n lĂ½</span>
                    <span style="font-size: 13px; color: var(--text-muted);">KhĂ´ng tĂ¬m tháº¥y tĂ i khoáº£n quáº£n lĂ½ nĂ o.</span>
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
                        <button class="btn-reset btn-reset-mobile" onclick="showUnlinkOptions('${u.id}', '${u.fullname}', ${!!u.deviceId}, ${!!u.browserDeviceId})" title="Há»§y liĂªn káº¿t thiáº¿t bá»‹" style="margin-right: 4px;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                                <path d="M18.36 6.64a9 9 0 1 1-12.73 0"/>
                                <line x1="12" y1="2" x2="12" y2="12"/>
                            </svg>
                            Há»§y liĂªn káº¿t
                        </button>
                    `;
                }
                let browserUnlinkBtn = '';
                let approveBtn = '';
                if (u.pendingUnlink) {
                    approveBtn = `
                        <button class="btn-reset btn-reset-approve" onclick="approveUnlinkDevice('${u.id}', '${u.fullname}')" title="Duyá»‡t yĂªu cáº§u huá»· liĂªn káº¿t" style="margin-right: 4px;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                                <polyline points="20 6 9 17 4 12"/>
                            </svg>
                            Duyá»‡t Huá»·
                        </button>
                        <button class="btn-reset btn-reset-reject" onclick="rejectUnlinkDevice('${u.id}', '${u.fullname}')" title="Tá»« chá»‘i yĂªu cáº§u huá»· liĂªn káº¿t" style="margin-right: 4px;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                                <line x1="18" y1="6" x2="6" y2="18"/>
                                <line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                            Tá»« Chá»‘i
                        </button>
                    `;
                }

                const unlinkBadge = u.pendingUnlink ? `
                    <span class="unlink-badge" style="display:inline-block; font-size:0.75rem; background:rgba(239, 68, 68, 0.15); color:#ef4444; border:1px solid rgba(239, 68, 68, 0.3); padding:2px 8px; border-radius:12px; font-weight:700; margin-left:8px; animation: blink-red 1.5s infinite; cursor:pointer;" onclick="approveUnlinkDevice('${u.id}', '${u.fullname}')" title="Báº¥m vĂ o Ä‘Ă¢y Ä‘á»ƒ phĂª duyá»‡t huá»· liĂªn káº¿t thiáº¿t bá»‹">
                        â ï¸ Xin huá»· liĂªn káº¿t
                    </span>
                ` : '';

                return `<tr>
                    <td>${i + 1}</td>
                    <td><strong>${u.fullname}</strong>${unlinkBadge}</td>
                    <td>${u.username}</td>
                    <td><span style="font-weight:600; color:var(--text-secondary);">${u.team || 'ChÆ°a phĂ¢n team'}</span></td>
                    <td><span class="tag tag-employee">NhĂ¢n viĂªn</span></td>
                    <td><span class="text-purple text-bold">${totalOT.toFixed(1)}h</span></td>
                    <td><div class="action-buttons">
                        ${approveBtn}
                        ${deviceUnlinkBtn}
                        ${browserUnlinkBtn}
                        ${(!u.team || u.team !== 'admin' || isBelongToAdminTeam || (currentUser && currentUser.id === u.id)) ? `
                        <button class="btn-icon-only edit" onclick="editUserDialog('${u.id}')" title="Sá»­a" style="margin-right: 4px;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                        </button>
                        ` : ''}
                        ${(!u.team || u.team !== 'admin' || isBelongToAdminTeam) ? `
                        <button class="btn-icon-only delete" onclick="deleteUser('${u.id}')" title="XĂ³a">
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
                        <span style="font-size: 15px; font-weight: 600; color: var(--text-secondary);">KhĂ´ng cĂ³ nhĂ¢n viĂªn chÆ°a phĂ¢n team</span>
                        <span style="font-size: 13px; color: var(--text-muted);">Táº¥t cáº£ nhĂ¢n viĂªn Ä‘Ă£ Ä‘Æ°á»£c phĂ¢n bá»• vĂ o cĂ¡c nhĂ³m lĂ m viá»‡c.</span>
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
        return `<div class="chart-empty">ChÆ°a cĂ³ dá»¯ liá»‡u Ä‘á»™i nhĂ³m</div>`;
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
        return `<div class="chart-empty">ChÆ°a cĂ³ dá»¯ liá»‡u xu hÆ°á»›ng ngĂ y</div>`;
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
    svgHtml += `<text x="${paddingLeft}" y="${labelY}" fill="var(--text-muted)" font-size="9" text-anchor="start">NgĂ y 1</text>`;
    svgHtml += `<text x="${paddingLeft + chartWidth / 2}" y="${labelY}" fill="var(--text-muted)" font-size="9" text-anchor="middle">NgĂ y 15</text>`;
    svgHtml += `<text x="${width - paddingRight}" y="${labelY}" fill="var(--text-muted)" font-size="9" text-anchor="end">NgĂ y ${entries.length}</text>`;
    
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
            const detailedRecords = data.records;
            const detailRow = document.createElement('tr');
            detailRow.className = 'detail-row';
            
            let recordsHtml = '';
            if (detailedRecords.length === 0) {
                recordsHtml = '<div style="padding: 12px; color: var(--text-muted); text-align: center; font-style: italic;">KhĂ´ng cĂ³ chi tiáº¿t tÄƒng ca cho thĂ¡ng nĂ y.</div>';
            } else {
                recordsHtml = `
                    <div class="report-detail-wrapper" style="padding: 16px 24px; background: rgba(0,0,0,0.18); margin: 6px 12px; border-radius: 8px;">
                        <h5 style="margin-top: 0; margin-bottom: 12px; color: var(--accent-green); font-size: 11px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase;">Chi tiáº¿t lá»‹ch sá»­ lĂ m thĂªm giá»</h5>
                        <table class="detail-table" style="width: 100%; border-collapse: collapse; font-size: 12px;">
                            <thead>
                                <tr style="border-bottom: 1px solid rgba(255,255,255,0.08); text-align: left;">
                                    <th style="color: var(--text-secondary); font-weight: 600;">NgĂ y lĂ m viá»‡c</th>
                                    <th style="color: var(--text-secondary); font-weight: 600;">OT TrÆ°a</th>
                                    <th style="color: var(--text-secondary); font-weight: 600;">OT Chiá»u/Tá»‘i (Khung giá»)</th>
                                    <th style="color: var(--text-secondary); font-weight: 600;">Tuyáº¿n Ä‘Æ°á»ng (Xe tá»‰nh)</th>
                                    <th style="color: var(--text-secondary); font-weight: 600;">Tráº¡ng thĂ¡i</th>
                                    <th style="color: var(--text-secondary); font-weight: 600;">Ghi chĂº</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${detailedRecords.map(r => {
                                    const hasLunch = r.hasLunchOT ? '1.0 tiáº¿ng' : '-';
                                    const eveningH = r.eveningOTHours ? `${r.eveningOTHours.toFixed(1)} tiáº¿ng (${r.otStart} - ${r.otEnd})` : '-';
                                    const province = r.deliveryProvince || '-';
                                    const statusText = r.status === 'approved' ? '<span class="tag tag-success">ÄĂ£ duyá»‡t</span>' : (r.status === 'pending' ? '<span class="tag tag-warning">Äang chá»</span>' : '<span class="tag tag-danger">Tá»« chá»‘i</span>');
                                    const isBackfillText = r.isBackfill ? '<span style="font-size: 9px; padding: 2px 5px; background: rgba(245,158,11,0.15); color: var(--accent-orange); border-radius: 4px; font-weight: 800; margin-left: 6px;">BĂ™</span>' : '';
                                    return `
                                        <tr style="border-bottom: 1px solid rgba(255,255,255,0.04);">
                                            <td><strong>${r.date}</strong>${isBackfillText}</td>
                                            <td>${hasLunch}</td>
                                            <td>${eveningH}</td>
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
            showToast('Lá»—i khi táº£i chi tiáº¿t', 'error');
        });
    }
};

async function refreshReport() {
    const month = document.getElementById('report-filter-month').value;
    const filterTeam = document.getElementById('report-filter-team') ? document.getElementById('report-filter-team').value : '';
    const searchVal = document.getElementById('report-search-name') ? document.getElementById('report-search-name').value : '';
    
    try {
        const usersData = await api('/api/users');
        const currentUser = JSON.parse(localStorage.getItem('ot_current_user') || 'null');
        const isAdmin = currentUser && (currentUser.username === 'admin' || currentUser.isSuperAdmin);
        
        let users = usersData.users.filter(u => u.role === 'employee');
        
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

        const recData = await api(`/api/records?month=${month}`);
        const records = recData.records.filter(r => {
            const isBackfill = r.isBackfill || (r.note && (r.note.includes('[BĂ™ THĂNG TRÆ¯á»C]') || r.note.includes('[TÄ‚NG THĂNG NĂ€Y]')));
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
            const eveningH = ur.reduce((s, r) => s + r.eveningOTHours, 0);
            const totalH = lunchH + eveningH;
            
            if (totalH > 0) {
                totalOTHours += totalH;
                activeEmployeesSet.add(u.id);
            }
            
            // Team stats
            const teamName = u.team === 'admin' ? 'admin' : (u.team || 'ChÆ°a phĂ¢n team');
            teamOTs[teamName] = (teamOTs[teamName] || 0) + totalH;
        });
        
        // Sum daily trend
        records.forEach(r => {
            const belongsToMatchingUser = users.some(u => u.id === r.userId);
            if (belongsToMatchingUser && dailyOTs[r.date] !== undefined) {
                const lunchH = r.hasLunchOT ? OT_LUNCH_HOURS : 0;
                const eveningH = r.eveningOTHours || 0;
                dailyOTs[r.date] += (lunchH + eveningH);
            }
        });
        
        // Find top team
        let topTeam = '-';
        let maxTeamHours = 0;
        Object.entries(teamOTs).forEach(([team, val]) => {
            if (val > maxTeamHours) {
                maxTeamHours = val;
                topTeam = `${team} (${val.toFixed(1)}h)`;
            }
        });
        
        // Update DOM KPIs
        const activeCount = activeEmployeesSet.size;
        const avgHours = activeCount > 0 ? (totalOTHours / activeCount) : 0;
        
        document.getElementById('rep-stat-total-hours').textContent = `${totalOTHours.toFixed(1)}h`;
        document.getElementById('rep-stat-avg-hours').textContent = `${avgHours.toFixed(1)}h`;
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
            const eveningH = ur.reduce((s, r) => s + r.eveningOTHours, 0);
            const totalH = lunchH + eveningH;
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
            tbody.innerHTML = '<tr class="empty-row"><td colspan="7">KhĂ´ng tĂ¬m tháº¥y káº¿t quáº£ phĂ¹ há»£p</td></tr>';
            return;
        }

        tbody.innerHTML = userReportData.map((data, i) => {
            const { user: u, days, lunchH, eveningH, totalH } = data;
            const teamName = u.team === 'admin' ? 'admin' : (u.team || 'ChÆ°a phĂ¢n team');

            return `<tr class="report-row" onclick="toggleReportRow(this, '${u.id}')">
                <td>${i + 1}</td>
                <td>
                    <div class="employee-name-cell">
                        <svg class="chevron-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                        <strong>${u.fullname}</strong>
                    </div>
                </td>
                <td><span class="tag" style="background: rgba(156,163,175,0.1); color: var(--text-primary);">${teamName}</span></td>
                <td style="text-align: center;">${days} ngĂ y</td>
                <td style="text-align: center;">${lunchH.toFixed(1)}h</td>
                <td style="text-align: center;">${eveningH.toFixed(1)}h</td>
                <td style="text-align: center;"><span class="text-purple text-bold" style="font-size: 13px;">${totalH.toFixed(1)}h</span></td>
            </tr>`;
        }).join('');
        
        // Váº½ biá»ƒu Ä‘á»“ phĂ¢n tĂ­ch trá»±c quan
        try {
            renderAnalyticsCharts(teamOTs, dailyOTs);
        } catch (err) {
            console.error("Lá»—i váº½ biá»ƒu Ä‘á»“ phĂ¢n tĂ­ch:", err);
        }
    } catch (e) {
        console.error('Lá»—i khi váº½ bĂ¡o cĂ¡o:', e);
    }
}

function renderAnalyticsCharts(teamOTs, dailyOTs) {
    // 1. Váº½ biá»ƒu Ä‘á»“ cá»™t ngang theo Team
    const teamBarsContainer = document.getElementById('chart-teams-bars');
    if (teamBarsContainer) {
        const teamEntries = Object.entries(teamOTs).sort((a, b) => b[1] - a[1]); // Sáº¯p xáº¿p giáº£m dáº§n
        const maxHours = teamEntries.length > 0 ? Math.max(...teamEntries.map(e => e[1])) : 0;
        
        if (teamEntries.length === 0 || maxHours === 0) {
            teamBarsContainer.innerHTML = '<div style="text-align: center; color: #71717a; padding: 20px 0; font-size: 0.9rem;">KhĂ´ng cĂ³ dá»¯ liá»‡u tÄƒng ca</div>';
        } else {
            teamBarsContainer.innerHTML = teamEntries.map(([team, hours]) => {
                const percent = maxHours > 0 ? (hours / maxHours) * 100 : 0;
                return `
                    <div class="chart-team-row">
                        <span class="chart-team-label" title="${team}">${team}</span>
                        <div class="chart-team-progress-wrapper">
                            <div class="chart-team-progress" style="width: ${percent}%;"></div>
                        </div>
                        <span class="chart-team-value">${hours.toFixed(1)}h</span>
                    </div>
                `;
            }).join('');
        }
    }

    // 2. Váº½ biá»ƒu Ä‘á»“ xu hÆ°á»›ng theo ngĂ y cá»§a thĂ¡ng
    const daysTrendContainer = document.getElementById('chart-days-trend');
    if (daysTrendContainer) {
        const dailyEntries = Object.entries(dailyOTs).sort((a, b) => a[0].localeCompare(b[0])); // NgĂ y tÄƒng dáº§n
        const maxDailyHours = dailyEntries.length > 0 ? Math.max(...dailyEntries.map(e => e[1])) : 0;
        
        if (dailyEntries.length === 0 || maxDailyHours === 0) {
            daysTrendContainer.innerHTML = '<div style="text-align: center; color: #71717a; width: 100%; font-size: 0.9rem;">KhĂ´ng cĂ³ dá»¯ liá»‡u biáº¿n Ä‘á»™ng</div>';
        } else {
            daysTrendContainer.innerHTML = dailyEntries.map(([dateStr, hours]) => {
                const dayNum = parseInt(dateStr.substring(8, 10));
                const percent = maxDailyHours > 0 ? (hours / maxDailyHours) * 100 : 0;
                return `
                    <div class="chart-day-column">
                        <div class="chart-day-tooltip">NgĂ y ${dayNum}: ${hours.toFixed(1)}h</div>
                        <div class="chart-day-bar" style="--height: ${percent}%;"></div>
                        <span class="chart-day-label">${dayNum}</span>
                    </div>
                `;
            }).join('');
        }
    }
}

function deleteUser(userId) {
    showModal('XĂ³a nhĂ¢n viĂªn', 'Báº¡n cĂ³ cháº¯c muá»‘n xĂ³a nhĂ¢n viĂªn nĂ y?<br>Táº¥t cáº£ dá»¯ liá»‡u tÄƒng ca cÅ©ng sáº½ bá»‹ xĂ³a.', [
        { text: 'Há»§y', class: 'btn-ghost' },
        { text: 'XĂ³a', class: 'btn btn-danger btn-sm', action: async () => {
            try {
                await api(`/api/users/${userId}`, 'DELETE');
                await Promise.all([populateUserFilter(), refreshAdminUsers(), refreshAdminRecords(), refreshAdminStats(), refreshReport()]);
                showToast('ÄĂ£ xĂ³a nhĂ¢n viĂªn');
            } catch (e) { showToast(e.message, 'error'); }
        }}
    ]);
}

function deleteRecord(recordId, source) {
    showModal('XĂ³a báº£n ghi', 'Báº¡n cĂ³ cháº¯c muá»‘n xĂ³a báº£n ghi tÄƒng ca nĂ y?', [
        { text: 'Há»§y', class: 'btn-ghost' },
        { text: 'XĂ³a', class: 'btn btn-danger btn-sm', action: async () => {
            try {
                await api(`/api/records/${recordId}`, 'DELETE');
                if (source === 'admin') {
                    await Promise.all([refreshAdminRecords(), refreshAdminStats(), refreshReport()]);
                } else {
                    await refreshEmployeeRecords();
                }
                showToast('ÄĂ£ xĂ³a báº£n ghi');
            } catch (e) { showToast(e.message, 'error'); }
        }}
    ]);
}

async function approveRecord(recordId) {
    try {
        await api(`/api/records/${recordId}`, 'PUT', { status: 'approved' });
        showToast('ÄĂ£ duyá»‡t báº£n ghi tÄƒng ca!');
        await Promise.all([refreshAdminRecords(), refreshAdminStats(), refreshReport()]);
    } catch (e) {
        showToast(e.message, 'error');
    }
}

async function rejectRecord(recordId) {
    showModal('Tá»« chá»‘i báº£n ghi', 'Báº¡n cĂ³ cháº¯c muá»‘n tá»« chá»‘i báº£n ghi tÄƒng ca nĂ y?', [
        { text: 'Há»§y', class: 'btn-ghost' },
        { text: 'Tá»« chá»‘i', class: 'btn btn-danger btn-sm', action: async () => {
            try {
                await api(`/api/records/${recordId}`, 'PUT', { status: 'rejected' });
                await Promise.all([refreshAdminRecords(), refreshAdminStats(), refreshReport()]);
                showToast('ÄĂ£ tá»« chá»‘i báº£n ghi');
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
            countText.textContent = `ÄĂ£ chá»n ${checkedChks.length} báº£n ghi`;
        } else {
            bulkBar.style.display = 'none';
        }
    }
}

async function bulkApproveRecords() {
    const checkedChks = document.querySelectorAll('.chk-pending-record:checked');
    const recordIds = Array.from(checkedChks).map(chk => chk.value);
    if (recordIds.length === 0) return;

    showModal('Duyá»‡t hĂ ng loáº¡t', `Báº¡n cĂ³ cháº¯c cháº¯n muá»‘n duyá»‡t ${recordIds.length} báº£n ghi Ä‘Ă£ chá»n khĂ´ng?`, [
        { text: 'Há»§y', class: 'btn-ghost' },
        { text: 'Duyá»‡t', class: 'btn btn-primary btn-sm', action: async () => {
            try {
                showToast(`Äang duyá»‡t ${recordIds.length} báº£n ghi...`, 'info');
                await Promise.all(recordIds.map(id => api(`/api/records/${id}`, 'PUT', { status: 'approved' })));
                showToast(`ÄĂ£ duyá»‡t thĂ nh cĂ´ng ${recordIds.length} báº£n ghi!`);
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

    showModal('Tá»« chá»‘i hĂ ng loáº¡t', `Báº¡n cĂ³ cháº¯c cháº¯n muá»‘n tá»« chá»‘i ${recordIds.length} báº£n ghi Ä‘Ă£ chá»n khĂ´ng?`, [
        { text: 'Há»§y', class: 'btn-ghost' },
        { text: 'Tá»« chá»‘i', class: 'btn btn-danger btn-sm', action: async () => {
            try {
                showToast(`Äang tá»« chá»‘i ${recordIds.length} báº£n ghi...`, 'info');
                await Promise.all(recordIds.map(id => api(`/api/records/${id}`, 'PUT', { status: 'rejected' })));
                showToast(`ÄĂ£ tá»« chá»‘i thĂ nh cĂ´ng ${recordIds.length} báº£n ghi!`);
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
            countText.textContent = `ÄĂ£ chá»n ${checkedChks.length} báº£n ghi`;
        } else {
            bulkBar.style.display = 'none';
        }
    }
}

async function bulkApproveRejectedRecords() {
    const checkedChks = document.querySelectorAll('.chk-rejected-record:checked');
    const recordIds = Array.from(checkedChks).map(chk => chk.value);
    if (recordIds.length === 0) return;

    showModal('Duyá»‡t láº¡i hĂ ng loáº¡t', `Báº¡n cĂ³ cháº¯c cháº¯n muá»‘n duyá»‡t láº¡i ${recordIds.length} báº£n ghi Ä‘Ă£ chá»n khĂ´ng?`, [
        { text: 'Há»§y', class: 'btn-ghost' },
        { text: 'Duyá»‡t láº¡i', class: 'btn btn-primary btn-sm', action: async () => {
            try {
                showToast(`Äang duyá»‡t láº¡i ${recordIds.length} báº£n ghi...`, 'info');
                await Promise.all(recordIds.map(id => api(`/api/records/${id}`, 'PUT', { status: 'approved' })));
                showToast(`ÄĂ£ duyá»‡t láº¡i thĂ nh cĂ´ng ${recordIds.length} báº£n ghi!`);
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

    showModal('XĂ³a hĂ ng loáº¡t', `Báº¡n cĂ³ cháº¯c cháº¯n muá»‘n xĂ³a vÄ©nh viá»…n ${recordIds.length} báº£n ghi Ä‘Ă£ chá»n khĂ´ng?`, [
        { text: 'Há»§y', class: 'btn-ghost' },
        { text: 'XĂ³a', class: 'btn btn-danger btn-sm', action: async () => {
            try {
                showToast(`Äang xĂ³a ${recordIds.length} báº£n ghi...`, 'info');
                await Promise.all(recordIds.map(id => api(`/api/records/${id}`, 'DELETE')));
                showToast(`ÄĂ£ xĂ³a thĂ nh cĂ´ng ${recordIds.length} báº£n ghi!`);
                await Promise.all([refreshAdminRecords(), refreshAdminStats(), refreshReport()]);
            } catch (e) {
                showToast(e.message, 'error');
            }
        }}
    ]);
}

async function exportExcel() {
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
            const isBackfill = r.isBackfill || (r.note && (r.note.includes('[BĂ™ THĂNG TRÆ¯á»C]') || r.note.includes('[TÄ‚NG THĂNG NĂ€Y]')));
            return r.status === 'approved' || (!isBackfill && r.status !== 'pending' && r.status !== 'rejected');
        });

        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        const exportTime = `${formatDateFull(now)} lĂºc ${timeStr}`;

        // Khá»Ÿi táº¡o workbook má»›i cá»§a ExcelJS
        const workbook = new ExcelJS.Workbook();
        
        // ------------------ SHEET 1: Tá»”NG Há»¢P ------------------
        const wsSummary = workbook.addWorksheet('Tá»•ng Há»£p', {
            views: [{ showGridLines: true }]
        });

        // 1. TiĂªu Ä‘á» chĂ­nh
        wsSummary.mergeCells('A1:G1');
        const title1 = wsSummary.getCell('A1');
        title1.value = `BĂO CĂO TÄ‚NG CA - THĂNG ${displayMonth}`;
        title1.font = { name: 'Times New Roman', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
        title1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B365D' } }; // Navy Blue Ä‘áº­m
        title1.alignment = { vertical: 'middle', horizontal: 'center' };
        wsSummary.getRow(1).height = 40;

        // 2. NgĂ y xuáº¥t bĂ¡o cĂ¡o
        wsSummary.mergeCells('A2:G2');
        const subtitle1 = wsSummary.getCell('A2');
        subtitle1.value = `NgĂ y xuáº¥t bĂ¡o cĂ¡o: ${exportTime}`;
        subtitle1.font = { name: 'Times New Roman', size: 10, italic: true, color: { argb: 'FF4B5563' } };
        subtitle1.alignment = { vertical: 'middle', horizontal: 'center' };
        wsSummary.getRow(2).height = 20;

        // 3. DĂ²ng trá»‘ng
        wsSummary.getRow(3).height = 15;

        // 4. TiĂªu Ä‘á» báº£ng
        wsSummary.getCell('A4').value = "I. Báº¢NG Tá»”NG Há»¢P GIá»œ TÄ‚NG CA & CHUYáº¾N ÄI XE";
        wsSummary.getCell('A4').font = { name: 'Times New Roman', size: 12, bold: true, color: { argb: 'FF1F2937' } };
        wsSummary.getRow(4).height = 22;

        // 5. Headers
        const headers1 = ["STT", "Há» vĂ  tĂªn", "Team", "MĂ£ nhĂ¢n viĂªn", "Sá»‘ ngĂ y OT", "Tá»•ng OT (giá»)", "Tá»•ng chuyáº¿n xe"];
        wsSummary.getRow(5).values = headers1;
        wsSummary.getRow(5).height = 28;
        wsSummary.getRow(5).font = { name: 'Times New Roman', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
        
        for (let col = 1; col <= 7; col++) {
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

        // 6. Dá»¯ liá»‡u nhĂ¢n viĂªn
        let summaryStartRow = 6;
        users.forEach((u, i) => {
            const ur = records.filter(r => r.userId === u.id);
            const days = ur.length;
            const lh = ur.filter(r => r.hasLunchOT).length * OT_LUNCH_HOURS;
            const eh = ur.reduce((s, r) => s + r.eveningOTHours, 0);
            const trips = ur.filter(r => r.calcMode === 'trip' || (!r.calcMode && r.deliveryProvince && r.deliveryProvince.trim() !== '')).length;

            const rowNum = summaryStartRow + i;
            const row = wsSummary.getRow(rowNum);
            row.values = [
                i + 1,
                u.fullname,
                u.team === 'admin' ? 'admin' : (u.team || 'ChÆ°a phĂ¢n team'),
                u.username,
                days,
                lh + eh,
                trips
            ];
            row.height = 22;
            row.font = { name: 'Times New Roman', size: 10 };

            for (let col = 1; col <= 7; col++) {
                const cell = row.getCell(col);
                cell.border = {
                    top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
                    left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
                    bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
                    right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
                };

                cell.alignment = { vertical: 'middle', horizontal: 'center' };

                if (col === 1 || col === 5 || col === 7) {
                    cell.numFmt = '0';
                } else if (col === 6) {
                    cell.numFmt = '#,##0.0';
                }
            }
        });

        // Thiáº¿t láº­p bá»™ lá»c tá»± Ä‘á»™ng cho Summary Sheet
        wsSummary.autoFilter = 'A5:G' + (summaryStartRow + users.length - 1);



        // Äá»™ rá»™ng cá»™t
        wsSummary.columns = [
            { width: 8 },   // STT
            { width: 28 },  // Há» vĂ  tĂªn
            { width: 18 },  // NhĂ³m
            { width: 16 },  // MĂ£ nhĂ¢n viĂªn
            { width: 14 },  // Sá»‘ ngĂ y OT
            { width: 18 },  // Tá»•ng OT
            { width: 18 }   // Tá»•ng chuyáº¿n xe
        ];

        // ------------------ SHEET 2: CHI TIáº¾T ------------------
        const wsDetail = workbook.addWorksheet('Chi Tiáº¿t', {
            views: [{ showGridLines: true }]
        });

        // 1. TiĂªu Ä‘á» chĂ­nh
        wsDetail.mergeCells('A1:I1');
        const title2 = wsDetail.getCell('A1');
        title2.value = `CHI TIáº¾T TÄ‚NG CA - THĂNG ${displayMonth}`;
        title2.font = { name: 'Times New Roman', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
        title2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B365D' } }; // Navy Blue Ä‘áº­m
        title2.alignment = { vertical: 'middle', horizontal: 'center' };
        wsDetail.getRow(1).height = 40;

        // 2. NgĂ y xuáº¥t bĂ¡o cĂ¡o
        wsDetail.mergeCells('A2:I2');
        const subtitle2 = wsDetail.getCell('A2');
        subtitle2.value = `NgĂ y xuáº¥t bĂ¡o cĂ¡o: ${exportTime}`;
        subtitle2.font = { name: 'Times New Roman', size: 10, italic: true, color: { argb: 'FF4B5563' } };
        subtitle2.alignment = { vertical: 'middle', horizontal: 'center' };
        wsDetail.getRow(2).height = 20;

        // 3. DĂ²ng trá»‘ng
        wsDetail.getRow(3).height = 15;

        // 4. TiĂªu Ä‘á» báº£ng
        wsDetail.getCell('A4').value = "II. Báº¢NG CHI TIáº¾T TÄ‚NG CA Tá»ªNG NGĂ€Y";
        wsDetail.getCell('A4').font = { name: 'Times New Roman', size: 12, bold: true, color: { argb: 'FF1F2937' } };
        wsDetail.getRow(4).height = 22;

        // 5. Headers
        const headers2 = ["STT", "NgĂ y", "Há» vĂ  tĂªn", "Team", "MĂ£ nhĂ¢n viĂªn", "Thá»i gian OT", "Tá»•ng OT (giá»)", "Hoáº¡t Ä‘á»™ng / Chuyáº¿n Ä‘i", "Ghi chĂº"];
        wsDetail.getRow(5).values = headers2;
        wsDetail.getRow(5).height = 28;
        wsDetail.getRow(5).font = { name: 'Times New Roman', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
        
        for (let col = 1; col <= 9; col++) {
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

        // 6. Äiá»n dá»¯ liá»‡u chi tiáº¿t
        let currentDetailRow = 6;
        let detailedIdx = 1;
        let isFirstUser = true;

        users.forEach(u => {
            const userRecords = records.filter(r => r.userId === u.id);
            if (userRecords.length === 0) return;
            userRecords.sort((a, b) => a.date.localeCompare(b.date));

            // ThĂªm dĂ²ng trá»‘ng ngÄƒn cĂ¡ch giá»¯a cĂ¡c nhĂ¢n viĂªn
            if (!isFirstUser) {
                wsDetail.addRow([]);
                wsDetail.getRow(currentDetailRow).height = 14;
                for (let col = 1; col <= 9; col++) {
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
                let timeRange = 'â€”';
                if (r.hasLunchOT && r.eveningOTHours > 0) {
                    timeRange = `12:20-13:20, ${r.otStart}-${r.otEnd}`;
                } else if (r.hasLunchOT) {
                    timeRange = '12:20-13:20';
                } else if (r.eveningOTHours > 0) {
                    timeRange = `${r.otStart}-${r.otEnd}`;
                }

                let activityVal = 'â€”';
                if (r.customActivity) {
                    if (r.calcMode === 'trip') {
                        activityVal = `${r.customActivity}${r.deliveryProvince ? ': ' + r.deliveryProvince : ''}`;
                    } else {
                        activityVal = r.customActivity;
                    }
                } else if (r.deliveryProvince && r.deliveryProvince.trim() !== '') {
                    activityVal = r.deliveryProvince;
                }

                const row = wsDetail.getRow(currentDetailRow);
                row.values = [
                    detailedIdx++,
                    formatDate(r.date),
                    u.fullname,
                    u.team === 'admin' ? 'admin' : (u.team || 'ChÆ°a phĂ¢n team'),
                    u.username,
                    timeRange,
                    r.totalHours,
                    activityVal,
                    r.note || 'â€”'
                ];
                row.height = 22;
                row.font = { name: 'Times New Roman', size: 10 };

                for (let col = 1; col <= 9; col++) {
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
                    } else if (col === 7) {
                        cell.numFmt = '#,##0.0';
                    }
                }
                currentDetailRow++;
            });
        });

        // 7. Tá»•ng cá»™ng chi tiáº¿t
        if (detailedIdx > 1) {
            // Ăp dá»¥ng bá»™ lá»c cho toĂ n bá»™ vĂ¹ng dá»¯ liá»‡u chi tiáº¿t (tá»« dĂ²ng 5 Ä‘áº¿n dĂ²ng cuá»‘i cĂ¹ng trÆ°á»›c dĂ²ng tá»•ng cá»™ng)
            wsDetail.autoFilter = 'A5:I' + (currentDetailRow - 1);
        } else {
            wsDetail.mergeCells(`A${currentDetailRow}:I${currentDetailRow}`);
            const emptyCell = wsDetail.getCell(`A${currentDetailRow}`);
            emptyCell.value = "ChÆ°a cĂ³ dá»¯ liá»‡u chi tiáº¿t tÄƒng ca cho thĂ¡ng nĂ y.";
            emptyCell.alignment = { vertical: 'middle', horizontal: 'center' };
            wsDetail.getRow(currentDetailRow).height = 30;
        }

        // Äá»™ rá»™ng cá»™t sheet Chi tiáº¿t
        wsDetail.columns = [
            { width: 8 },   // STT
            { width: 14 },  // NgĂ y
            { width: 28 },  // Há» vĂ  tĂªn
            { width: 18 },  // NhĂ³m
            { width: 16 },  // MĂ£ nhĂ¢n viĂªn
            { width: 24 },  // Thá»i gian OT
            { width: 16 },  // Tá»•ng OT (giá»)
            { width: 20 },  // Äi xe (Tá»‰nh)
            { width: 35 }   // Ghi chĂº
        ];

        // 8. LÆ°u file Excel
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `bao-cao-tang-ca-chi-tiet-${month}.xlsx`;
        a.click();
        window.URL.revokeObjectURL(url);

        showToast('ÄĂ£ xuáº¥t file Excel chi tiáº¿t cĂ³ Ä‘á»‹nh dáº¡ng!');
    } catch (e) {
        showToast('Lá»—i xuáº¥t Excel: ' + e.message, 'error');
        console.error(e);
    }
}

async function handleCloseMonth() {
    const month = document.getElementById('report-filter-month').value;
    if (!month) {
        showToast('Vui lĂ²ng chá»n thĂ¡ng cáº§n chá»‘t cĂ´ng!', 'error');
        return;
    }

    // BÆ°á»›c 1: YĂªu cáº§u táº£i bĂ¡o cĂ¡o Excel trÆ°á»›c
    showModal(
        'XĂ¡c nháº­n Chá»‘t cĂ´ng & KhĂ³a thĂ¡ng',
        `<p style="font-size: 14px; line-height: 1.6; color: var(--text-primary);">
            Há»‡ thá»‘ng yĂªu cáº§u báº¡n Ä‘Ă£ xuáº¥t bĂ¡o cĂ¡o Excel lÆ°u trá»¯ vá» mĂ¡y tĂ­nh trÆ°á»›c khi thá»±c hiá»‡n.<br><br>
            <strong>Báº¡n Ä‘Ă£ táº£i bĂ¡o cĂ¡o Excel thĂ¡ng ${month} vá» chÆ°a?</strong>
         </p>`,
        [
            {
                text: 'ChÆ°a táº£i (Táº£i ngay)',
                class: 'btn-ghost',
                action: async () => {
                    await exportExcel();
                }
            },
            {
                text: 'ÄĂ£ táº£i (KhĂ³a thĂ¡ng)',
                class: 'btn-primary',
                action: () => {
                    setTimeout(() => {
                        // BÆ°á»›c 2: Cáº£nh bĂ¡o vĂ  xĂ¡c nháº­n khĂ³a thĂ¡ng
                        showModal(
                            'XĂC NHáº¬N KHĂ“A THĂNG',
                            `<p style="font-size: 14px; line-height: 1.6; color: var(--text-primary);">
                                Thao tĂ¡c nĂ y sáº½ **khĂ³a ghi nháº­n tÄƒng ca** cá»§a thĂ¡ng ${month}.<br><br>
                                Sau khi khĂ³a, nhĂ¢n viĂªn Ä‘Äƒng kĂ½ OT trong thĂ¡ng nĂ y sáº½ pháº£i Ä‘Æ°á»£c **Quáº£n lĂ½ phĂª duyá»‡t** má»›i Ä‘Æ°á»£c tĂ­nh.<br><br>
                                Báº¡n cĂ³ cháº¯c cháº¯n muá»‘n khĂ³a thĂ¡ng ${month}?
                             </p>`,
                            [
                                {
                                    text: 'Há»§y bá»',
                                    class: 'btn-ghost',
                                    action: null
                                },
                                {
                                    text: 'XĂ¡c nháº­n khĂ³a thĂ¡ng',
                                    class: 'btn-warning',
                                    action: async () => {
                                        try {
                                            showToast('Äang thá»±c hiá»‡n khĂ³a thĂ¡ng...');
                                            const res = await api('/api/records/close-month', 'POST', { month });
                                            showToast('KhĂ³a thĂ¡ng thĂ nh cĂ´ng!');
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

async function handleDatabaseCleanup() {
    const monthInput = document.getElementById('cleanup-month-input');
    if (!monthInput) return;
    const month = monthInput.value;
    if (!month) {
        showToast('Vui lĂ²ng chá»n thĂ¡ng cáº§n dá»n dáº¹p!', 'error');
        return;
    }

    // BÆ°á»›c 1: YĂªu cáº§u táº£i bĂ¡o cĂ¡o Excel trÆ°á»›c
    showModal(
        'XĂ¡c nháº­n Chá»‘t cĂ´ng & Dá»n dáº¹p',
        `<p style="font-size: 14px; line-height: 1.6; color: var(--text-primary);">
            Há»‡ thá»‘ng yĂªu cáº§u báº¡n Ä‘Ă£ xuáº¥t bĂ¡o cĂ¡o Excel lÆ°u trá»¯ vá» mĂ¡y tĂ­nh trÆ°á»›c khi thá»±c hiá»‡n.<br><br>
            <strong>Báº¡n Ä‘Ă£ táº£i bĂ¡o cĂ¡o Excel thĂ¡ng ${month} vá» chÆ°a?</strong>
         </p>`,
        [
            {
                text: 'ChÆ°a táº£i (Táº£i ngay)',
                class: 'btn-ghost',
                action: async () => {
                    const originalFilterVal = document.getElementById('report-filter-month').value;
                    document.getElementById('report-filter-month').value = month;
                    await exportExcel();
                    document.getElementById('report-filter-month').value = originalFilterVal;
                }
            },
            {
                text: 'ÄĂ£ táº£i (Tiáº¿p tá»¥c dá»n dáº¹p)',
                class: 'btn-primary',
                action: () => {
                    setTimeout(() => {
                        // BÆ°á»›c 2: Cáº£nh bĂ¡o xĂ³a dá»¯ liá»‡u vÄ©nh viá»…n trĂªn Server
                        showModal(
                            'Cáº¢NH BĂO QUAN TRá»ŒNG',
                            `<p style="font-size: 14px; line-height: 1.6; color: var(--accent-red); font-weight: 600;">
                                Cáº¢NH BĂO: Táº¥t cáº£ dá»¯ liá»‡u tÄƒng ca cá»§a thĂ¡ng ${month} vĂ  cĂ¡c thĂ¡ng cÅ© hÆ¡n sáº½ bá»‹ xĂ³a sáº¡ch khá»i Server.<br><br>
                                Há»‡ thá»‘ng sáº½ tá»± Ä‘á»™ng táº¡o file sao lÆ°u trĂªn Server vĂ  GitHub Gist, tuy nhiĂªn dá»¯ liá»‡u hiá»ƒn thá»‹ hiá»‡n táº¡i sáº½ bá»‹ xĂ³a vÄ©nh viá»…n.<br><br>
                                Thao tĂ¡c nĂ y KHĂ”NG THá»‚ HOĂ€N TĂC! Báº¡n váº«n muá»‘n tiáº¿p tá»¥c?
                             </p>`,
                            [
                                {
                                    text: 'Há»§y bá»',
                                    class: 'btn-ghost',
                                    action: null
                                },
                                {
                                    text: 'XĂ¡c nháº­n xĂ³a dá»¯ liá»‡u',
                                    class: 'btn-danger',
                                    action: async () => {
                                        try {
                                            showToast('Äang thá»±c hiá»‡n dá»n dáº¹p...');
                                            const res = await api('/api/records/cleanup', 'POST', { month });
                                            showToast('Dá»n dáº¹p dá»¯ liá»‡u thĂ nh cĂ´ng!');
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
    if (welcomeEl) welcomeEl.textContent = `Xin chĂ o, ${user.fullname}`;
    
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
            items.push({ label: 'BĂ¹ tÄƒng ca', value: `${hoursVal.toFixed(1)} giá»` });
            total = hoursVal;
        }
    } else if (isSunday) {
        const hoursVal = parseFloat(document.getElementById('ot-backfill-hours').value) || 0;
        if (hoursVal > 0) {
            items.push({ label: 'TÄƒng ca Chá»§ Nháº­t', value: `${hoursVal.toFixed(1)} giá»` });
            total = hoursVal;
        }
    } else {
        const hasLunch = document.getElementById('ot-lunch').checked;
        const otStart = document.getElementById('ot-start').value;
        const otEnd = document.getElementById('ot-end').value;

        if (hasLunch) {
            items.push({ label: 'OT TrÆ°a (12:20 - 13:20)', value: `${OT_LUNCH_HOURS} giá»` });
            total += OT_LUNCH_HOURS;
        }

        if (otStart && otEnd) {
            const eveningHours = calculateEveningOT(otStart, otEnd);
            if (eveningHours > 0) {
                items.push({ label: `OT Chiá»u (${otStart} - ${otEnd})`, value: `${eveningHours.toFixed(1)} giá»` });
                total += eveningHours;
            }
        }
    }

    if (customActivity && calcMode === 'hour') {
        items.push({ label: 'Hoáº¡t Ä‘á»™ng', value: customActivity });
    }

    if (hasTrip && province) {
        items.push({ label: customActivity, value: province });
    }

    previewItems.innerHTML = items.length === 0
        ? '<div class="preview-item"><span>ChÆ°a cĂ³ OT nĂ o Ä‘Æ°á»£c chá»n</span></div>'
        : items.map(i => `<div class="preview-item"><span>${i.label}</span><span class="preview-item-value">${i.value}</span></div>`).join('');
    previewTotal.textContent = total.toFixed(1);

    // Cáº­p nháº­t tĂ­nh báº¯t buá»™c cá»§a ghi chĂº
    const noteEl = document.getElementById('ot-note');
    if (noteEl) {
        if (hasTrip && total === 0) {
            noteEl.required = false;
            noteEl.placeholder = "Máº·c Ä‘á»‹nh: " + customActivity + " " + province;
        } else {
            noteEl.required = true;
            noteEl.placeholder = "LĂ½ do tÄƒng ca, phĂ¢n cĂ´ng cĂ´ng viá»‡c...";
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
        ticketTarget.innerHTML = `<span class="badge badge-admin" style="font-size: 10px;">CĂ¡ nhĂ¢n</span> <strong>${currentUser.fullname || 'Quáº£n lĂ½'}</strong>`;
    } else if (targetEmp && targetEmp.checked && userSelect) {
        const selectedText = userSelect.options[userSelect.selectedIndex]?.text || '';
        ticketTarget.innerHTML = `<span class="badge badge-employee" style="font-size: 10px;">NhĂ¢n viĂªn</span> <strong>${selectedText.replace(/^[^-]+-\s*/, '') || 'ChÆ°a chá»n'}</strong>`;
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
        ticketDate.textContent = 'ChÆ°a chá»n ngĂ y';
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
                ticketActValue.textContent = customDetail || 'ChÆ°a nháº­p chi tiáº¿t';
            } else {
                ticketActValue.innerHTML = `<span class="preview-active-badge">âœ“ ÄÄƒng kĂ½</span>`;
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
        ticketEvening.textContent = `BĂ¹ tÄƒng ca: ${hours.toFixed(1)} giá»`;
        total = hours;
    } else if (isSunday) {
        const hours = parseFloat(backfillHours?.value) || 0;
        ticketLunch.textContent = '-';
        ticketEvening.textContent = `TÄƒng ca Chá»§ Nháº­t: ${hours.toFixed(1)} giá»`;
        total = hours;
    } else {
        // Lunch
        if (otLunch && otLunch.checked) {
            ticketLunch.innerHTML = `<span class="preview-active-badge">âœ“ ÄÄƒng kĂ½</span> (${OT_LUNCH_HOURS} giá»)`;
            total += OT_LUNCH_HOURS;
        } else {
            ticketLunch.textContent = 'KhĂ´ng Ä‘Äƒng kĂ½';
        }

        // Evening
        if (otStart && otEnd && otStart.value && otEnd.value) {
            const eveningHours = calculateEveningOT(otStart.value, otEnd.value);
            if (eveningHours > 0) {
                ticketEvening.innerHTML = `<span class="preview-active-badge">âœ“ ${otStart.value} - ${otEnd.value}</span> (${eveningHours.toFixed(1)} giá»)`;
                total += eveningHours;
            } else {
                ticketEvening.textContent = 'KhĂ´ng Ä‘Äƒng kĂ½';
            }
        } else {
            ticketEvening.textContent = 'KhĂ´ng Ä‘Äƒng kĂ½';
        }
    }

    // Total
    ticketTotal.textContent = `${total.toFixed(1)} giá»`;

    // Cáº­p nháº­t tĂ­nh báº¯t buá»™c cá»§a ghi chĂº cho Admin
    if (otNote) {
        if (hasTrip && total === 0) {
            otNote.required = false;
            otNote.placeholder = "Máº·c Ä‘á»‹nh: " + customActivity + " " + province;
        } else {
            otNote.required = true;
            otNote.placeholder = "LĂ½ do tÄƒng ca, phĂ¢n cĂ´ng cĂ´ng viá»‡c...";
        }
    }

    // Note
    if (otNote && otNote.value.trim()) {
        ticketNote.textContent = otNote.value.trim();
    } else if (hasTrip && total === 0) {
        ticketNote.textContent = "Máº·c Ä‘á»‹nh: " + customActivity + " " + province;
    } else {
        ticketNote.textContent = 'ChÆ°a cĂ³ ghi chĂº...';
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

    if (!date) { errorEl.textContent = 'Vui lĂ²ng chá»n ngĂ y!'; return; }

    const todayStr = new Date(Date.now() + 7 * 3600000).toISOString().split('T')[0];
    const currentMonth = todayStr.substring(0, 7);
    const selectedMonth = date.substring(0, 7);
    if (selectedMonth < currentMonth && !isBackfill) {
        errorEl.textContent = 'Äá»ƒ chá»n ngĂ y thuá»™c thĂ¡ng cÅ©, vui lĂ²ng tĂ­ch chá»n "BĂ¹ tÄƒng ca"!';
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
        let detailLabel = 'chi tiáº¿t';
        const userTeam = user.team || '';
        const teamObj = TEAMS.find(t => typeof t === 'object' && t.name === userTeam);
        const actObj = teamObj?.customActivities?.find(a => a.name === customActivity);
        if (actObj && actObj.detailLabel) detailLabel = actObj.detailLabel;
        errorEl.textContent = `Vui lĂ²ng nháº­p ${detailLabel.toLowerCase()}!`;
        return;
    }

    let eveningHours = 0;
    let totalHours = 0;

    const isSunday = new Date(date + 'T00:00:00').getDay() === 0;

    if (isBackfill || isSunday) {
        const hoursVal = parseFloat(document.getElementById('ot-backfill-hours').value) || 0;
        if (hoursVal <= 0) { errorEl.textContent = isSunday ? 'Vui lĂ²ng nháº­p sá»‘ giá» tÄƒng ca Chá»§ Nháº­t há»£p lá»‡!' : 'Vui lĂ²ng nháº­p sá»‘ giá» bĂ¹ há»£p lá»‡!'; return; }
        totalHours = hoursVal;
        eveningHours = hoursVal;
        if (isBackfill) {
            note = '[BĂ™ THĂNG TRÆ¯á»C] ' + note;
        }
    } else {
        eveningHours = calculateEveningOT(otStart, otEnd);
        const lunchHours = hasLunch ? OT_LUNCH_HOURS : 0;
        totalHours = lunchHours + eveningHours;
        if (totalHours <= 0 && !hasTrip) { errorEl.textContent = 'Vui lĂ²ng chá»n Ă­t nháº¥t má»™t loáº¡i OT hoáº·c hoáº¡t Ä‘á»™ng ngoĂ i giá»!'; return; }
    }

    if (hasTrip && totalHours === 0 && !note) {
        note = customActivity + ' ' + province;
    } else if (!note) {
        errorEl.textContent = 'Vui lĂ²ng nháº­p ghi chĂº!';
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

        const action = data.updated ? 'ÄĂ£ cáº­p nháº­t' : 'ÄĂ£ lÆ°u';
        successEl.textContent = `${action} ${totalHours.toFixed(1)} giá» tÄƒng ca!`;
        showToast(`${action} ${totalHours.toFixed(1)} giá» tÄƒng ca`);

        if (otBackfill) otBackfill.checked = false;
        const normalInputs = document.getElementById('ot-normal-inputs');
        const backfillGroup = document.getElementById('ot-backfill-hours-group');
        if (normalInputs) normalInputs.style.display = 'block';
        if (backfillGroup) backfillGroup.style.display = 'none';
        
        // Restore label and backfill toggle switch display
        const labelEl = backfillGroup ? backfillGroup.querySelector('label') : null;
        if (labelEl) labelEl.textContent = 'Sá»‘ giá» tÄƒng ca cáº§n bĂ¹:';
        const backfillRow = otBackfill ? otBackfill.closest('.checkbox-label') || otBackfill.closest('.switch-label') : null;
        if (backfillRow) backfillRow.style.display = '';
        
        const backfillHoursEl = document.getElementById('ot-backfill-hours');
        if (backfillHoursEl) backfillHoursEl.value = '';

        document.getElementById('ot-lunch').checked = false;
        document.getElementById('ot-start').value = '16:30';
        document.getElementById('ot-end').value = '16:30';
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

    if (!userId) { errorEl.textContent = 'Vui lĂ²ng chá»n nhĂ¢n viĂªn!'; return; }
    if (!date) { errorEl.textContent = 'Vui lĂ²ng chá»n ngĂ y!'; return; }

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
        let detailLabel = 'chi tiáº¿t';
        if (userId) {
            const foundUser = loadedUsers.find(u => u.id === userId);
            const userTeam = foundUser ? (foundUser.team || '') : '';
            const teamObj = TEAMS.find(t => typeof t === 'object' && t.name === userTeam);
            const actObj = teamObj?.customActivities?.find(a => a.name === customActivity);
            if (actObj && actObj.detailLabel) detailLabel = actObj.detailLabel;
        }
        errorEl.textContent = `Vui lĂ²ng nháº­p ${detailLabel.toLowerCase()}!`;
        return;
    }

    let eveningHours = 0;
    let totalHours = 0;

    const isSunday = new Date(date + 'T00:00:00').getDay() === 0;

    if (isBackfill || isSunday) {
        const hoursVal = parseFloat(document.getElementById('admin-ot-backfill-hours').value) || 0;
        if (hoursVal <= 0) { errorEl.textContent = isSunday ? 'Vui lĂ²ng nháº­p sá»‘ giá» tÄƒng ca Chá»§ Nháº­t há»£p lá»‡!' : 'Vui lĂ²ng nháº­p sá»‘ giá» bĂ¹ há»£p lá»‡!'; return; }
        totalHours = hoursVal;
        eveningHours = hoursVal;
        if (isBackfill) {
            note = '[BĂ™ THĂNG TRÆ¯á»C] ' + note;
        }
    } else {
        eveningHours = calculateEveningOT(otStart, otEnd);
        const lunchHours = hasLunch ? OT_LUNCH_HOURS : 0;
        totalHours = lunchHours + eveningHours;
        if (totalHours <= 0 && !hasTrip) { errorEl.textContent = 'Vui lĂ²ng chá»n Ă­t nháº¥t má»™t loáº¡i OT hoáº·c hoáº¡t Ä‘á»™ng ngoĂ i giá»!'; return; }
    }

    if (hasTrip && totalHours === 0 && !note) {
        note = customActivity + ' ' + province;
    } else if (!note) {
        errorEl.textContent = 'Vui lĂ²ng nháº­p ghi chĂº!';
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

        const action = data.updated ? 'ÄĂ£ cáº­p nháº­t' : 'ÄĂ£ lÆ°u';
        successEl.textContent = `${action} ${totalHours.toFixed(1)} giá» tÄƒng ca thĂ nh cĂ´ng!`;
        showToast(`${action} ${totalHours.toFixed(1)} giá» tÄƒng ca`);

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
        if (labelEl) labelEl.textContent = 'Sá»‘ giá» tÄƒng ca cáº§n bĂ¹';
        const backfillRow = adminOtBackfill ? adminOtBackfill.closest('.switch-label') || adminOtBackfill.closest('.checkbox-label') : null;
        if (backfillRow) backfillRow.style.display = '';
        
        const backfillHoursEl = document.getElementById('admin-ot-backfill-hours');
        if (backfillHoursEl) backfillHoursEl.value = '';

        document.getElementById('admin-ot-lunch').checked = false;
        document.getElementById('admin-ot-start').value = '16:30';
        document.getElementById('admin-ot-end').value = '16:30';
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
    let empBtnText = '2. Hoáº¡t Ä‘á»™ng khĂ¡c';
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
        const records = data.records;
        const tbody = document.getElementById('emp-records-body');

        // Stats calculation (based on all records of this month)
        let totalLunchOT = 0, totalEveningOT = 0, totalHours = 0;
        records.forEach(r => {
            const isBackfill = r.isBackfill || (r.note && (r.note.includes('[BĂ™ THĂNG TRÆ¯á»C]') || r.note.includes('[TÄ‚NG THĂNG NĂ€Y]')));
            const isApproved = r.status !== 'pending' && r.status !== 'rejected';
            
            if (isApproved) {
                if (!r.customActivity || r.calcMode === 'hour') {
                    const lh = r.hasLunchOT ? OT_LUNCH_HOURS : 0;
                    totalLunchOT += lh;
                    totalEveningOT += isBackfill ? 0 : (r.eveningOTHours || 0);
                    totalHours += r.totalHours;
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
                    <th>NgĂ y</th>
                    <th>OT TrÆ°a</th>
                    <th>OT Chiá»u</th>
                    <th>Giá» BÄ</th>
                    <th>Giá» KT</th>
                    <th>Tá»•ng (giá»)</th>
                    <th>Tráº¡ng thĂ¡i</th>
                    <th>Ghi chĂº</th>
                    <th>Thao tĂ¡c</th>
                </tr>`;
            } else {
                tbody.previousElementSibling.innerHTML = `<tr>
                    <th>NgĂ y</th>
                    <th>Hoáº¡t Ä‘á»™ng</th>
                    <th>HĂ¬nh thá»©c / Chi tiáº¿t</th>
                    <th>Tráº¡ng thĂ¡i</th>
                    <th>Ghi chĂº</th>
                    <th>Thao tĂ¡c</th>
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
                    <span class="stat-label">Hoáº¡t Ä‘á»™ng khĂ¡c</span>
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
                    <span class="stat-label">Sá»‘ ngĂ y OT</span>
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
                    <span class="stat-label">OT TrÆ°a</span>
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
                    <span class="stat-label">OT Chiá»u</span>
                </div>
            </div>
            <div class="stat-card stat-card-green">
                <div class="stat-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                    </svg>
                </div>
                <div class="stat-info">
                    <span class="stat-value">${totalHours.toFixed(1)}h</span>
                    <span class="stat-label">Tá»•ng OT</span>
                </div>
            </div>
            ${customCardHTML}
        `;

        if (recordsFiltered.length === 0) {
            const cols = (currentEmpRecType === 'ot') ? 9 : 6;
            tbody.innerHTML = `<tr class="empty-row"><td colspan="${cols}">ChÆ°a cĂ³ dá»¯ liá»‡u ${currentEmpRecType === 'ot' ? 'tÄƒng ca' : 'hoáº¡t Ä‘á»™ng tĂ¹y chá»n'}</td></tr>`;
            const statsCardsEl = document.getElementById('emp-stats-cards');
            if (statsCardsEl) {
                statsCardsEl.innerHTML = statsHtml;
            }
            return;
        }

        tbody.innerHTML = recordsFiltered.map(r => {
            let badgeClass = 'status-approved';
            let badgeText = 'ÄĂ£ duyá»‡t';
            if (r.status === 'pending') {
                badgeClass = 'status-pending';
                badgeText = 'Chá» duyá»‡t';
            } else if (r.status === 'rejected') {
                badgeClass = 'status-rejected';
                badgeText = 'Tá»« chá»‘i';
            }

            if (currentEmpRecType === 'ot') {
                return `<tr>
                    <td>${formatDate(r.date)}</td>
                    <td>${r.hasLunchOT ? '<span class="tag tag-yes">âœ“ CĂ³</span>' : '<span class="tag tag-no">KhĂ´ng</span>'}</td>
                    <td>${r.eveningOTHours > 0 ? `<span class="text-green text-bold">${r.eveningOTHours.toFixed(1)}h</span>` : '<span style="color:var(--text-muted)">â€”</span>'}</td>
                    <td>${r.otStart || 'â€”'}</td>
                    <td>${r.otEnd || 'â€”'}</td>
                    <td><span class="text-purple text-bold">${r.totalHours.toFixed(1)}</span></td>
                    <td><span class="status-badge ${badgeClass}">${badgeText}</span></td>
                    <td>${r.note || '<span style="color:var(--text-muted)">â€”</span>'}</td>
                    <td><div class="action-buttons">
                        <button class="btn-icon-only edit" onclick="editRecordDialog('${r.id}', 'employee')" title="Sá»­a" style="margin-right: 4px;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                        </button>
                        <button class="btn-icon-only delete" onclick="deleteRecord('${r.id}', 'employee')" title="XĂ³a">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                                <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2-2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                            </svg>
                        </button>
                    </div></td>
                </tr>`;
            } else {
                const detail = r.calcMode === 'trip' 
                    ? `<span class="tag" style="background: rgba(245,158,11,0.15); color: #f59e0b; border: 1px solid rgba(245,158,11,0.3); font-weight: 500;">đŸ ${r.deliveryProvince || 'ChÆ°a rĂµ'}</span>` 
                    : `<span class="tag" style="background: rgba(99,102,241,0.15); color: #6366f1; border: 1px solid rgba(99,102,241,0.3); font-weight: 500;">â±ï¸ ${r.totalHours.toFixed(1)}h</span>`;
                return `<tr>
                    <td>${formatDate(r.date)}</td>
                    <td><strong>${r.customActivity}</strong></td>
                    <td>${detail}</td>
                    <td><span class="status-badge ${badgeClass}">${badgeText}</span></td>
                    <td>${r.note || '<span style="color:var(--text-muted)">â€”</span>'}</td>
                    <td><div class="action-buttons">
                        <button class="btn-icon-only edit" onclick="editRecordDialog('${r.id}', 'employee')" title="Sá»­a" style="margin-right: 4px;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                        </button>
                        <button class="btn-icon-only delete" onclick="deleteRecord('${r.id}', 'employee')" title="XĂ³a">
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

// ==================== CLOUD WAKING & SYNC CONFIG ====================
async function initCloudConfig() {
    try {
        if (isGitHubPages) {
            // Khi cháº¡y trĂªn web (otmanager.id.vn / GitHub Pages), luĂ´n dĂ¹ng API Cloud
            API_BASE = 'https://api.otmanager.id.vn';
        } else if (window.OT_CLOUD_URL) {
            // Chá»‰ Electron má»›i dĂ¹ng URL tá»« server-config.js (localhost)
            API_BASE = window.OT_CLOUD_URL;
        } else {
            API_BASE = 'https://api.otmanager.id.vn';
        }
        if (API_BASE.endsWith('/')) {
            API_BASE = API_BASE.slice(0, -1);
        }
        console.log("[Desktop App] API Base trá» tá»›i Cloud:", API_BASE);

        if (isElectron) {
            // Thá»­ káº¿t ná»‘i nhanh xem server cĂ³ Ä‘ang hoáº¡t Ä‘á»™ng khĂ´ng
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
        console.error("Lá»—i cáº¥u hĂ¬nh káº¿t ná»‘i Cloud:", e);
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
            <h3 style="margin-top: 0; color: #10b981; font-size: 1.3rem; margin-bottom: 10px;">Äang káº¿t ná»‘i Ä‘áº¿n há»‡ thá»‘ng...</h3>
            <p style="font-size: 0.9rem; color: #a1a1aa; line-height: 1.5; margin-bottom: 8px;">Há»‡ thá»‘ng Ä‘ang chuáº©n bá»‹ tĂ i nguyĂªn vĂ  thiáº¿t láº­p Ä‘Æ°á»ng truyá»n báº£o máº­t.</p>
            <p style="font-size: 0.8rem; color: #71717a; font-style: italic;">Vui lĂ²ng Ä‘á»£i trong giĂ¢y lĂ¡t...</p>
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
    const maxAttempts = 30; // Thá»­ tá»‘i Ä‘a 30 láº§n (~60 giĂ¢y)
    
    while (attempts < maxAttempts) {
        try {
            console.log(`[Cloud] Thá»­ káº¿t ná»‘i Ä‘áº¿n Cloud Server (Láº§n ${attempts + 1})...`);
            const res = await fetch(`${API_BASE}/api/server-info`, { method: 'GET', mode: 'cors' });
            if (res.ok) {
                console.log("[Cloud] Káº¿t ná»‘i thĂ nh cĂ´ng! Server Ä‘Ă£ hoáº¡t Ä‘á»™ng.");
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
                <div style="font-size: 3rem; margin-bottom: 20px;">â ï¸</div>
                <h3 style="margin-top: 0; color: #ef4444; font-size: 1.3rem; margin-bottom: 10px;">Lá»—i Káº¿t Ná»‘i</h3>
                <p style="font-size: 0.9rem; color: #a1a1aa; line-height: 1.5; margin-bottom: 20px;">KhĂ´ng thá»ƒ káº¿t ná»‘i Ä‘áº¿n Cloud Server. Vui lĂ²ng kiá»ƒm tra láº¡i káº¿t ná»‘i máº¡ng hoáº·c tráº¡ng thĂ¡i dá»‹ch vá»¥ cá»§a Render.</p>
                <div style="display:flex; gap: 10px; justify-content: center;">
                    <button onclick="window.location.reload()" style="background: #10b981; color: white; border: none; padding: 10px 20px; border-radius: 8px; font-weight: 600; cursor: pointer; margin-right: 10px;">Thá»­ láº¡i</button>
                    <button onclick="document.getElementById('cloud-wakeup-overlay').remove()" style="background: #27272a; color: white; border: none; padding: 10px 20px; border-radius: 8px; font-weight: 600; cursor: pointer;">DĂ¹ng Offline</button>
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
    showToast('Äang kiá»ƒm tra báº£n cáº­p nháº­t...', 'info');
    try {
        const cloudUrl = window.OT_CLOUD_URL || API_BASE;

        if (!cloudUrl) {
            showModal(
                'Kiá»ƒm tra cáº­p nháº­t',
                `<p style="color: var(--text-secondary); line-height: 1.6;">
                    á»¨ng dá»¥ng Ä‘ang hoáº¡t Ä‘á»™ng á»Ÿ cháº¿ Ä‘á»™ Offline (khĂ´ng káº¿t ná»‘i Cloud Server).<br><br>
                    Äá»ƒ sá»­ dá»¥ng tĂ­nh nÄƒng kiá»ƒm tra cáº­p nháº­t, vui lĂ²ng cáº¥u hĂ¬nh <strong>serverUrl</strong> (Ä‘Æ°á»ng dáº«n Cloud Server Render) trong file <code>config.json</code> á»Ÿ thÆ° má»¥c gá»‘c cá»§a á»©ng dá»¥ng.
                </p>`,
                [{ text: 'ÄĂ³ng', class: 'btn-ghost' }]
            );
            return;
        }

        // 2. Láº¥y version hiá»‡n táº¡i cá»§a á»©ng dá»¥ng local
        const localVer = window.OT_LOCAL_VERSION || localStorage.getItem('ot_app_version') || '1.4.4';
        const localBuildTime = window.OT_LOCAL_BUILD_TIME || parseInt(localStorage.getItem('ot_app_build_time')) || 0;

        // 3. Láº¥y version má»›i nháº¥t trĂªn Cloud Server
        const cloudRes = await fetch(`${cloudUrl}/api/version`);
        const cloudData = await cloudRes.json();
        const cloudVer = cloudData.version || '1.0.0';
        const cloudBuildTime = cloudData.buildTime || 0;

        const cmp = compareVersions(localVer, cloudVer);
        const hasHotfix = cmp === 0 && localBuildTime > 0 && cloudBuildTime > (localBuildTime + 60000); // CĂ³ báº£n vĂ¡ lá»—i má»›i hÆ¡n Ă­t nháº¥t 1 phĂºt

        if (cmp < 0 || hasHotfix) {
            const checkRes = await fetch(`${cloudUrl}/download/desktop?check=true`);
            const checkData = await checkRes.json();

            if (checkData.ready) {
                const title = hasHotfix ? 'CĂ³ báº£n vĂ¡ lá»—i má»›i!' : 'CĂ³ phiĂªn báº£n má»›i!';
                const bodyText = hasHotfix ?
                    `<p style="color: var(--text-secondary); line-height: 1.6; margin-bottom: 12px;">
                        PhĂ¡t hiá»‡n báº£n vĂ¡ lá»—i (hotfix) má»›i cho phiĂªn báº£n hiá»‡n táº¡i:<br>
                        â€¢ PhiĂªn báº£n: <strong style="color: var(--accent-green-light);">v${localVer}</strong><br>
                        â€¢ Báº£n vĂ¡ má»›i hÆ¡n báº£n Ä‘ang cĂ i trĂªn mĂ¡y.
                    </p>
                    <p style="color: var(--text-muted); font-size: 13px;">
                        Báº¡n cĂ³ muá»‘n táº£i vá» vĂ  cáº­p nháº­t báº£n vĂ¡ lá»—i nĂ y ngay khĂ´ng?
                    </p>` :
                    `<p style="color: var(--text-secondary); line-height: 1.6; margin-bottom: 12px;">
                        PhĂ¡t hiá»‡n phiĂªn báº£n má»›i cá»§a á»©ng dá»¥ng trĂªn há»‡ thá»‘ng Cloud:<br>
                        â€¢ PhiĂªn báº£n hiá»‡n táº¡i: <strong style="color: var(--accent-orange);">v${localVer}</strong><br>
                        â€¢ PhiĂªn báº£n má»›i nháº¥t: <strong style="color: var(--accent-green-light);">v${cloudVer}</strong>
                    </p>
                    <p style="color: var(--text-muted); font-size: 13px;">
                        Báº¡n cĂ³ muá»‘n táº£i xuá»‘ng phiĂªn báº£n má»›i nháº¥t ngay trong á»©ng dá»¥ng khĂ´ng?
                    </p>`;

                showModal(
                    title,
                    bodyText,
                    [
                        { text: 'Äá»ƒ sau', class: 'btn-ghost' },
                        { 
                            text: hasHotfix ? 'VĂ¡ lá»—i ngay' : 'Táº£i vá» ngay', 
                            class: 'btn btn-primary btn-sm', 
                            action: async () => {
                                if (hasHotfix) {
                                    showToast('Äang táº£i vĂ  Ă¡p dá»¥ng báº£n vĂ¡ nhanh...', 'info');
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
                                            showToast('ÄĂ£ Ă¡p dá»¥ng báº£n vĂ¡ thĂ nh cĂ´ng! Äang tá»± khá»Ÿi Ä‘á»™ng láº¡i...', 'success');
                                            setTimeout(() => {
                                                window.location.reload();
                                            }, 1500);
                                        } else {
                                            throw new Error(result.message || 'Lá»—i khĂ´ng xĂ¡c Ä‘á»‹nh');
                                        }
                                    } catch (err) {
                                        showToast(`Lá»—i khi vĂ¡: ${err.message}. Vui lĂ²ng thá»­ láº¡i sau hoáº·c táº£i báº£n cĂ i Ä‘áº·t má»›i.`, 'error');
                                    }
                                } else {
                                    const downloadUrl = cloudData.desktopDownloadUrl || `${cloudUrl}/download/desktop`;
                                    try {
                                        showToast('Äang chuáº©n bá»‹ táº£i báº£n cáº­p nháº­t...', 'info');
                                        if (window.electronAPI && window.electronAPI.triggerUpdate) {
                                            window.electronAPI.triggerUpdate(downloadUrl, cloudVer);
                                            showToast('Báº¯t Ä‘áº§u táº£i xuá»‘ng báº£n cáº­p nháº­t!', 'success');
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
                                            showToast('Báº¯t Ä‘áº§u táº£i xuá»‘ng báº£n cáº­p nháº­t!', 'success');
                                        }
                                    } catch (e) {
                                        console.error('Lá»—i khi kĂ­ch hoáº¡t cáº­p nháº­t:', e);
                                        showToast('KhĂ´ng thá»ƒ tá»± Ä‘á»™ng táº£i xuá»‘ng. Äang má»Ÿ trĂ¬nh duyá»‡t Ä‘á»ƒ táº£i...', 'warning');
                                        window.open(downloadUrl, '_blank');
                                    }
                                }
                            } 
                        }
                    ]
                );
            } else {
                showModal(
                    'Báº£n cáº­p nháº­t chÆ°a sáºµn sĂ ng',
                    `<p style="color: var(--text-secondary); line-height: 1.6; margin-bottom: 12px;">
                        PhiĂªn báº£n <strong style="color: var(--accent-green-light);">v${cloudVer}</strong> Ä‘Ă£ Ä‘Æ°á»£c phĂ¡t hĂ nh nhÆ°ng file cĂ i Ä‘áº·t (.exe) chÆ°a sáºµn sĂ ng Ä‘á»ƒ táº£i.<br><br>
                        â€¢ PhiĂªn báº£n hiá»‡n táº¡i: <strong>v${localVer}</strong>
                    </p>
                    <p style="color: var(--text-muted); font-size: 13px;">
                        File bá»™ cĂ i Ä‘áº·t (.exe) cĂ³ thá»ƒ chÆ°a Ä‘Æ°á»£c upload lĂªn GitHub Releases. Vui lĂ²ng thá»­ láº¡i sau hoáº·c má»Ÿ GitHub Releases Ä‘á»ƒ kiá»ƒm tra.
                    </p>`,
                    [
                        { text: 'ÄĂ³ng', class: 'btn-ghost' },
                        { 
                            text: 'Má»Ÿ GitHub Releases', 
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
                'Kiá»ƒm tra cáº­p nháº­t',
                `<p style="color: var(--accent-green-light); font-weight: 600; font-size: 15px; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
                    âœ“ Báº¡n Ä‘ang dĂ¹ng phiĂªn báº£n má»›i nháº¥t
                </p>
                <p style="color: var(--text-secondary); line-height: 1.6;">
                    â€¢ PhiĂªn báº£n hiá»‡n táº¡i: <strong>v${localVer}</strong><br>
                    á»¨ng dá»¥ng cá»§a báº¡n hoĂ n toĂ n tÆ°Æ¡ng thĂ­ch vĂ  Ä‘Ă£ Ä‘Æ°á»£c cáº­p nháº­t Ä‘áº§y Ä‘á»§.
                </p>`,
                [{ text: 'ÄĂ³ng', class: 'btn-ghost' }]
            );
        }
    } catch (err) {
        showToast('KhĂ´ng thá»ƒ káº¿t ná»‘i Ä‘áº¿n Cloud Server. MĂ¡y chá»§ Ä‘Ă¡m mĂ¢y cĂ³ thá»ƒ Ä‘ang khá»Ÿi Ä‘á»™ng (máº¥t khoáº£ng 1 phĂºt) hoáº·c táº¡m ngÆ°ng hoáº¡t Ä‘á»™ng. Vui lĂ²ng thá»­ láº¡i sau!', 'error');
        console.error('Lá»—i check cáº­p nháº­t:', err);
    }
}

async function checkUpdateSilent() {
    if (!isElectron) return;
    try {
        const cloudUrl = window.OT_CLOUD_URL || API_BASE;
        if (!cloudUrl) return;

        const localVer = window.OT_LOCAL_VERSION || localStorage.getItem('ot_app_version') || '1.4.4';
        const localBuildTime = window.OT_LOCAL_BUILD_TIME || parseInt(localStorage.getItem('ot_app_build_time')) || 0;

        const cloudRes = await fetch(`${cloudUrl}/api/version`);
        const cloudData = await cloudRes.json();
        const cloudVer = cloudData.version || '1.0.0';
        const cloudBuildTime = cloudData.buildTime || 0;

        const cmp = compareVersions(localVer, cloudVer);
        const hasHotfix = cmp === 0 && localBuildTime > 0 && cloudBuildTime > (localBuildTime + 60000); // CĂ³ báº£n vĂ¡ lá»—i má»›i hÆ¡n Ă­t nháº¥t 1 phĂºt

        if (cmp < 0 || hasHotfix) {
            const checkRes = await fetch(`${cloudUrl}/download/desktop?check=true`);
            const checkData = await checkRes.json();

            if (checkData.ready) {
                const title = hasHotfix ? 'CĂ³ báº£n vĂ¡ lá»—i má»›i!' : 'CĂ³ phiĂªn báº£n má»›i!';
                const bodyText = hasHotfix ?
                    `<p style="color: var(--text-secondary); line-height: 1.6; margin-bottom: 12px;">
                        PhĂ¡t hiá»‡n báº£n vĂ¡ lá»—i (hotfix) má»›i cho phiĂªn báº£n hiá»‡n táº¡i:<br>
                        â€¢ PhiĂªn báº£n: <strong style="color: var(--accent-green-light);">v${localVer}</strong><br>
                        â€¢ Báº£n vĂ¡ má»›i hÆ¡n báº£n Ä‘ang cĂ i trĂªn mĂ¡y.
                    </p>
                    <p style="color: var(--text-muted); font-size: 13px;">
                        Báº¡n cĂ³ muá»‘n táº£i vá» vĂ  cáº­p nháº­t báº£n vĂ¡ lá»—i nĂ y ngay khĂ´ng?
                    </p>` :
                    `<p style="color: var(--text-secondary); line-height: 1.6; margin-bottom: 12px;">
                        PhĂ¡t hiá»‡n phiĂªn báº£n má»›i cá»§a á»©ng dá»¥ng trĂªn há»‡ thá»‘ng Cloud:<br>
                        â€¢ PhiĂªn báº£n hiá»‡n táº¡i: <strong style="color: var(--accent-orange);">v${localVer}</strong><br>
                        â€¢ PhiĂªn báº£n má»›i nháº¥t: <strong style="color: var(--accent-green-light);">v${cloudVer}</strong>
                    </p>
                    <p style="color: var(--text-muted); font-size: 13px;">
                        Báº¡n cĂ³ muá»‘n táº£i xuá»‘ng phiĂªn báº£n má»›i nháº¥t ngay trong á»©ng dá»¥ng khĂ´ng?
                    </p>`;

                showModal(
                    title,
                    bodyText,
                    [
                        { text: 'Äá»ƒ sau', class: 'btn-ghost' },
                        { 
                            text: hasHotfix ? 'VĂ¡ lá»—i ngay' : 'Táº£i vá» ngay', 
                            class: 'btn btn-primary btn-sm', 
                            action: async () => {
                                if (hasHotfix) {
                                    showToast('Äang táº£i vĂ  Ă¡p dá»¥ng báº£n vĂ¡ nhanh...', 'info');
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
                                            showToast('ÄĂ£ Ă¡p dá»¥ng báº£n vĂ¡ thĂ nh cĂ´ng! Äang tá»± khá»Ÿi Ä‘á»™ng láº¡i...', 'success');
                                            setTimeout(() => {
                                                window.location.reload();
                                            }, 1500);
                                        } else {
                                            throw new Error(result.message || 'Lá»—i khĂ´ng xĂ¡c Ä‘á»‹nh');
                                        }
                                    } catch (err) {
                                        showToast(`Lá»—i khi vĂ¡: ${err.message}. Vui lĂ²ng thá»­ láº¡i sau hoáº·c táº£i báº£n cĂ i Ä‘áº·t má»›i.`, 'error');
                                    }
                                } else {
                                    const downloadUrl = cloudData.desktopDownloadUrl || `${cloudUrl}/download/desktop`;
                                    try {
                                        showToast('Äang chuáº©n bá»‹ táº£i báº£n cáº­p nháº­t...', 'info');
                                        if (window.electronAPI && window.electronAPI.triggerUpdate) {
                                            window.electronAPI.triggerUpdate(downloadUrl, cloudVer);
                                            showToast('Báº¯t Ä‘áº§u táº£i xuá»‘ng báº£n cáº­p nháº­t!', 'success');
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
                                            showToast('Báº¯t Ä‘áº§u táº£i xuá»‘ng báº£n cáº­p nháº­t!', 'success');
                                        }
                                    } catch (e) {
                                        console.error('Lá»—i khi kĂ­ch hoáº¡t cáº­p nháº­t:', e);
                                        showToast('KhĂ´ng thá»ƒ tá»± Ä‘á»™ng táº£i xuá»‘ng. Äang má»Ÿ trĂ¬nh duyá»‡t Ä‘á»ƒ táº£i...', 'warning');
                                        window.open(downloadUrl, '_blank');
                                    }
                                }
                            } 
                        }
                    ]
                );
            } else {
                showModal(
                    'Báº£n cáº­p nháº­t chÆ°a sáºµn sĂ ng',
                    `<p style="color: var(--text-secondary); line-height: 1.6; margin-bottom: 12px;">
                        PhiĂªn báº£n <strong style="color: var(--accent-green-light);">v${cloudVer}</strong> Ä‘Ă£ Ä‘Æ°á»£c phĂ¡t hĂ nh nhÆ°ng file cĂ i Ä‘áº·t (.exe) chÆ°a sáºµn sĂ ng Ä‘á»ƒ táº£i.<br><br>
                        â€¢ PhiĂªn báº£n hiá»‡n táº¡i: <strong>v${localVer}</strong>
                    </p>
                    <p style="color: var(--text-muted); font-size: 13px;">
                        File bá»™ cĂ i Ä‘áº·t (.exe) cĂ³ thá»ƒ chÆ°a Ä‘Æ°á»£c upload lĂªn GitHub Releases. Vui lĂ²ng thá»­ láº¡i sau hoáº·c má»Ÿ GitHub Releases Ä‘á»ƒ kiá»ƒm tra.
                    </p>`,
                    [
                        { text: 'ÄĂ³ng', class: 'btn-ghost' },
                        { 
                            text: 'Má»Ÿ GitHub Releases', 
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
        console.error('Lá»—i check cáº­p nháº­t ngáº§m:', err);
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
            if (labelEl) labelEl.textContent = 'Sá»‘ giá» tÄƒng ca Chá»§ Nháº­t:';
            
            if (activities.length > 0) {
                if (customActGroup) customActGroup.style.display = 'block';
            }
            
            const backfillRow = backfillCheckbox ? backfillCheckbox.closest('.checkbox-label') || backfillCheckbox.closest('.switch-label') : null;
            if (backfillRow) backfillRow.style.display = 'none';
        } else {
            const backfillRow = backfillCheckbox ? backfillCheckbox.closest('.checkbox-label') || backfillCheckbox.closest('.switch-label') : null;
            if (backfillRow) backfillRow.style.display = '';
            if (labelEl) labelEl.textContent = 'Sá»‘ giá» tÄƒng ca cáº§n bĂ¹:';
            
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
            if (labelEl) labelEl.textContent = 'Sá»‘ giá» tÄƒng ca Chá»§ Nháº­t';
            
            if (activities.length > 0) {
                if (customActGroup) customActGroup.style.display = 'block';
            }
            
            const backfillRow = backfillCheckbox ? backfillCheckbox.closest('.switch-label') || backfillCheckbox.closest('.checkbox-label') : null;
            if (backfillRow) backfillRow.style.display = 'none';
        } else {
            const backfillRow = backfillCheckbox ? backfillCheckbox.closest('.switch-label') || backfillCheckbox.closest('.checkbox-label') : null;
            if (backfillRow) backfillRow.style.display = '';
            if (labelEl) labelEl.textContent = 'Sá»‘ giá» tÄƒng ca cáº§n bĂ¹';
            
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
        // Tá»± Ä‘á»™ng kiá»ƒm tra cáº­p nháº­t ngáº§m khi khá»Ÿi Ä‘á»™ng
        checkUpdateSilent();
        // Äá»‹nh ká»³ má»—i 30 phĂºt kiá»ƒm tra cáº­p nháº­t má»™t láº§n
        setInterval(checkUpdateSilent, 30 * 60 * 1000);
    }

    // Kiá»ƒm tra qua 00h (Ä‘Äƒng nháº­p ngĂ y má»›i)
    checkMidnightLogout();

    // ThĂªm láº¯ng nghe sá»± kiá»‡n focus cá»­a sá»• Ä‘á»ƒ kiá»ƒm tra qua 00h
    window.addEventListener('focus', checkMidnightLogout);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            checkMidnightLogout();
        }
    });

    // HĂ m khá»Ÿi cháº¡y báº¥t Ä‘á»“ng bá»™ Ä‘á»ƒ cáº¥u hĂ¬nh Cloud, check version vĂ  táº£i dá»¯ liá»‡u dashboard
    async function runAsyncInit() {
        // 1. Cáº¥u hĂ¬nh vĂ  Ä‘á»“ng bá»™ hĂ³a Cloud Server trÆ°á»›c khi táº£i trang dashboard
        await initCloudConfig();

        // 2. Kiá»ƒm tra phiĂªn báº£n vĂ  tráº¡ng thĂ¡i session Ä‘á»ƒ quyáº¿t Ä‘á»‹nh tá»± Ä‘á»™ng Ä‘Äƒng nháº­p
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
                    verEl.textContent = 'PhiĂªn báº£n v' + currentVersion;
                }
            }

            const storedVersion = localStorage.getItem('ot_app_version');
            const isSessionActive = sessionStorage.getItem('ot_session_active');

            // Náº¿u lĂ  phiĂªn lĂ m viá»‡c má»›i (app bá»‹ táº¯t hoĂ n toĂ n vĂ  báº­t láº¡i)
            if (isElectron && !isSessionActive) {
                // Náº¿u khĂ´ng pháº£i lĂ  cáº­p nháº­t (phiĂªn báº£n cÅ© vĂ  má»›i giá»‘ng nhau)
                if (storedVersion === currentVersion) {
                    // Táº¯t app hoĂ n toĂ n vĂ  báº­t láº¡i báº£n cÅ© -> báº¯t Ä‘Äƒng nháº­p láº¡i, dá»n sáº¡ch session cÅ©
                    localStorage.removeItem('ot_current_user');
                    localStorage.removeItem('ot_login_date');
                    localStorage.removeItem('ot_mobile_user');
                    localStorage.removeItem('ot_login_time');
                    localStorage.removeItem('ot_auth_token');
                } else {
                    // ÄĂ¢y lĂ  cáº­p nháº­t phiĂªn báº£n -> giá»¯ nguyĂªn login, chá»‰ cáº­p nháº­t version lÆ°u trá»¯
                    localStorage.setItem('ot_app_version', currentVersion);
                }
                // ÄĂ¡nh dáº¥u session hiá»‡n táº¡i lĂ  active
                sessionStorage.setItem('ot_session_active', 'true');
            } else if (!isElectron) {
                // TrĂªn web, chá»‰ cáº§n cáº­p nháº­t version lÆ°u trá»¯, khĂ´ng log out
                localStorage.setItem('ot_app_version', currentVersion);
            }
        } catch (e) {
            console.error('Lá»—i kiá»ƒm tra phiĂªn báº£n:', e);
            const verEl = document.getElementById('login-version');
            if (verEl) {
                const valEl = verEl.querySelector('.login-ver-val');
                if (valEl) {
                    valEl.textContent = 'v1.4.4';
                } else {
                    verEl.textContent = 'PhiĂªn báº£n v1.4.4';
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

        // Táº£i dá»¯ liá»‡u dashboard náº¿u cĂ³ user Ä‘Ă£ Ä‘Äƒng nháº­p (Äá»c láº¡i sau khi Ä‘Ă£ dá»n dáº¹p session má»›i náº¿u cĂ³)
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
                console.error('[Dashboard] Lá»—i khá»Ÿi táº¡o dá»¯ liá»‡u:', err);
                if (isElectron) {
                    showScreen('screen-login');
                } else {
                    const needsOtPrefix = window.location.hostname.includes('github.io');
                    const mainPageUrl = needsOtPrefix ? '/OT/index.html' : '/index.html';
                    window.location.href = mainPageUrl;
                }
            }
        } else {
            // Náº¿u khĂ´ng cĂ³ session trĂªn báº£n Web, chuyá»ƒn hÆ°á»›ng tháº³ng vá» Landing Page
            if (!isElectron) {
                const needsOtPrefix = window.location.hostname.includes('github.io');
                const mainPageUrl = needsOtPrefix ? '/OT/index.html' : '/index.html';
                window.location.href = mainPageUrl;
            }
        }

        // Káº¿t ná»‘i SSE Ä‘á»ƒ nháº­n sá»± kiá»‡n thá»i gian thá»±c
        initSseConnection();
    }

    // Cháº¡y cĂ¡c tĂ¡c vá»¥ Cloud & Data ngáº§m khĂ´ng lĂ m block giao diá»‡n Ä‘Äƒng nháº­p
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

    // Login tabs (NhĂ¢n viĂªn / Quáº£n lĂ½)
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
            
            // Cáº­p nháº­t tiĂªu Ä‘á» header Ä‘á»™ng
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
            
            // Cáº­p nháº­t tiĂªu Ä‘á» header Ä‘á»™ng
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
                    if (startEl) startEl.value = '16:30';
                    const endEl = document.getElementById('admin-ot-end');
                    if (endEl) endEl.value = '16:30';
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
                if (startEl) startEl.value = '16:30';
                const endEl = document.getElementById('ot-end');
                if (endEl) endEl.value = '16:30';
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
        if (!record) return showToast('KhĂ´ng tĂ¬m tháº¥y báº£n ghi', 'error');

        const isBackfill = record.isBackfill || (record.note && (record.note.includes('[BĂ™ THĂNG TRÆ¯á»C]') || record.note.includes('[TÄ‚NG THĂNG NĂ€Y]')));
        const cleanedNote = record.note ? record.note.replace('[BĂ™ THĂNG TRÆ¯á»C] ', '').replace('[BĂ™ THĂNG TRÆ¯á»C]', '').replace('[TÄ‚NG THĂNG NĂ€Y] ', '').replace('[TÄ‚NG THĂNG NĂ€Y]', '').trim() : '';

        const body = `
        <form id="modal-form-record" class="login-form active" style="text-align: left; padding: 0;">
            <div class="form-group" style="margin-bottom: 15px;">
                <label style="display:block;margin-bottom:6px;font-weight:600;">NgĂ y tÄƒng ca</label>
                <div class="input-wrapper">
                    <input type="date" id="modal-rec-date" value="${record.date}" max="${new Date().toISOString().split('T')[0]}" style="padding-left:12px; height:38px; border-radius:8px;" required>
                </div>
            </div>
            <div class="form-group" style="margin-bottom: 15px;">
                <label class="switch-label" for="modal-rec-backfill">
                    <input type="checkbox" id="modal-rec-backfill" ${isBackfill ? 'checked' : ''}>
                    <span class="switch-slider"></span>
                    <span class="switch-text">BĂ¹ tÄƒng ca</span>
                </label>
            </div>

            <!-- Backfill hours input -->
            <div class="form-group" id="modal-rec-backfill-hours-group" style="display: ${isBackfill ? 'block' : 'none'}; margin-bottom: 15px;">
                <label style="display:block;margin-bottom:6px;font-weight:600;">Sá»‘ giá» tÄƒng ca cáº§n bĂ¹</label>
                <input type="number" id="modal-rec-backfill-hours" step="0.1" min="0.1" max="24" value="${isBackfill ? record.totalHours : ''}" placeholder="Nháº­p sá»‘ giá» bĂ¹ (vĂ­ dá»¥: 8.0)" class="input-sm" style="width:100%; box-sizing:border-box; height:38px; border-radius:8px;">
            </div>

            <!-- Normal OT inputs -->
            <div id="modal-rec-normal-inputs" style="display: ${isBackfill ? 'none' : 'block'};">
                <div class="form-group" style="margin-bottom: 15px;">
                    <label class="switch-label" for="modal-rec-lunch">
                        <input type="checkbox" id="modal-rec-lunch" ${record.hasLunchOT ? 'checked' : ''}>
                        <span class="switch-slider"></span>
                        <span class="switch-text">TÄƒng ca trÆ°a (12:20 - 13:20)</span>
                    </label>
                </div>
                <div class="form-group" style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 15px;">
                    <div>
                        <label style="display:block;margin-bottom:6px;font-weight:600;">Báº¯t Ä‘áº§u OT chiá»u</label>
                        <input type="time" id="modal-rec-start" value="${record.otStart || '16:30'}" class="input-sm" style="width:100%; box-sizing:border-box; height:38px; border-radius:8px;">
                    </div>
                    <div>
                        <label style="display:block;margin-bottom:6px;font-weight:600;">Káº¿t thĂºc OT chiá»u</label>
                        <input type="time" id="modal-rec-end" value="${record.otEnd || '16:30'}" class="input-sm" style="width:100%; box-sizing:border-box; height:38px; border-radius:8px;">
                    </div>
                </div>
            </div>

            <!-- NhĂ³m Hoáº¡t Ä‘á»™ng ngoĂ i giá» tĂ¹y chá»‰nh (Sá»­a) -->
            <div id="modal-rec-custom-activity-group" style="display: none; margin-bottom: 15px;">
                <div id="modal-rec-custom-activities-list"></div>
            </div>

            <div class="form-group" style="margin-bottom: 0;">
                <label style="display:block;margin-bottom:6px;font-weight:600;">Ghi chĂº</label>
                <textarea id="modal-rec-note" class="input-sm" style="width:100%; height:60px; resize:none; box-sizing:border-box; padding:10px;" required>${cleanedNote}</textarea>
            </div>
        </form>`;

        showModal('Chá»‰nh sá»­a tÄƒng ca', body, [
            { text: 'Há»§y', class: 'btn-ghost' },
            { text: 'LÆ°u', class: 'btn btn-primary btn-sm', action: async () => {
                const date = document.getElementById('modal-rec-date').value;
                const recBackfill = document.getElementById('modal-rec-backfill');
                const isRecBackfill = recBackfill ? recBackfill.checked : false;
                const hasLunch = isRecBackfill ? false : (document.getElementById('modal-rec-lunch') ? document.getElementById('modal-rec-lunch').checked : false);
                const otStart = document.getElementById('modal-rec-start') ? document.getElementById('modal-rec-start').value : '';
                const otEnd = document.getElementById('modal-rec-end') ? document.getElementById('modal-rec-end').value : '';
                let note = document.getElementById('modal-rec-note').value.trim();

                if (!date) return showToast('Vui lĂ²ng chá»n ngĂ y!', 'error');

                // Get selected custom activity info
                const checkedAct = document.querySelector('.modal-rec-custom-activity-checkbox:checked');
                const customActivity = checkedAct ? checkedAct.dataset.actName : '';
                const customActivityMode = checkedAct ? checkedAct.dataset.actMode : '';
                
                const detailGroup = checkedAct ? document.getElementById(`modal-rec-custom-activity-detail-group-${checkedAct.dataset.actId}`) : null;
                const detailInput = detailGroup ? detailGroup.querySelector('.modal-rec-custom-activity-detail') : null;
                const detailValue = detailInput ? detailInput.value.trim() : '';

                if (checkedAct && !detailValue) {
                    return showToast('Vui lĂ²ng nháº­p chi tiáº¿t cho hoáº¡t Ä‘á»™ng ngoĂ i giá»!', 'error');
                }

                let eveningHours = 0;
                let totalHours = 0;

                if (isRecBackfill) {
                    const hoursVal = parseFloat(document.getElementById('modal-rec-backfill-hours').value) || 0;
                    if (hoursVal <= 0) return showToast('Vui lĂ²ng nháº­p sá»‘ giá» bĂ¹ há»£p lá»‡!', 'error');
                    totalHours = hoursVal;
                    eveningHours = hoursVal;
                    note = '[BĂ™ THĂNG TRÆ¯á»C] ' + note;
                } else {
                    eveningHours = calculateEveningOT(otStart, otEnd);
                    const lunchHours = hasLunch ? OT_LUNCH_HOURS : 0;
                    totalHours = lunchHours + eveningHours;
                    if (totalHours <= 0 && !checkedAct) return showToast('Vui lĂ²ng chá»n Ă­t nháº¥t má»™t loáº¡i OT hoáº·c hoáº¡t Ä‘á»™ng ngoĂ i giá»!', 'error');
                }

                const deliveryProvince = checkedAct && customActivityMode === 'trip' ? detailValue : '';

                if (checkedAct && totalHours === 0 && !note) {
                    note = `${customActivity} ${detailValue}`;
                } else if (!note) {
                    return showToast('Vui lĂ²ng nháº­p ghi chĂº!', 'error');
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
                    showToast('ÄĂ£ cáº­p nháº­t báº£n ghi tÄƒng ca!');
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
                                <small style="font-size: 11px; color: var(--text-secondary);">TĂ­nh cháº¥t: ${act.calcMode === 'trip' ? 'TĂ­nh theo Chuyáº¿n' : 'TĂ­nh theo Giá»'}</small>
                            </span>
                        </label>
                        <div class="form-group" id="modal-rec-custom-activity-detail-group-${act.id}" style="display: ${isSelected ? 'block' : 'none'}; margin-top: 8px; padding: 0 4px; margin-bottom: 0;">
                            <label style="display:block; margin-bottom:6px; font-size:13px; font-weight:600; color:var(--text-secondary);">${act.detailLabel || 'Chi tiáº¿t'}</label>
                            <input type="text" class="modal-rec-custom-activity-detail" data-act-id="${act.id}" placeholder="${act.placeholder || 'Nháº­p chi tiáº¿t...'}" value="${detailValue}" style="width: 100%; height: 38px; background: rgba(0,0,0,0.2); color: #fff; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; padding: 0 10px; font-size: 14px;">
                        </div>
                    </div>
                `}).join('');
            }
            
            // Adjust note requirement based on whether any activity is selected initially
            const noteEl = document.getElementById('modal-rec-note');
            if (activeActName && noteEl) {
                noteEl.required = false;
                noteEl.placeholder = `Máº·c Ä‘á»‹nh: ${activeActName}...`;
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
                    if (startEl) startEl.value = '16:30';
                    const endEl = document.getElementById('modal-rec-end');
                    if (endEl) endEl.value = '16:30';
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
    } catch (e) {
        showToast('Lá»—i táº£i dá»¯ liá»‡u báº£n ghi', 'error');
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
            console.error('Lá»—i láº¥y danh sĂ¡ch admin:', e);
        }
    }
    const currentUser = JSON.parse(localStorage.getItem('ot_current_user') || 'null');
    const isAdmin = currentUser && (currentUser.username === 'admin' || currentUser.isSuperAdmin);

    const body = `
    <form id="modal-form-add-user" class="login-form active" style="text-align: left; padding: 0;">
        <div class="form-group" style="margin-bottom: 15px;">
            <label style="display:block;margin-bottom:6px;font-weight:600;">Há» vĂ  tĂªn</label>
            <input type="text" id="modal-user-fullname" placeholder="Nguyá»…n VÄƒn A" class="input-sm" style="width:100%; box-sizing:border-box;" required>
        </div>
        <div class="form-group" style="margin-bottom: 15px;">
            <label style="display:block;margin-bottom:6px;font-weight:600;">TĂªn Ä‘Äƒng nháº­p</label>
            <input type="text" id="modal-user-username" placeholder="Chá»‰ viáº¿t liá»n, khĂ´ng dáº¥u" class="input-sm" style="width:100%; box-sizing:border-box;" required>
        </div>
        <div class="form-group" style="margin-bottom: 15px;">
            <label style="display:block;margin-bottom:6px;font-weight:600;">Äá»‹a chá»‰ Email</label>
            <input type="email" id="modal-user-email" placeholder="ten-cua-ban@company.com" class="input-sm" style="width:100%; box-sizing:border-box;">
        </div>
        <div class="form-group" id="modal-user-password-group" style="margin-bottom: 15px;">
            <label style="display:block;margin-bottom:6px;font-weight:600;">Máº­t kháº©u</label>
            <input type="password" id="modal-user-password" placeholder="Máº­t kháº©u (bá» trá»‘ng Ä‘á»‘i vá»›i nhĂ¢n viĂªn)" class="input-sm" style="width:100%; box-sizing:border-box;">
        </div>
        <div class="form-group" style="margin-bottom: 15px;">
            <label style="display:block;margin-bottom:6px;font-weight:600;">Vai trĂ²</label>
            <select id="modal-user-role" class="input-sm" style="width:100%; box-sizing:border-box;">
                <option value="employee">NhĂ¢n viĂªn (Äiá»‡n thoáº¡i)</option>
                <option value="admin">Quáº£n lĂ½ (Desktop)</option>
            </select>
        </div>
        <div class="form-group" id="modal-user-manager-group" style="margin-bottom: 0;">
            <label style="display:block;margin-bottom:6px;font-weight:600;">Team</label>
            <select id="modal-user-team" class="input-sm" style="width:100%; box-sizing:border-box;">
                <option value="">-- ChÆ°a phĂ¢n team --</option>
                ${isAdmin ? '<option value="admin">admin</option>' : ''}
                ${TEAMS.map(t => {
                    const name = typeof t === 'string' ? t : (t.name || '');
                    return `<option value="${name}">${name}</option>`;
                }).join('')}
            </select>
        </div>
    </form>`;

    showModal('ThĂªm nhĂ¢n viĂªn má»›i', body, [
        { text: 'Há»§y', class: 'btn-ghost' },
        { text: 'ThĂªm', class: 'btn btn-primary btn-sm', action: async () => {
            const fullname = document.getElementById('modal-user-fullname').value.trim();
            const username = document.getElementById('modal-user-username').value.trim();
            const email = document.getElementById('modal-user-email') ? document.getElementById('modal-user-email').value.trim() : '';
            const password = document.getElementById('modal-user-password').value;
            const role = document.getElementById('modal-user-role').value;
            const team = document.getElementById('modal-user-team') ? document.getElementById('modal-user-team').value : '';

            if (!fullname || !username) return showToast('Vui lĂ²ng Ä‘iá»n há» tĂªn vĂ  tĂªn Ä‘Äƒng nháº­p!', 'error');
            if (username.length < 3) return showToast('TĂªn Ä‘Äƒng nháº­p tá»‘i thiá»ƒu 3 kĂ½ tá»±!', 'error');
            if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showToast('Äá»‹a chá»‰ Email khĂ´ng há»£p lá»‡!', 'error');
            
            if (role === 'admin') {
                if (!password) return showToast('TĂ i khoáº£n quáº£n lĂ½ báº¯t buá»™c pháº£i nháº­p máº­t kháº©u!', 'error');
                if (password.length < 4) return showToast('Máº­t kháº©u tá»‘i thiá»ƒu 4 kĂ½ tá»±!', 'error');
            }

            try {
                await api('/api/auth/register', 'POST', { fullname, username, password: password || '123', role, team, email });
                showToast('ThĂªm nhĂ¢n viĂªn thĂ nh cĂ´ng!');
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
        if (!user) return showToast('KhĂ´ng tĂ¬m tháº¥y nhĂ¢n viĂªn', 'error');

        // Chá»‰ cĂ³ báº£n thĂ¢n Quáº£n trá»‹ viĂªn tá»‘i cao má»›i Ä‘Æ°á»£c sá»­a thĂ´ng tin cá»§a chĂ­nh mĂ¬nh
        if (user.isSuperAdmin && currentUser.id !== user.id) {
            return showToast('Báº¡n khĂ´ng cĂ³ quyá»n chá»‰nh sá»­a tĂ i khoáº£n Quáº£n trá»‹ viĂªn tá»‘i cao!', 'error');
        }

        // PhĂ¢n quyá»n: cĂ¡c quáº£n lĂ½ khĂ´ng Ä‘Æ°á»£c sá»­a thĂ´ng tin cá»§a nhau, chá»‰ cĂ³ superadmin má»›i Ä‘Æ°á»£c sá»­a thĂ´ng tin quáº£n lĂ½
        if (user.role === 'admin' && currentUser.id !== user.id && !isSuperAdmin) {
            return showToast('Chá»‰ cĂ³ Quáº£n trá»‹ viĂªn tá»‘i cao má»›i Ä‘Æ°á»£c chá»‰nh sá»­a tĂ i khoáº£n cá»§a quáº£n lĂ½ khĂ¡c!', 'error');
        }

        const body = `
        <form id="modal-form-edit-user" style="text-align: left; padding: 5px; display: flex; flex-direction: column; gap: 18px; font-family: 'Inter', sans-serif; color: #e4e4e7;">
            <!-- Grid for Basic Fields -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                <div class="form-group" style="display: flex; flex-direction: column; gap: 6px;">
                    <label style="font-size: 0.85rem; font-weight: 600; color: #a1a1aa;">Há» vĂ  tĂªn</label>
                    <input type="text" id="modal-user-fullname" value="${user.fullname}" class="input-sm" style="width:100%; box-sizing:border-box; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 10px; color: #fff; transition: all 0.3s;" required>
                </div>
                <div class="form-group" style="display: flex; flex-direction: column; gap: 6px;">
                    <label style="font-size: 0.85rem; font-weight: 600; color: #a1a1aa;">TĂªn Ä‘Äƒng nháº­p</label>
                    <input type="text" id="modal-user-username" value="${user.username}" class="input-sm" style="width:100%; box-sizing:border-box; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 10px; color: #fff; transition: all 0.3s;" required>
                </div>
            </div>

            <!-- Email Field (Crucial, styled nicely) -->
            <div class="form-group" style="display: flex; flex-direction: column; gap: 6px;">
                <label style="font-size: 0.85rem; font-weight: 600; color: #a1a1aa;">Äá»‹a chá»‰ Email</label>
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
                    <label style="font-size: 0.85rem; font-weight: 600; color: #a1a1aa;">Vai trĂ²</label>
                    <select id="modal-user-role" class="input-sm" style="width:100%; box-sizing:border-box; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 10px; color: #fff; height: 42px;">
                        <option value="employee" ${user.role === 'employee' ? 'selected' : ''}>NhĂ¢n viĂªn (Äiá»‡n thoáº¡i)</option>
                        <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Quáº£n lĂ½ (Desktop)</option>
                    </select>
                </div>
                <div class="form-group" id="modal-edit-user-manager-group" style="display: flex; flex-direction: column; gap: 6px;">
                    <label style="font-size: 0.85rem; font-weight: 600; color: #a1a1aa;">Team</label>
                    <select id="modal-user-team" class="input-sm" style="width:100%; box-sizing:border-box; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 10px; color: #fff; height: 42px;">
                        <option value="">-- ChÆ°a phĂ¢n team --</option>
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
                    Äá»•i máº­t kháº©u tĂ i khoáº£n
                </button>
            </div>
            <div class="form-group" id="modal-user-password-group" style="display: none; flex-direction: column; gap: 6px; animation: fadeIn 0.3s ease;">
                <label style="font-size: 0.85rem; font-weight: 600; color: #ef4444;">Máº­t kháº©u má»›i</label>
                <input type="password" id="modal-user-password" placeholder="Nháº­p máº­t kháº©u má»›i" class="input-sm" style="width:100%; box-sizing:border-box; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 10px; color: #fff;">
            </div>

            <!-- OTP Verification Section -->
            <div id="modal-otp-verification-section" style="display: none; background: rgba(16, 185, 129, 0.05); border: 1px solid rgba(16, 185, 129, 0.2); border-radius: 12px; padding: 15px; margin-top: 5px; animation: fadeIn 0.3s ease;">
                <label style="display: flex; align-items: center; gap: 6px; font-size: 0.9rem; font-weight: 700; color: #10b981; margin-bottom: 10px;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="16" height="16"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                    XĂ¡c thá»±c thay Ä‘á»•i qua OTP
                </label>
                <div style="display: flex; gap: 10px; margin-bottom: 8px;">
                    <input type="text" id="modal-verification-otp" placeholder="Nháº­p mĂ£ OTP" class="input-sm" style="flex: 1; text-align: center; font-size: 1.1rem; letter-spacing: 4px; font-weight: bold; background: rgba(0,0,0,0.2); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 8px; padding: 8px; color: #fff;" maxlength="6" oninput="this.value = this.value.replace(/[^0-9]/g, '')">
                    <button type="button" id="btn-send-verification-otp" style="background: #10b981; color: #020604; border: none; border-radius: 8px; padding: 0 16px; font-weight: bold; cursor: pointer; transition: all 0.2s; white-space: nowrap;" onmouseover="this.style.background='#059669';" onmouseout="this.style.background='#10b981';">Gá»­i OTP</button>
                </div>
                <p style="font-size: 0.8rem; color: #a1a1aa; margin: 0;" id="verification-otp-status"></p>
            </div>
        </form>`;

        showModal('Sá»­a thĂ´ng tin nhĂ¢n viĂªn', body, [
            { text: 'Há»§y', class: 'btn-ghost' },
            { text: 'LÆ°u', class: 'btn btn-primary btn-sm', action: async () => {
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

                if (!fullname || !username) return showToast('Vui lĂ²ng Ä‘iá»n há» tĂªn vĂ  tĂªn Ä‘Äƒng nháº­p!', 'error');
                if (username.length < 3) return showToast('TĂªn Ä‘Äƒng nháº­p tá»‘i thiá»ƒu 3 kĂ½ tá»±!', 'error');
                if (isOtpVisible && !otpVal) return showToast('Vui lĂ²ng nháº­p mĂ£ OTP xĂ¡c thá»±c thay Ä‘á»•i!', 'error');

                const payload = { fullname, username, role, team, email };
                if (password) {
                    if (password.length < 4) return showToast('Máº­t kháº©u tá»‘i thiá»ƒu 4 kĂ½ tá»±!', 'error');
                    payload.password = password;
                }
                if (isOtpVisible) {
                    payload.otpCode = otpVal;
                }

                try {
                    await api(`/api/users/${userId}`, 'PUT', payload);
                    showToast('Cáº­p nháº­t nhĂ¢n viĂªn thĂ nh cĂ´ng!');
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
                    return showToast('Vui lĂ²ng Ä‘iá»n Email há»£p lá»‡ Ä‘á»ƒ nháº­n mĂ£ OTP!', 'error');
                }
                btnSendOtp.disabled = true;
                otpStatus.textContent = 'Äang gá»­i mĂ£ OTP...';
                otpStatus.style.color = '#a1a1aa';
                try {
                    await api('/api/auth/send-email-otp', 'POST', { username: user.username, email: targetEmail });
                    showToast('ÄĂ£ gá»­i mĂ£ OTP xĂ¡c nháº­n Ä‘áº¿n email!');
                    otpStatus.textContent = `MĂ£ OTP Ä‘Ă£ Ä‘Æ°á»£c gá»­i tá»›i ${targetEmail}. Hiá»‡u lá»±c trong 5 phĂºt.`;
                    otpStatus.style.color = '#10b981';
                    
                    countdown = 60;
                    btnSendOtp.disabled = true;
                    timer = setInterval(() => {
                        countdown--;
                        if (countdown <= 0) {
                            clearInterval(timer);
                            btnSendOtp.disabled = false;
                            btnSendOtp.textContent = 'Gá»­i OTP';
                        } else {
                            btnSendOtp.textContent = `Gá»­i láº¡i (${countdown}s)`;
                        }
                    }, 1000);
                } catch (err) {
                    showToast(err.message, 'error');
                    otpStatus.textContent = `Lá»—i: ${err.message}`;
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
        showToast('Lá»—i táº£i dá»¯ liá»‡u ngÆ°á»i dĂ¹ng', 'error');
    }
}

async function resetUserDevice(userId, fullname, type = 'mobile') {
    const label = type === 'mobile' ? 'App Ä‘iá»‡n thoáº¡i' : 'TrĂ¬nh duyá»‡t web';
    const payload = type === 'mobile' ? { deviceId: null } : { browserDeviceId: null };
    showModal('XĂ³a liĂªn káº¿t thiáº¿t bá»‹', `Báº¡n cĂ³ cháº¯c muá»‘n xĂ³a liĂªn káº¿t <strong>${label}</strong> cá»§a nhĂ¢n viĂªn <strong>${fullname}</strong>?<br>Sau khi xĂ³a, nhĂ¢n viĂªn nĂ y cĂ³ thá»ƒ Ä‘Äƒng nháº­p trĂªn thiáº¿t bá»‹/trĂ¬nh duyá»‡t má»›i.`, [
        { text: 'Há»§y', class: 'btn-ghost' },
        { text: 'XĂ³a liĂªn káº¿t', class: 'btn btn-danger btn-sm', action: async () => {
            try {
                await api(`/api/users/${userId}`, 'PUT', payload);
                await refreshAdminUsers();
                showToast(`ÄĂ£ xĂ³a liĂªn káº¿t ${label}!`);
            } catch (e) {
                showToast(e.message, 'error');
            }
        }}
    ]);
}

function showUnlinkOptions(userId, fullname, hasMobile, hasWeb) {
    showModal('XĂ³a táº¥t cáº£ liĂªn káº¿t thiáº¿t bá»‹', `Báº¡n cĂ³ cháº¯c muá»‘n xĂ³a táº¥t cáº£ liĂªn káº¿t (App Ä‘iá»‡n thoáº¡i & TrĂ¬nh duyá»‡t web) cá»§a nhĂ¢n viĂªn <strong>${fullname}</strong>?<br>Sau khi xĂ³a, nhĂ¢n viĂªn nĂ y cĂ³ thá»ƒ Ä‘Äƒng nháº­p trĂªn thiáº¿t bá»‹/trĂ¬nh duyá»‡t má»›i.`, [
        { text: 'Há»§y', class: 'btn-ghost' },
        { text: 'XĂ³a liĂªn káº¿t', class: 'btn btn-danger btn-sm', action: async () => {
            try {
                await api(`/api/users/${userId}`, 'PUT', { deviceId: null, browserDeviceId: null });
                await refreshAdminUsers();
                showToast(`ÄĂ£ xĂ³a toĂ n bá»™ liĂªn káº¿t thiáº¿t bá»‹ cá»§a ${fullname}!`);
            } catch (e) {
                showToast(e.message, 'error');
            }
        }}
    ]);
}

window.showUnlinkOptions = showUnlinkOptions;

async function approveUnlinkDevice(userId, fullname) {
    showModal('Duyá»‡t huá»· liĂªn káº¿t thiáº¿t bá»‹', `Báº¡n cĂ³ cháº¯c muá»‘n phĂª duyá»‡t yĂªu cáº§u huá»· liĂªn káº¿t thiáº¿t bá»‹ cá»§a nhĂ¢n viĂªn <strong>${fullname}</strong>?<br>Thao tĂ¡c nĂ y sáº½ reset liĂªn káº¿t cáº£ App Ä‘iá»‡n thoáº¡i vĂ  TrĂ¬nh duyá»‡t, nhĂ¢n viĂªn sáº½ tá»± Ä‘á»™ng Ä‘Äƒng xuáº¥t.`, [
        { text: 'Há»§y', class: 'btn-ghost' },
        { text: 'Duyá»‡t', class: 'btn btn-primary btn-sm', action: async () => {
            try {
                await api(`/api/users/${userId}`, 'PUT', { deviceId: null, browserDeviceId: null, pendingUnlink: false });
                await refreshAdminUsers();
                showToast('ÄĂ£ duyá»‡t yĂªu cáº§u huá»· liĂªn káº¿t thiáº¿t bá»‹!');
            } catch (e) {
                showToast(e.message, 'error');
            }
        }}
    ]);
}
async function rejectUnlinkDevice(userId, fullname) {
    showModal('Tá»« chá»‘i huá»· liĂªn káº¿t thiáº¿t bá»‹', `Báº¡n cĂ³ cháº¯c muá»‘n tá»« chá»‘i yĂªu cáº§u huá»· liĂªn káº¿t thiáº¿t bá»‹ cá»§a nhĂ¢n viĂªn <strong>${fullname}</strong>?`, [
        { text: 'Há»§y', class: 'btn-ghost' },
        { text: 'Tá»« chá»‘i', class: 'btn btn-danger btn-sm', action: async () => {
            try {
                await api(`/api/users/${userId}`, 'PUT', { pendingUnlink: false });
                await refreshAdminUsers();
                showToast('ÄĂ£ tá»« chá»‘i yĂªu cáº§u huá»· liĂªn káº¿t thiáº¿t bá»‹!');
            } catch (e) {
                showToast(e.message, 'error');
            }
        }}
    ]);
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
                        <small style="font-size: 11px; color: var(--text-secondary);">TĂ­nh cháº¥t: ${act.calcMode === 'trip' ? 'TĂ­nh theo Chuyáº¿n' : 'TĂ­nh theo Giá»'}</small>
                    </span>
                </label>
                <div class="form-group" id="admin-ot-custom-activity-detail-group-${act.id}" style="display: none; margin-top: 8px; padding: 0 4px; margin-bottom: 0;">
                    <label style="display:block; margin-bottom:6px; font-size:13px; font-weight:600; color:var(--text-secondary);">${act.detailLabel || 'Chi tiáº¿t'}</label>
                    <input type="text" class="admin-ot-custom-activity-detail" data-act-id="${act.id}" placeholder="${act.placeholder || 'Nháº­p chi tiáº¿t...'}" style="width: 100%; height: 38px; background: rgba(0,0,0,0.2); color: #fff; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; padding: 0 10px; font-size: 14px;">
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
        // Tá»± Ä‘á»™ng bá» chá»n cĂ¡c checkbox hoáº¡t Ä‘á»™ng khĂ¡c (chá»‰ cho phĂ©p chá»n tá»‘i Ä‘a 1 hoáº¡t Ä‘á»™ng)
        document.querySelectorAll('.admin-ot-custom-activity-checkbox').forEach(other => {
            if (other !== chk) {
                other.checked = false;
                // áº¨n chi tiáº¿t cá»§a checkbox kia Ä‘i
                const otherDetailGroup = document.getElementById(`admin-ot-custom-activity-detail-group-${other.dataset.actId}`);
                if (otherDetailGroup) otherDetailGroup.style.display = 'none';
            }
        });
        
        // Hiá»ƒn thá»‹ khung nháº­p chi tiáº¿t cá»§a hoáº¡t Ä‘á»™ng nĂ y
        const detailGroup = document.getElementById(`admin-ot-custom-activity-detail-group-${actId}`);
        if (detailGroup) detailGroup.style.display = 'block';
    } else {
        // áº¨n khung nháº­p chi tiáº¿t
        const detailGroup = document.getElementById(`admin-ot-custom-activity-detail-group-${actId}`);
        if (detailGroup) detailGroup.style.display = 'none';
    }
    updateAdminOTPreview();
};

window.toggleModalCustomActivityInput = function(actId) {
    const chk = document.querySelector(`.modal-rec-custom-activity-checkbox[data-act-id="${actId}"]`);
    const noteEl = document.getElementById('modal-rec-note');
    if (chk && chk.checked) {
        // Tá»± Ä‘á»™ng bá» chá»n cĂ¡c checkbox hoáº¡t Ä‘á»™ng khĂ¡c
        document.querySelectorAll('.modal-rec-custom-activity-checkbox').forEach(other => {
            if (other !== chk) {
                other.checked = false;
                const otherDetailGroup = document.getElementById(`modal-rec-custom-activity-detail-group-${other.dataset.actId}`);
                if (otherDetailGroup) otherDetailGroup.style.display = 'none';
            }
        });
        
        // Hiá»ƒn thá»‹ khung nháº­p chi tiáº¿t cá»§a hoáº¡t Ä‘á»™ng nĂ y
        const detailGroup = document.getElementById(`modal-rec-custom-activity-detail-group-${actId}`);
        if (detailGroup) {
            detailGroup.style.display = 'block';
            const detailInput = detailGroup.querySelector('.modal-rec-custom-activity-detail');
            if (detailInput) detailInput.required = true;
        }
        if (noteEl) {
            noteEl.required = false;
            noteEl.placeholder = `Máº·c Ä‘á»‹nh: ${chk.dataset.actName}...`;
        }
    } else {
        // áº¨n khung nháº­p chi tiáº¿t
        const detailGroup = document.getElementById(`modal-rec-custom-activity-detail-group-${actId}`);
        if (detailGroup) {
            detailGroup.style.display = 'none';
            const detailInput = detailGroup.querySelector('.modal-rec-custom-activity-detail');
            if (detailInput) {
                detailInput.required = false;
                detailInput.value = '';
            }
        }
        // Kiá»ƒm tra xem cĂ²n checkbox nĂ o khĂ¡c Ä‘Æ°á»£c chá»n khĂ´ng
        const anyChecked = document.querySelector('.modal-rec-custom-activity-checkbox:checked');
        if (!anyChecked && noteEl) {
            noteEl.required = true;
            noteEl.placeholder = "LĂ½ do tÄƒng ca, phĂ¢n cĂ´ng cĂ´ng viá»‡c...";
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
                        <small style="font-size: 11px; color: var(--text-secondary);">TĂ­nh cháº¥t: ${act.calcMode === 'trip' ? 'TĂ­nh theo Chuyáº¿n' : 'TĂ­nh theo Giá»'}</small>
                    </span>
                </label>
                <div class="form-group" id="ot-custom-activity-detail-group-${act.id}" style="display: none; margin-top: 8px; padding: 0 4px; margin-bottom: 0;">
                    <label style="display:block; margin-bottom:6px; font-size:13px; font-weight:600; color:var(--text-secondary);">${act.detailLabel || 'Chi tiáº¿t'}</label>
                    <input type="text" class="ot-custom-activity-detail" data-act-id="${act.id}" placeholder="${act.placeholder || 'Nháº­p chi tiáº¿t...'}" style="width: 100%; height: 38px; background: rgba(0,0,0,0.2); color: #fff; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; padding: 0 10px; font-size: 14px;">
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
        // Tá»± Ä‘á»™ng bá» chá»n cĂ¡c checkbox hoáº¡t Ä‘á»™ng khĂ¡c (chá»‰ cho phĂ©p chá»n tá»‘i Ä‘a 1 hoáº¡t Ä‘á»™ng)
        document.querySelectorAll('.ot-custom-activity-checkbox').forEach(other => {
            if (other !== chk) {
                other.checked = false;
                // áº¨n chi tiáº¿t cá»§a checkbox kia Ä‘i
                const otherDetailGroup = document.getElementById(`ot-custom-activity-detail-group-${other.dataset.actId}`);
                if (otherDetailGroup) otherDetailGroup.style.display = 'none';
            }
        });
        
        // Hiá»ƒn thá»‹ khung nháº­p chi tiáº¿t cá»§a hoáº¡t Ä‘á»™ng nĂ y
        const detailGroup = document.getElementById(`ot-custom-activity-detail-group-${actId}`);
        if (detailGroup) detailGroup.style.display = 'block';
    } else {
        // áº¨n khung nháº­p chi tiáº¿t
        const detailGroup = document.getElementById(`ot-custom-activity-detail-group-${actId}`);
        if (detailGroup) detailGroup.style.display = 'none';
    }
    updateOTPreview();
};

async function forgotPasswordDialog() {
    const modalBody = `
        <div id="modal-form-forgot-password" class="login-form active" style="text-align: left; padding: 0;">
            <div class="form-group" style="margin-bottom: 12px;">
                <label style="display:block;margin-bottom:6px;font-weight:600;">TĂªn Ä‘Äƒng nháº­p</label>
                <div style="display: flex; gap: 8px;">
                    <input type="text" id="forgot-username" placeholder="Nháº­p tĂªn Ä‘Äƒng nháº­p..." class="input-sm" style="flex:1; box-sizing:border-box;" required>
                    <button type="button" id="btn-forgot-send-otp" class="btn btn-primary btn-sm" style="height:38px; white-space:nowrap; font-size:12px;">Gá»­i OTP</button>
                </div>
            </div>
            <div class="form-group" style="margin-bottom: 12px;">
                <label style="display:block;margin-bottom:6px;font-weight:600;">MĂ£ OTP xĂ¡c thá»±c (Nháº­n qua Email)</label>
                <input type="text" id="forgot-otp" placeholder="Nháº­p mĂ£ OTP 6 chá»¯ sá»‘..." class="input-sm" style="width:100%; box-sizing:border-box;" required maxlength="6" pattern="[0-9]*" oninput="this.value = this.value.replace(/[^0-9]/g, '')">
            </div>
            <div class="form-group" style="margin-bottom: 0;">
                <label style="display:block;margin-bottom:6px;font-weight:600;">Máº­t kháº©u má»›i</label>
                <input type="password" id="forgot-new-password" placeholder="Nháº­p máº­t kháº©u má»›i..." class="input-sm" style="width:100%; box-sizing:border-box;" required>
            </div>
        </div>
    `;
    
    showModal('QuĂªn máº­t kháº©u', modalBody, [
        { text: 'Há»§y', class: 'btn-ghost' },
        { text: 'Äáº·t láº¡i máº­t kháº©u', class: 'btn btn-primary btn-sm', action: async () => {
            const username = document.getElementById('forgot-username').value.trim();
            const otpCode = document.getElementById('forgot-otp').value.trim();
            const newPassword = document.getElementById('forgot-new-password').value.trim();
            
            if (!username || !otpCode || !newPassword) {
                return showToast('Vui lĂ²ng nháº­p Ä‘áº§y Ä‘á»§ thĂ´ng tin!', 'error');
            }
            if (newPassword.length < 4) {
                return showToast('Máº­t kháº©u má»›i pháº£i cĂ³ Ă­t nháº¥t 4 kĂ½ tá»±!', 'error');
            }
            
            try {
                const res = await api('/api/auth/forgot-password', 'POST', { username, otpCode, newPassword });
                showToast(res.message || 'Äáº·t láº¡i máº­t kháº©u thĂ nh cĂ´ng!', 'success');
            } catch (e) {
                showToast(e.message || 'Lá»—i Ä‘áº·t láº¡i máº­t kháº©u!', 'error');
            }
        }}
    ]);

    const btnSendOtp = document.getElementById('btn-forgot-send-otp');
    if (btnSendOtp) {
        btnSendOtp.onclick = async () => {
            const username = document.getElementById('forgot-username').value.trim();
            if (!username) {
                return showToast('Vui lĂ²ng nháº­p TĂªn Ä‘Äƒng nháº­p trÆ°á»›c!', 'error');
            }
            btnSendOtp.disabled = true;
            btnSendOtp.textContent = 'Gá»­i...';
            try {
                await api('/api/auth/send-email-otp', 'POST', { username });
                showToast('MĂ£ OTP Ä‘Ă£ Ä‘Æ°á»£c gá»­i Ä‘áº¿n Email liĂªn káº¿t cá»§a tĂ i khoáº£n!', 'success');
            } catch (e) {
                showToast(e.message || 'Lá»—i gá»­i OTP!', 'error');
            } finally {
                btnSendOtp.disabled = false;
                btnSendOtp.textContent = 'Gá»­i OTP';
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
            <div class="email-setup-title">XĂ¡c thá»±c Email tĂ i khoáº£n</div>
            <div class="email-setup-desc">
                TĂ i khoáº£n cá»§a báº¡n chÆ°a cáº¥u hĂ¬nh Email. Vui lĂ²ng nháº­p vĂ  xĂ¡c thá»±c Email cá»§a báº¡n Ä‘á»ƒ nháº­n mĂ£ OTP khĂ´i phá»¥c máº­t kháº©u sau nĂ y.
            </div>
            
            <div id="email-setup-step1">
                <div class="email-setup-group">
                    <label class="email-setup-label">Äá»‹a chá»‰ Email</label>
                    <input type="email" id="email-setup-address" class="email-setup-input" placeholder="ten-cua-ban@company.com" required>
                </div>
                <button type="button" id="email-setup-btn-send" class="email-setup-btn">Gá»­i mĂ£ OTP</button>
            </div>
            
            <div id="email-setup-step2" style="display: none;">
                <div class="email-setup-group" style="margin-bottom: 12px;">
                    <label class="email-setup-label" id="email-setup-sent-label">MĂ£ OTP (6 chá»¯ sá»‘)</label>
                    <input type="text" id="email-setup-otp" class="email-setup-input" placeholder="Nháº­p 6 chá»¯ sá»‘..." maxlength="6" pattern="[0-9]*" oninput="this.value = this.value.replace(/[^0-9]/g, '')">
                </div>
                <div style="display: flex; gap: 10px;">
                    <button type="button" id="email-setup-btn-back" class="email-setup-btn email-setup-btn-ghost" style="flex: 1;">Quay láº¡i</button>
                    <button type="button" id="email-setup-btn-verify" class="email-setup-btn" style="flex: 2;">XĂ¡c nháº­n</button>
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
            return showToast('Vui lĂ²ng nháº­p Ä‘á»‹a chá»‰ Email!', 'error');
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return showToast('Äá»‹a chá»‰ Email khĂ´ng há»£p lá»‡!', 'error');
        }
        
        btnSend.disabled = true;
        btnSend.textContent = 'Äang gá»­i mĂ£ OTP...';
        
        try {
            await api('/api/auth/send-email-otp', 'POST', { username, email });
            targetEmail = email;
            
            showToast('ÄĂ£ gá»­i mĂ£ OTP tá»›i email cá»§a báº¡n!', 'success');
            step1.style.display = 'none';
            step2.style.display = 'block';
            inputOtp.value = '';
            inputOtp.focus();
        } catch (e) {
            showToast(e.message || 'Lá»—i gá»­i mĂ£ OTP!', 'error');
        } finally {
            btnSend.disabled = false;
            btnSend.textContent = 'Gá»­i mĂ£ OTP';
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
            return showToast('Vui lĂ²ng nháº­p mĂ£ OTP gá»“m 6 chá»¯ sá»‘!', 'error');
        }
        
        btnVerify.disabled = true;
        btnVerify.textContent = 'Äang xĂ¡c nháº­n...';
        
        try {
            await api('/api/auth/verify-email-otp', 'POST', { username, email: targetEmail, otpCode });
            showToast('XĂ¡c thá»±c email thĂ nh cĂ´ng!', 'success');
            
            overlay.classList.remove('active');
            setTimeout(() => overlay.remove(), 300);
            
            if (onVerified) onVerified(targetEmail);
        } catch (e) {
            showToast(e.message || 'MĂ£ OTP khĂ´ng chĂ­nh xĂ¡c!', 'error');
        } finally {
            btnVerify.disabled = false;
            btnVerify.textContent = 'XĂ¡c nháº­n';
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
})();


