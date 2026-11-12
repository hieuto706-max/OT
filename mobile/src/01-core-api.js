/**
 * OT Manager - Mobile App (Nhân viên)
 * Dùng cho nhân viên trên Android & iOS
 * Kết nối server qua REST API
 */


// Polyfills for older Android WebView (Android 5.0 / Chrome 37) compatibility
if (!String.prototype.includes) {
    String.prototype.includes = function(search, start) {
        'use strict';
        if (search instanceof RegExp) {
            throw TypeError('first argument must not be a RegExp');
        }
        if (start === undefined) { start = 0; }
        return this.indexOf(search, start) !== -1;
    };
}

if (!Array.prototype.includes) {
    Array.prototype.includes = function(search, start) {
        'use strict';
        if (this == null) {
            throw new TypeError('"this" is null or not defined');
        }
        var o = Object(this);
        var len = o.length >>> 0;
        if (len === 0) {
            return false;
        }
        var n = start | 0;
        var k = Math.max(n >= 0 ? n : len - Math.abs(n), 0);
        while (k < len) {
            if (o[k] === search) {
                return true;
            }
            k++;
        }
        return false;
    };
}

if (!Array.prototype.find) {
    Array.prototype.find = function(predicate) {
        if (this == null) {
            throw new TypeError('"this" is null or not defined');
        }
        var o = Object(this);
        var len = o.length >>> 0;
        if (typeof predicate !== 'function') {
            throw new TypeError('predicate must be a function');
        }
        var thisArg = arguments[1];
        var k = 0;
        while (k < len) {
            var kValue = o[k];
            if (predicate.call(thisArg, kValue, k, o)) {
                return kValue;
            }
            k++;
        }
        return undefined;
    };
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

// Safe localStorage/sessionStorage wrapper to prevent crashes on file:// URLs
const safeStorage = {
    getItem(key) {
        try {
            if (sessionStorage.getItem('ot_session_temp') === '1') {
                return sessionStorage.getItem(key) || localStorage.getItem(key);
            }
            return localStorage.getItem(key) || sessionStorage.getItem(key);
        } catch (e) {
            return this._data[key] || null;
        }
    },
    setItem(key, val, persist = true) {
        try {
            if (persist) {
                localStorage.setItem(key, val);
                sessionStorage.removeItem(key);
            } else {
                sessionStorage.setItem(key, val);
                localStorage.removeItem(key);
            }
        } catch (e) {
            try {
                sessionStorage.setItem(key, val);
            } catch (e2) {
                this._data[key] = val;
            }
        }
    },
    removeItem(key) {
        try {
            localStorage.removeItem(key);
            sessionStorage.removeItem(key);
        } catch (e) {
            delete this._data[key];
        }
    },
    _data: {}
};

function getSessionCycleDateStr() {
    const shifted = new Date(Date.now() - 5 * 3600000);
    return shifted.getFullYear() + '-' + String(shifted.getMonth() + 1).padStart(2, '0') + '-' + String(shifted.getDate()).padStart(2, '0');
}

function clearMobileAuthSession() {
    ['ot_mobile_user', 'ot_login_time', 'ot_current_user', 'ot_login_date', 'ot_auth_token', 'ot_session_temp'].forEach(function(k) {
        safeStorage.removeItem(k);
    });
}

function getMostRecent5AM() {
    const now = new Date();
    const today5AM = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 5, 0, 0, 0);
    if (now.getTime() < today5AM.getTime()) {
        today5AM.setDate(today5AM.getDate() - 1);
    }
    return today5AM.getTime();
}

function isSessionExpired(loginTimeMs) {
    if (!loginTimeMs) return true;
    const loginTime = parseInt(loginTimeMs, 10);
    const mostRecent5AM = getMostRecent5AM();
    return loginTime < mostRecent5AM;
}

function isLocalNetworkUrl(urlStr) {
    if (!urlStr) return false;
    try {
        let tempUrl = urlStr;
        if (!urlStr.startsWith('http://') && !urlStr.startsWith('https://')) {
            tempUrl = 'http://' + urlStr;
        }
        const parsed = new URL(tempUrl);
        const hostname = parsed.hostname;
        return hostname === 'localhost' ||
               hostname === '127.0.0.1' ||
               /^192\.168\./.test(hostname) ||
               /^10\./.test(hostname) ||
               /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname) ||
               /^169\.254\./.test(hostname);
    } catch (e) {
        return false;
    }
}

// Khởi tạo API URL: lấy từ localStorage nếu có, mặc định là địa chỉ Cloud Render, nếu chạy web local thì tự động dùng origin
const MOBILE_VERSION = window.PACKAGED_VERSION || '1.6.0';
let updateCheckInterval = null;
const PROVINCES = [
    "An Giang", "Bà Rịa – Vũng Tàu", "Bạc Liêu", "Bắc Giang", "Bắc Kạn", "Bắc Ninh", "Bến Tre", "Bình Dương", "Bình Định", "Bình Phước", "Bình Thuận", "Cà Mau", "Cần Thơ", "Cao Bằng", "Đà Nẵng", "Đắk Lắk", "Đắk Nông", "Điện Biên", "Đồng Nai", "Đồng Tháp", "Gia Lai", "Hà Giang", "Hà Nam", "Hà Nội", "Hà Tĩnh", "Hải Dương", "Hải Phòng", "Hậu Giang", "Hòa Bình", "Hưng Yên", "Khánh Hòa", "Kiên Giang", "Kon Tum", "Lai Châu", "Lạng Sơn", "Lào Cai", "Lâm Đồng", "Long An", "Nam Định", "Nghệ An", "Ninh Bình", "Ninh Thuận", "Phú Thọ", "Phú Yên", "Quảng Bình", "Quảng Nam", "Quảng Ngãi", "Quảng Ninh", "Quảng Trị", "Sóc Trăng", "Sơn La", "Tây Ninh", "Thái Bình", "Thái Nguyên", "Thanh Hóa", "Thừa Thiên Huế", "Tiền Giang", "TP. Hồ Chí Minh", "Trà Vinh", "Tuyên Quang", "Vĩnh Long", "Vĩnh Phúc", "Yên Bái"
];
const isLocalWeb = window.location.protocol.startsWith('http') && !window.location.hostname.includes('github.io') && !window.location.hostname.includes('otmanager.id.vn');
let currentMobileHistoryType = 'ot';
let savedServerIp = safeStorage.getItem('ot_server_ip') || 'https://api.otmanager.id.vn';

// Nếu chạy trên điện thoại (bản Web) hoặc HTTPS công cộng, lọc và bỏ qua các IP nội bộ tư nhân (như 192.168, localhost, v.v.)
const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
const isPublicHttps = window.location.protocol === 'https:' || window.location.hostname.includes('github.io') || window.location.hostname.includes('otmanager.id.vn');
const isNativeApp = window.location.protocol === 'file:' || !!window.AndroidBridge;
if ((isMobileDevice || isPublicHttps) && !isNativeApp && isLocalNetworkUrl(savedServerIp)) {
    console.log('[Connection] Bỏ qua IP nội bộ tư nhân trên phiên bản Web di động:', savedServerIp);
    savedServerIp = 'https://api.otmanager.id.vn';
}

let API = isLocalWeb ? window.location.origin : savedServerIp;

// Nếu chạy trên HTTPS công cộng, không cho phép kết nối tới HTTP local IP (tránh lỗi Mixed Content hoặc Failed to fetch)
if (window.location.protocol === 'https:' && API.startsWith('http://')) {
    API = 'https://api.otmanager.id.vn';
}

// Tự động dọn dẹp các địa chỉ IP cũ từ các phiên bản trước
let savedIp = safeStorage.getItem('ot_server_ip');
if (!isLocalWeb && savedIp && (
    savedIp.includes('otms.onrender.com') || 
    savedIp.includes('ot-manager-server.onrender.com') || 
    savedIp.includes('ot-manager-server-jbxd.onrender.com') || 
    savedIp.includes('otm.app.vn') || 
    savedIp.includes('new-folder-6471') || 
    savedIp.includes('lhr.life') ||
    savedIp.includes('github.io') ||
    savedIp.includes('otmanager.id.vn')
)) {
    safeStorage.removeItem('ot_server_ip');
    API = 'https://api.otmanager.id.vn';
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

const OT_LUNCH_HOURS = 1;
const WORK_END_MIN = 16 * 60 + 30; // 16:30

let mobileOTRecords = [];
let mobileSystemSettings = { holidays: "" };

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

// Tạo vân tay trình duyệt để giữ cố định Device ID trên Web ngay cả khi xóa lịch sử
function getBrowserFingerprint(username) {
    if (!username) {
        // Nếu không có username (lúc khởi chạy chưa đăng nhập), tạo ID ngẫu nhiên tạm thời
        return 'web_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
    }
    // Ngược lại, nếu có username, tạo mã vân tay cố định theo máy và tên đăng nhập
    try {
        const ua = navigator.userAgent;
        // Detect OS
        let os = "unknown_os";
        if (ua.indexOf("Windows") !== -1) os = "Windows";
        else if (ua.indexOf("Macintosh") !== -1) os = "Mac";
        else if (ua.indexOf("Linux") !== -1) os = "Linux";
        else if (ua.indexOf("Android") !== -1) os = "Android";
        else if (ua.indexOf("iPhone") !== -1 || ua.indexOf("iPad") !== -1) os = "iOS";

        // Detect Browser
        let browser = "unknown_browser";
        if (ua.indexOf("Firefox") !== -1 || ua.indexOf("FxiOS") !== -1) browser = "Firefox";
        else if (ua.indexOf("Edge") !== -1 || ua.indexOf("Edg") !== -1) browser = "Edge";
        else if (ua.indexOf("OPR") !== -1 || ua.indexOf("Opera") !== -1) browser = "Opera";
        else if (ua.indexOf("Chrome") !== -1 || ua.indexOf("CriOS") !== -1) browser = "Chrome";
        else if (ua.indexOf("Safari") !== -1) browser = "Safari";

        // System specs
        const screenSpecs = Math.max(screen.width, screen.height) + 'x' + Math.min(screen.width, screen.height) + 'x' + screen.colorDepth;
        const tz = new Date().getTimezoneOffset();
        const cores = navigator.hardwareConcurrency || '';
        const platform = navigator.platform || '';
        const lang = navigator.language || '';

        // Kết hợp username để tránh trùng lặp giữa các máy cùng dòng
        const str = username + '_' + os + '_' + browser + '_' + screenSpecs + '_' + tz + '_' + platform + '_' + cores + '_' + lang;
        
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return 'web_' + Math.abs(hash).toString(36);
    } catch (e) {
        let hash = 0;
        const str = username + '_' + navigator.userAgent + (navigator.language || '') + screen.width + 'x' + screen.height;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return 'web_fallback_' + Math.abs(hash).toString(36);
    }
}

// Tạo/Lấy Device ID duy nhất cho điện thoại hoặc trình duyệt web
let deviceId = '';

function getDeviceId(username) {
    let id = safeStorage.getItem('ot_device_id') || '';
    const isWebBrowser = window.location.protocol !== 'file:' && !window.AndroidBridge;
    
    // Đối với trình duyệt Web (hoặc Web Clip), kiểm tra xem có tham số device_id trên URL không
    if (isWebBrowser) {
        try {
            const urlParams = new URLSearchParams(window.location.search);
            const queryDeviceId = urlParams.get('device_id');
            if (queryDeviceId && queryDeviceId.startsWith('web_') && queryDeviceId.length >= 25) {
                id = queryDeviceId;
                safeStorage.setItem('ot_device_id', id);
            }
        } catch (e) {
            console.error('Lỗi phân tích device_id từ URL:', e);
        }
    }
    
    if (!isWebBrowser) {
        // Native App (Android / iOS)
        if (!id || id.startsWith('dev_')) {
            try {
                if (window.AndroidBridge && typeof window.AndroidBridge.getAndroidId === 'function') {
                    const nativeId = window.AndroidBridge.getAndroidId();
                    if (nativeId) {
                        const prefix = window.__IS_IOS_APP__ ? 'ios_' : 'android_';
                        id = prefix + nativeId;
                        safeStorage.setItem('ot_device_id', id);
                        deviceId = id;
                    }
                }
            } catch (err) {
                console.error("Lỗi lấy Device ID từ native bridge:", err);
            }
        }
    } else {
        // Web Browser - Sử dụng mã ngẫu nhiên duy nhất cho trình duyệt (PWA-friendly)
        const isValidRandomId = id && id.startsWith('web_') && id.length >= 25;
        if (!isValidRandomId) {
            id = 'web_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
            safeStorage.setItem('ot_device_id', id);
        }
    }
    
    if (!id) {
        // Fallback ngẫu nhiên
        id = 'dev_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
        safeStorage.setItem('ot_device_id', id);
        deviceId = id;
    }
    return id;
}

// Khởi tạo lần đầu
deviceId = getDeviceId();

let currentUser = null;
let historyRecordsList = [];

// ==================== COLD-START WAKEUP & THEME HELPERS ====================
function createMobileWakeupController() {
    var banner = document.getElementById('mobile-wakeup-banner');
    var textEl = document.getElementById('mobile-wakeup-text');
    var barEl = document.getElementById('mobile-wakeup-bar');
    var delayTimer = null;
    var tickTimer = null;
    var startedAt = Date.now();
    var stopped = false;

    delayTimer = setTimeout(function() {
        if (stopped || !banner) return;
        banner.style.display = 'block';
        var update = function() {
            var sec = Math.max(1, Math.floor((Date.now() - startedAt) / 1000));
            if (textEl) {
                textEl.textContent = 'Đang đánh thức máy chủ Cloud... (' + sec + 's)';
            }
            if (barEl) {
                var pct = Math.min(94, Math.round(12 + (sec / 45) * 82));
                barEl.style.width = pct + '%';
            }
        };
        update();
        tickTimer = setInterval(update, 1000);
    }, 3200);

    return {
        stop: function() {
            stopped = true;
            if (delayTimer) clearTimeout(delayTimer);
            if (tickTimer) clearInterval(tickTimer);
            if (banner) banner.style.display = 'none';
            if (barEl) barEl.style.width = '8%';
        }
    };
}

function syncMobileThemeUI() {
    var isLight = document.documentElement.getAttribute('data-theme') === 'light';
    var sunSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" width="18" height="18"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
    var moonSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" width="17" height="17"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
    var icons = document.querySelectorAll('.mobile-theme-icon');
    for (var i = 0; i < icons.length; i++) {
        icons[i].innerHTML = isLight ? moonSvg : sunSvg;
    }
    var metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
        metaTheme.setAttribute('content', isLight ? '#f1f5f9' : '#07070c');
    }
}

window.toggleMobileTheme = function() {
    var cur = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    var next = cur === 'light' ? 'dark' : 'light';
    if (next === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
    } else {
        document.documentElement.removeAttribute('data-theme');
    }
    safeStorage.setItem('ot_theme_mode', next);
    syncMobileThemeUI();
};

// ==================== API CLIENT ====================
// Dùng XMLHttpRequest thay cho fetch để tương thích Android 5.0 WebView
function api(endpoint, method, body, skipAuthRedirect) {
    deviceId = getDeviceId(); // Đảm bảo đã cập nhật deviceId từ AndroidBridge nếu có
    method = method || 'GET';
    body = body || null;

    // Kiểm tra hết hạn phiên đăng nhập (sau 5h sáng hôm sau)
    const loginTime = safeStorage.getItem('ot_login_time');
    if (currentUser && loginTime && isSessionExpired(loginTime) && !skipAuthRedirect) {
        currentUser = null;
        clearMobileAuthSession();
        handleUnauthenticated();
        showToast('Phiên đăng nhập đã hết hạn (sau 5h sáng), vui lòng đăng nhập lại!', 'error');
        return Promise.reject(new Error('Phiên đăng nhập đã hết hạn!'));
    }

    if (!API) {
        return Promise.reject(new Error('Chưa kết nối Server! Nhấn ⚙️ Cấu hình IP Server để thiết lập.'));
    }
    var wakeupCtrl = (endpoint && endpoint.indexOf('/api/auth/') !== -1) ? createMobileWakeupController() : null;
    return new Promise(function(resolve, reject) {
        var xhr = new XMLHttpRequest();
        xhr.open(method, API + endpoint, true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        // Gửi JWT Token nếu có
        var authToken = safeStorage.getItem('ot_auth_token');
        if (authToken) {
            xhr.setRequestHeader('Authorization', 'Bearer ' + authToken);
        }
        if (typeof deviceId !== 'undefined' && deviceId) {
            xhr.setRequestHeader('x-device-id', deviceId);
        }
        if (currentUser && currentUser.id) {
            xhr.setRequestHeader('x-user-id', currentUser.id);
        }
        xhr.timeout = (API.indexOf('onrender.com') !== -1 || API.indexOf('otmanager.id.vn') !== -1) ? 60000 : 10000;
        xhr.onload = function() {
            if (wakeupCtrl) wakeupCtrl.stop();
            try {
                var data = JSON.parse(xhr.responseText);
                if (xhr.status >= 200 && xhr.status < 300) {
                    resolve(data);
                } else {
                    if (xhr.status === 401 || xhr.status === 403) {
                        if (skipAuthRedirect) {
                            reject(new Error(data.error || 'Lỗi xác thực!'));
                            return;
                        }
                        // Văng khỏi ứng dụng nếu tài khoản bị xóa hoặc bị hủy liên kết thiết bị
                        currentUser = null;
                        clearMobileAuthSession();
                        handleUnauthenticated();
                        showToast(data.error || 'Tài khoản hoặc liên kết thiết bị của bạn đã bị hủy!', 'error');
                        reject(new Error(data.error || 'Lỗi xác thực!'));
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
            if (wakeupCtrl) wakeupCtrl.stop();
            reject(new Error('Không thể kết nối Server! Kiểm tra IP hoặc WiFi.'));
        };
        xhr.ontimeout = function() {
            if (wakeupCtrl) wakeupCtrl.stop();
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
    if (!start || !end) return 0;
    const s = timeToMinutes(start);
    let e = timeToMinutes(end);
    if (e === s) return 0;
    // Hỗ trợ tăng ca qua nửa đêm (từ 00:00 đến 12:00 sáng hôm sau)
    if (e < s && e <= 12 * 60) {
        e += 24 * 60;
    }
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
    if (c) {
        c.innerHTML = '';
    }
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

function showConfirm(msg, okText = 'Xóa', okClass = 'btn btn-danger') {
    return new Promise(resolve => {
        document.getElementById('confirm-msg').textContent = msg;
        const okBtn = document.getElementById('confirm-ok');
        if (okBtn) {
            okBtn.textContent = okText;
            okBtn.className = okClass;
        }
        const overlay = document.getElementById('confirm-overlay');
        overlay.classList.add('active');

        const onOk = () => { cleanup(); resolve(true); };
        const onCancel = () => { cleanup(); resolve(false); };
        const cleanup = () => {
            overlay.classList.remove('active');
            if (okBtn) {
                okBtn.removeEventListener('click', onOk);
                okBtn.textContent = 'Xóa';
                okBtn.className = 'btn btn-danger';
            }
            document.getElementById('confirm-cancel').removeEventListener('click', onCancel);
        };

        if (okBtn) okBtn.addEventListener('click', onOk);
        document.getElementById('confirm-cancel').addEventListener('click', onCancel);
    });
}

// ==================== CONNECTION STATUS ====================
function updateConnectionStatus(connected, serverUrl, isConnecting) {
    const statusEl = document.getElementById('connection-status');
    if (statusEl) {
        if (isConnecting) {
            statusEl.style.display = 'block';
            statusEl.innerHTML = `<span style="color:#f59e0b; animation: pulse 1.5s infinite; display: inline-block;">● Đang kết nối Cloud...</span> <small style="color:var(--text-muted);font-size:0.7rem;">(Đang đánh thức server, vui lòng đợi 30-50s)</small>`;
        } else if (connected && serverUrl) {
            // Ẩn đi khi đã kết nối thành công theo yêu cầu của user
            statusEl.style.display = 'none';
        } else {
            statusEl.style.display = 'block';
            statusEl.innerHTML = `<span style="color:#ef4444;">● Ngoại tuyến (Offline)</span>`;
        }
    }
    const badge = document.getElementById('app-connection-badge');
    if (badge) {
        if (connected && serverUrl) {
            badge.style.display = 'none';
        } else {
            badge.style.display = 'inline-block';
            if (isConnecting) {
                badge.style.background = 'rgba(245, 158, 11, 0.15)';
                badge.style.color = '#f59e0b';
                badge.textContent = 'Connecting...';
            } else {
                badge.style.background = 'rgba(239, 68, 68, 0.15)';
                badge.style.color = '#ef4444';
                badge.textContent = 'Offline';
            }
        }
    }

    // Cập nhật đường link tải APK động
    const link = document.getElementById('download-apk-link');
    if (link) {
        const url = API ? (API + '/OT-Manager-mobile.apk') : '/OT-Manager-mobile.apk';
        link.href = url;
        link.onclick = function(e) {
            if (!API && (window.location.protocol === 'file:' || window.AndroidBridge)) {
                e.preventDefault();
                showToast('Chưa kết nối Server! Vui lòng cấu hình IP Server hoặc đợi tự động kết nối.', 'error');
            }
        };
    }
}
