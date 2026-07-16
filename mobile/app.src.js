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
            return localStorage.getItem(key) || sessionStorage.getItem(key);
        } catch (e) {
            return this._data[key] || null;
        }
    },
    setItem(key, val, persist = true) {
        try {
            if (persist) {
                localStorage.setItem(key, val);
            } else {
                sessionStorage.setItem(key, val);
            }
        } catch (e) {
            this._data[key] = val;
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
const MOBILE_VERSION = window.PACKAGED_VERSION || '1.4.4';
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
if (!isLocalWeb && savedIp && (savedIp.includes('otms.onrender.com') || savedIp.includes('ot-manager-server.onrender.com') || savedIp.includes('otm.app.vn') || savedIp.includes('new-folder-6471') || savedIp.includes('lhr.life'))) {
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
        safeStorage.removeItem('ot_mobile_user');
        safeStorage.removeItem('ot_login_time');
        handleUnauthenticated();
        showToast('Phiên đăng nhập đã hết hạn (sau 5h sáng), vui lòng đăng nhập lại!', 'error');
        return Promise.reject(new Error('Phiên đăng nhập đã hết hạn!'));
    }

    if (!API) {
        return Promise.reject(new Error('Chưa kết nối Server! Nhấn ⚙️ Cấu hình IP Server để thiết lập.'));
    }
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
                        safeStorage.removeItem('ot_mobile_user');
                        safeStorage.removeItem('ot_login_time');
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
    const s = timeToMinutes(start);
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

// ==================== SCREENS ====================
function showScreen(id) {
    if (id === 'screen-login') {
        document.documentElement.classList.remove('user-logged-in');
    } else if (id === 'screen-app') {
        document.documentElement.classList.add('user-logged-in');
    }
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

async function handleEmployeeLogin(e) {
    e.preventDefault();
    const username = document.getElementById('login-user').value.trim();
    deviceId = getDeviceId(username); // Cập nhật deviceId mới nhất theo username trước khi kiểm tra/đăng nhập
    const errEl = document.getElementById('login-error-emp');
    errEl.textContent = '';

    if (window.location.protocol !== 'file:' && !window.AndroidBridge && await isPrivateMode()) {
        errEl.textContent = 'Hệ thống không cho phép đăng nhập từ trình duyệt ẩn danh (Incognito Mode) để đảm bảo an toàn thiết bị!';
        return;
    }

    const isBrowser = window.location.protocol !== 'file:' && !window.AndroidBridge;

    if (!API) {
        const cachedUsernames = JSON.parse(safeStorage.getItem('ot_cached_usernames') || '[]');
        const user = cachedUsernames.find(u => u.username.toLowerCase() === username.toLowerCase());
        if (user) {
            const keyToCheck = isBrowser ? user.browserDeviceId : user.deviceId;
            if (keyToCheck && keyToCheck !== deviceId) {
                errEl.textContent = isBrowser
                    ? 'Tài khoản này đã được đăng nhập trên một trình duyệt khác!'
                    : 'Tài khoản này đã được đăng nhập trên một thiết bị khác!';
                return;
            }
            currentUser = { id: user.id, username: user.username, fullname: user.fullname, role: 'employee' };
            safeStorage.setItem('ot_mobile_user', JSON.stringify(currentUser));
            safeStorage.setItem('ot_login_time', Date.now().toString());
            enterApp();
            showToast('Đăng nhập ngoại tuyến (offline)!', 'warning');
            return;
        }
        errEl.textContent = 'Chưa kết nối Server và không tìm thấy tài khoản offline!';
        return;
    }

    try {
        const oldUser = JSON.parse(safeStorage.getItem('ot_mobile_user') || 'null');
        const data = await api('/api/auth/login', 'POST', { username, deviceId, isBrowser, clientSource: 'mobile_app' });

        if (data.user.role !== 'employee') {
            errEl.textContent = 'Tài khoản này không phải là nhân viên!';
            return;
        }

        // Cập nhật ID cho các bản ghi offline
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
            }
        }

        currentUser = data.user;
        safeStorage.setItem('ot_mobile_user', JSON.stringify(currentUser));
        safeStorage.setItem('ot_login_time', Date.now().toString());
        if (data.token) safeStorage.setItem('ot_auth_token', data.token);

        cacheUsernames();
        enterApp();
    } catch (err) {
        const isNetworkError = err.message.includes('kết nối') || err.message.includes('timeout') || err.message.includes('Server');
        if (isNetworkError) {
            const cachedUsernames = JSON.parse(safeStorage.getItem('ot_cached_usernames') || '[]');
            const user = cachedUsernames.find(u => u.username.toLowerCase() === username.toLowerCase());
            if (user) {
                const keyToCheck = isBrowser ? user.browserDeviceId : user.deviceId;
                if (keyToCheck && keyToCheck !== deviceId) {
                    errEl.textContent = isBrowser
                        ? 'Tài khoản này đã được đăng nhập trên một trình duyệt khác!'
                        : 'Tài khoản này đã được đăng nhập trên một thiết bị khác!';
                    return;
                }
                currentUser = { id: user.id, username: user.username, fullname: user.fullname, role: 'employee' };
                safeStorage.setItem('ot_mobile_user', JSON.stringify(currentUser));
                safeStorage.setItem('ot_login_time', Date.now().toString());
                enterApp();
                showToast('Đăng nhập ngoại tuyến (offline)!', 'warning');
                return;
            }
        }
        
        if (err.message.includes('trình duyệt khác') || err.message.includes('thiết bị khác')) {
            errEl.innerHTML = `${err.message}<br><button type="button" class="btn btn-ghost btn-sm" id="btn-request-unlink-login" style="margin-top: 10px; width: 100%; border: 1px dashed rgba(239, 68, 68, 0.4); padding: 8px 16px; font-size: 0.85rem; font-weight: 600; border-radius: 8px; color: #ef4444; background: rgba(239, 68, 68, 0.04); cursor: pointer; transition: all 0.2s ease-in-out; display: block; box-sizing: border-box;">Xin Quản lý huỷ liên kết</button>`;
            
            const unlinkBtn = document.getElementById('btn-request-unlink-login');
            if (unlinkBtn) {
                // Hover effects
                unlinkBtn.addEventListener('mouseenter', () => {
                    unlinkBtn.style.background = 'rgba(239, 68, 68, 0.1)';
                    unlinkBtn.style.borderColor = '#ef4444';
                });
                unlinkBtn.addEventListener('mouseleave', () => {
                    unlinkBtn.style.background = 'rgba(239, 68, 68, 0.04)';
                    unlinkBtn.style.borderColor = 'rgba(239, 68, 68, 0.4)';
                });
                unlinkBtn.addEventListener('click', async () => {
                    unlinkBtn.disabled = true;
                    unlinkBtn.textContent = 'Đang gửi yêu cầu...';
                    try {
                        const unlinkRes = await api('/api/auth/request-unlink', 'POST', { username }, true);
                        showToast('Gửi yêu cầu thành công!', 'success');
                        errEl.innerHTML = `<span style="color:#10b981; font-weight: 700; display: block; margin-top: 8px;">✅ ${unlinkRes.message || 'Đã gửi yêu cầu huỷ liên kết đến Quản trị viên!'}</span>`;
                    } catch (unlinkErr) {
                        showToast(unlinkErr.message, 'error');
                        unlinkBtn.disabled = false;
                        unlinkBtn.textContent = 'Xin Quản lý huỷ liên kết';
                    }
                });
            }
        } else {
            errEl.textContent = err.message;
        }
    }
}

async function handleAdminLogin(e) {
    e.preventDefault();
    deviceId = getDeviceId(); // Cập nhật deviceId mới nhất trước khi đăng nhập
    const username = document.getElementById('login-admin-user').value.trim();
    const password = document.getElementById('login-password').value;
    const errEl = document.getElementById('login-error-admin');
    errEl.textContent = '';

    if (window.location.protocol !== 'file:' && await isPrivateMode()) {
        errEl.textContent = 'Hệ thống không cho phép đăng nhập từ trình duyệt ẩn danh (Incognito Mode) để đảm bảo an toàn thiết bị!';
        return;
    }

    if (!API) {
        errEl.textContent = 'Không thể đăng nhập quản trị khi ngoại tuyến (Offline)!';
        return;
    }

    try {
        const data = await api('/api/auth/login', 'POST', { username, password, deviceId });
        
        if (data.user.role !== 'admin') {
            errEl.textContent = 'Tài khoản nhân viên không được phép đăng nhập bên phần quản trị!';
            return;
        }

        // Lưu thông tin đăng nhập quản lý
        safeStorage.setItem('ot_mobile_user', JSON.stringify(data.user));
        safeStorage.setItem('ot_login_time', Date.now().toString());
        if (data.token) safeStorage.setItem('ot_auth_token', data.token);
        
        // Đồng bộ session quản lý cho desktop/app.js tự động nhận diện
        safeStorage.setItem('ot_current_user', JSON.stringify(data.user));
        const todayStr = new Date().toISOString().split('T')[0];
        safeStorage.setItem('ot_login_date', todayStr);
        
        // Chuyển hướng tới trang quản lý desktop
        const needsOtPrefix = window.location.hostname.includes('github.io');
        const redirectUrl = needsOtPrefix ? '/OT/desktop/index.html' : '/desktop/index.html';
        showToast('Đăng nhập Quản lý thành công, đang chuyển hướng...', 'success');
        setTimeout(() => {
            window.location.href = redirectUrl;
        }, 1000);
    } catch (err) {
        errEl.textContent = err.message;
    }
}

function enterApp() {
    document.getElementById('greeting').textContent = getGreeting();
    document.getElementById('user-name').textContent = currentUser.fullname;
    const todayStr = new Date().toISOString().split('T')[0];
    document.getElementById('ot-date').value = todayStr;
    document.getElementById('ot-date').max = todayStr;
    document.getElementById('filter-month').value = getCurrentMonth();

    // Profile
    document.getElementById('profile-avatar').textContent = getInitials(currentUser.fullname);
    document.getElementById('profile-name').textContent = currentUser.fullname;
    document.getElementById('profile-username').textContent = `@${currentUser.username}`;

    const btnCheckUpdate = document.getElementById('btn-check-update-mobile');
    if (btnCheckUpdate) {
        btnCheckUpdate.style.display = 'block';
    }

    showScreen('screen-app');
    setupCustomActivitiesUI();
    updatePreview();
    loadHistory();
    loadProfileStats();
    updateConnectionStatus(true, API);
    updateSyncBanner();
    refreshCurrentUserInfo();
    checkAndRegisterPushNotifications();
}

function getGreeting() {
    const h = new Date().getHours();
    if (h < 12) return 'Chào buổi sáng ☀️';
    if (h < 18) return 'Chào buổi chiều 🌤️';
    return 'Chào buổi tối 🌙';
}

function isStandaloneOrNative() {
    const isStandaloneWeb = window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;
    const isNativeApp = window.location.protocol === 'file:' || !!window.AndroidBridge;
    return isStandaloneWeb || isNativeApp;
}

function handleUnauthenticated() {
    showScreen('screen-login');
}

function logout() {
    currentUser = null;
    safeStorage.removeItem('ot_mobile_user');
    safeStorage.removeItem('ot_login_time');
    safeStorage.removeItem('ot_current_user');
    safeStorage.removeItem('ot_login_date');
    safeStorage.removeItem('ot_auth_token');
    
    const loginForm = document.getElementById('form-login-employee');
    if (loginForm) loginForm.reset();
    
    const listContainer = document.getElementById('ot-custom-activities-list');
    if (listContainer) listContainer.innerHTML = '';
    const editListContainer = document.getElementById('edit-ot-custom-activities-list');
    if (editListContainer) editListContainer.innerHTML = '';

    showToast('Đã đăng xuất', 'info');
    
    handleUnauthenticated();
}

async function refreshCurrentUserInfo() {
    if (!currentUser || !currentUser.id) return;
    if (!API) return;
    try {
        const data = await api('/api/users/' + currentUser.id, 'GET', null, true);
        if (data && data.user) {
            currentUser = Object.assign({}, currentUser, data.user);
            safeStorage.setItem('ot_mobile_user', JSON.stringify(currentUser));
            setupCustomActivitiesUI();
            
            // Cập nhật giao diện nút hủy liên kết
            const btn = document.getElementById('btn-unlink-device');
            if (btn) {
                if (currentUser.pendingUnlink) {
                    btn.disabled = true;
                    btn.textContent = '⏳ Đang chờ duyệt huỷ liên kết...';
                    btn.style.opacity = '0.7';
                } else {
                    btn.disabled = false;
                    btn.textContent = '🔓 Xin huỷ liên kết thiết bị';
                    btn.style.opacity = '1';
                }
            }
        }
    } catch (err) {
        console.error('Error refreshing user info:', err);
    }
}

function setupCustomActivitiesUI() {
    const activityGroup = document.getElementById('ot-custom-activity-group');
    const editActivityGroup = document.getElementById('edit-ot-custom-activity-group');

    const teamSettings = currentUser ? currentUser.teamSettings : null;
    const activities = (teamSettings && teamSettings.customActivities) ? teamSettings.customActivities : [];

    const isBackfillChecked = document.getElementById('ot-backfill')?.checked || false;
    const isEditBackfillChecked = document.getElementById('edit-ot-backfill')?.checked || false;

    if (activities.length > 0) {
        if (activityGroup) activityGroup.style.display = isBackfillChecked ? 'none' : 'block';
        if (editActivityGroup) editActivityGroup.style.display = isEditBackfillChecked ? 'none' : 'block';

        // Nạp danh sách checkbox cho Form thêm (chỉ nạp nếu chưa có phần tử con)
        const listContainer = document.getElementById('ot-custom-activities-list');
        if (listContainer && listContainer.children.length === 0) {
            listContainer.innerHTML = activities.map(act => `
                <div class="custom-activity-item toggle-row" style="margin-bottom: 14px; text-align: left;">
                    <label class="toggle-label" for="chk-${act.id}" style="display: flex; justify-content: space-between; align-items: center; cursor: pointer;">
                        <span class="toggle-text">
                            <strong>${act.name}</strong>
                            <small>Tính chất: ${act.calcMode === 'trip' ? 'Tính theo Chuyến' : 'Tính theo Giờ'}</small>
                        </span>
                        <div class="toggle-switch">
                            <input type="checkbox" id="chk-${act.id}" class="ot-custom-activity-checkbox" data-act-id="${act.id}" data-act-name="${act.name}" data-act-mode="${act.calcMode}" onchange="toggleCustomActivityInput('${act.id}')">
                            <span class="toggle-slider"></span>
                        </div>
                    </label>
                    <div class="form-group" id="ot-custom-activity-detail-group-${act.id}" style="display: none; margin-top: 8px; padding: 0 4px; margin-bottom: 0;">
                        <label style="display:block; margin-bottom:6px; font-size:13px; font-weight:600; color:var(--text-secondary);">${act.detailLabel || 'Chi tiết'}</label>
                        <input type="text" class="ot-custom-activity-detail" data-act-id="${act.id}" placeholder="${act.placeholder || 'Nhập chi tiết...'}" style="width: 100%; height: 38px; background: rgba(0,0,0,0.2); color: #fff; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; padding: 0 10px; font-size: 14px;">
                    </div>
                </div>
            `).join('');
        }

        // Nạp danh sách checkbox cho Form sửa (chỉ nạp nếu chưa có phần tử con)
        const editListContainer = document.getElementById('edit-ot-custom-activities-list');
        if (editListContainer && editListContainer.children.length === 0) {
            editListContainer.innerHTML = activities.map(act => `
                <div class="custom-activity-item toggle-row" style="margin-bottom: 14px; text-align: left;">
                    <label class="toggle-label" for="edit-chk-${act.id}" style="display: flex; justify-content: space-between; align-items: center; cursor: pointer;">
                        <span class="toggle-text">
                            <strong>${act.name}</strong>
                            <small>Tính chất: ${act.calcMode === 'trip' ? 'Tính theo Chuyến' : 'Tính theo Giờ'}</small>
                        </span>
                        <div class="toggle-switch">
                            <input type="checkbox" id="edit-chk-${act.id}" class="edit-ot-custom-activity-checkbox" data-act-id="${act.id}" data-act-name="${act.name}" data-act-mode="${act.calcMode}" onchange="toggleEditCustomActivityInput('${act.id}')">
                            <span class="toggle-slider"></span>
                        </div>
                    </label>
                    <div class="form-group" id="edit-ot-custom-activity-detail-group-${act.id}" style="display: none; margin-top: 8px; padding: 0 4px; margin-bottom: 0;">
                        <label style="display:block; margin-bottom:6px; font-size:13px; font-weight:600; color:var(--text-secondary);">${act.detailLabel || 'Chi tiết'}</label>
                        <input type="text" class="edit-ot-custom-activity-detail" data-act-id="${act.id}" placeholder="${act.placeholder || 'Nhập chi tiết...'}" style="width: 100%; height: 38px; background: rgba(0,0,0,0.2); color: #fff; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; padding: 0 10px; font-size: 14px;">
                    </div>
                </div>
            `).join('');
        }
    } else {
        if (activityGroup) activityGroup.style.display = 'none';
        if (editActivityGroup) editActivityGroup.style.display = 'none';
    }
}

window.toggleCustomActivityInput = function(actId) {
    const chk = document.querySelector(`.ot-custom-activity-checkbox[data-act-id="${actId}"]`);
    if (chk && chk.checked) {
        // Tự động bỏ chọn các checkbox hoạt động khác (chỉ cho phép chọn tối đa 1 hoạt động)
        document.querySelectorAll('.ot-custom-activity-checkbox').forEach(other => {
            if (other !== chk) {
                other.checked = false;
                const otherGroup = document.getElementById(`ot-custom-activity-detail-group-${other.dataset.actId}`);
                if (otherGroup) {
                    otherGroup.style.display = 'none';
                    const otherInput = otherGroup.querySelector('.ot-custom-activity-detail');
                    if (otherInput) {
                        otherInput.value = '';
                        otherInput.required = false;
                    }
                }
            }
        });
    }

    const group = document.getElementById(`ot-custom-activity-detail-group-${actId}`);
    const input = group ? group.querySelector('.ot-custom-activity-detail') : null;
    if (chk && group) {
        group.style.display = chk.checked ? 'block' : 'none';
        if (input) {
            input.required = chk.checked;
            if (!chk.checked) input.value = '';
        }
    }
    updatePreview();
};

window.toggleEditCustomActivityInput = function(actId) {
    const chk = document.querySelector(`.edit-ot-custom-activity-checkbox[data-act-id="${actId}"]`);
    if (chk && chk.checked) {
        // Tự động bỏ chọn các checkbox hoạt động khác (chỉ cho phép chọn tối đa 1 hoạt động)
        document.querySelectorAll('.edit-ot-custom-activity-checkbox').forEach(other => {
            if (other !== chk) {
                other.checked = false;
                const otherGroup = document.getElementById(`edit-ot-custom-activity-detail-group-${other.dataset.actId}`);
                if (otherGroup) {
                    otherGroup.style.display = 'none';
                    const otherInput = otherGroup.querySelector('.edit-ot-custom-activity-detail');
                    if (otherInput) {
                        otherInput.value = '';
                        otherInput.required = false;
                    }
                }
            }
        });
    }

    const group = document.getElementById(`edit-ot-custom-activity-detail-group-${actId}`);
    const input = group ? group.querySelector('.edit-ot-custom-activity-detail') : null;
    if (chk && group) {
        group.style.display = chk.checked ? 'block' : 'none';
        if (input) {
            input.required = chk.checked;
            if (!chk.checked) input.value = '';
        }
    }
};

// Hàm cũ giữ lại làm rỗng để tránh lỗi gọi hàm
function handleCustomActivityChange() {}
function handleEditCustomActivityChange() {}

// ==================== OT FORM ====================
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
                items.push({ label: `OT Chiều (${start}-${end})`, val: `${ev.toFixed(1)} giờ` });
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
        isBackfill
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
                    if (r.calcMode === 'trip') {
                        tags += `<span class="htag" style="background:rgba(245,158,11,0.15); color:#f59e0b; border:1px solid rgba(245,158,11,0.3);">📋 ${r.customActivity}${r.deliveryProvince ? ': ' + r.deliveryProvince : ''}</span>`;
                    } else {
                        tags += `<span class="htag" style="background:rgba(99,102,241,0.15); color:#6366f1; border:1px solid rgba(99,102,241,0.3);">📋 ${r.customActivity}: ${r.totalHours.toFixed(1)}h</span>`;
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

            const rightDisplay = currentMobileHistoryType === 'ot'
                ? `<span class="history-total">${r.totalHours.toFixed(1)}h</span>`
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
        const userOffline = offlineRecords.filter(r => r.userId === currentUser.id && (r.createdMonth === month || (!r.createdMonth && r.date.startsWith(month))));

        const mergedRecords = [...userOffline];
        records.forEach(r => {
            if (!mergedRecords.some(o => o.id === r.id)) {
                mergedRecords.push(r);
            }
        });

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

        document.getElementById('stat-days').textContent = days;
        document.getElementById('stat-lunch').textContent = lunch.toFixed(1);
        document.getElementById('stat-evening').textContent = evening.toFixed(1);
        document.getElementById('stat-total').textContent = total.toFixed(1);
        
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

// ==================== INIT ====================
function initApp() {
    const isBrowser = window.location.protocol !== 'file:' && !window.AndroidBridge;
    if (isBrowser) {
        document.body.classList.add('is-web-browser');
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
            updatePreview();
        });
    }
    if (otProvinceInput) {
        otProvinceInput.addEventListener('input', updatePreview);
        otProvinceInput.addEventListener('change', updatePreview);
    }

    // Bind change/input listeners for Edit trip fields
    const editOtHasTrip = document.getElementById('edit-ot-has-trip');
    const editOtProvinceGroup = document.getElementById('edit-ot-province-group');
    const editOtProvinceInput = document.getElementById('edit-ot-province');
    if (editOtHasTrip) {
        editOtHasTrip.addEventListener('change', function() {
            const noteEl = document.getElementById('edit-ot-note');
            if (this.checked) {
                if (editOtProvinceGroup) editOtProvinceGroup.style.display = 'block';
                if (editOtProvinceInput) editOtProvinceInput.required = true;
                if (noteEl) {
                    noteEl.required = false;
                    noteEl.placeholder = "Mặc định: Đi xe tăng cường...";
                }
            } else {
                if (editOtProvinceGroup) editOtProvinceGroup.style.display = 'none';
                if (editOtProvinceInput) {
                    editOtProvinceInput.required = false;
                    editOtProvinceInput.value = '';
                }
                if (noteEl) {
                    noteEl.required = true;
                    noteEl.placeholder = "Lý do...";
                }
            }
        });
    }
    
    // Hiển thị trạng thái kết nối ban đầu
    if (API && (API.indexOf('onrender.com') !== -1 || API.indexOf('otmanager.id.vn') !== -1)) {
        updateConnectionStatus(false, API, true);
    } else {
        updateConnectionStatus(!!API, API);
    }
    updateSyncBanner();

    const btnManualSync = document.getElementById('btn-manual-sync');
    if (btnManualSync) {
        btnManualSync.addEventListener('click', async () => {
            if (!API) {
                showToast('Chưa kết nối Server! Vui lòng kiểm tra kết nối mạng hoặc đợi tự động kết nối.', 'error');
                return;
            }
            btnManualSync.disabled = true;
            const originalText = btnManualSync.textContent;
            btnManualSync.textContent = 'Đang đồng bộ...';
            try {
                await syncOfflineData();
            } finally {
                btnManualSync.disabled = false;
                btnManualSync.textContent = originalText;
            }
        });
    }
    
    // Nếu đã có IP lưu sẵn, kiểm tra kết nối
    if (API) {
        // Thử kết nối nhanh để kiểm tra server còn sống không
        // Dùng XMLHttpRequest thay cho fetch + AbortSignal.timeout (không hỗ trợ trên Android 5.0)
        try {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', API + '/api/server-info', true);
            // Nếu là Render URL, đặt timeout lớn hơn để cho phép server thức dậy từ trạng thái ngủ
            xhr.timeout = (API.indexOf('onrender.com') !== -1 || API.indexOf('otmanager.id.vn') !== -1) ? 60000 : 3000;
            xhr.onload = function() {
                if (xhr.status === 200) {
                    updateConnectionStatus(true, API);
                    syncOfflineData();
                    checkMobileUpdates();
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
        const loginTime = safeStorage.getItem('ot_login_time');
        if (saved && loginTime && !isSessionExpired(loginTime)) {
            try {
                currentUser = JSON.parse(saved);
                enterApp();
                return;
            } catch (e) {}
        } else {
            // Hết hạn hoặc chưa đăng nhập, dọn dẹp session
            safeStorage.removeItem('ot_mobile_user');
            safeStorage.removeItem('ot_login_time');
        }
        handleUnauthenticated();
    }, 1200);

    // Login forms
    const formLoginEmployee = document.getElementById('form-login-employee');
    if (formLoginEmployee) {
        formLoginEmployee.addEventListener('submit', handleEmployeeLogin);
    }
    const formLoginAdmin = document.getElementById('form-login-admin');
    if (formLoginAdmin) {
        formLoginAdmin.addEventListener('submit', handleAdminLogin);
    }

    // OT form
    document.getElementById('form-ot').addEventListener('submit', handleOTSubmit);
    document.getElementById('ot-lunch').addEventListener('change', updatePreview);
    document.getElementById('ot-lunch').addEventListener('input', updatePreview);
    document.getElementById('ot-start').addEventListener('change', updatePreview);
    document.getElementById('ot-start').addEventListener('input', updatePreview);
    document.getElementById('ot-end').addEventListener('change', updatePreview);
    document.getElementById('ot-end').addEventListener('input', updatePreview);

    const otBackfillCheckbox = document.getElementById('ot-backfill');
    if (otBackfillCheckbox) {
        otBackfillCheckbox.addEventListener('change', function() {
            const normalInputs = document.getElementById('ot-normal-inputs');
            const backfillGroup = document.getElementById('ot-backfill-hours-group');
            const customActGroup = document.getElementById('ot-custom-activity-group');

            const teamSettings = currentUser ? currentUser.teamSettings : null;
            const activities = (teamSettings && teamSettings.customActivities) ? teamSettings.customActivities : [];

            if (this.checked) {
                if (normalInputs) normalInputs.style.display = 'none';
                if (backfillGroup) backfillGroup.style.display = 'block';
                if (customActGroup) customActGroup.style.display = 'none';

                // Reset other OT choices
                const lunchEl = document.getElementById('ot-lunch');
                if (lunchEl) lunchEl.checked = false;
                const startEl = document.getElementById('ot-start');
                if (startEl) startEl.value = '16:30';
                const endEl = document.getElementById('ot-end');
                if (endEl) endEl.value = '16:30';

                // Uncheck custom activities checkboxes and clear their inputs
                document.querySelectorAll('.ot-custom-activity-checkbox').forEach(chk => {
                    chk.checked = false;
                    const detailGrp = document.getElementById(`ot-custom-activity-detail-group-${chk.dataset.actId}`);
                    if (detailGrp) {
                        detailGrp.style.display = 'none';
                        const input = detailGrp.querySelector('.ot-custom-activity-detail');
                        if (input) {
                            input.value = '';
                            input.required = false;
                        }
                    }
                });
            } else {
                if (normalInputs) normalInputs.style.display = 'block';
                if (backfillGroup) backfillGroup.style.display = 'none';
                
                // Restore custom visibility based on team activities settings
                if (activities.length > 0) {
                    if (customActGroup) customActGroup.style.display = 'block';
                }
            }
            updatePreview();
        });
    }
    const otBackfillHours = document.getElementById('ot-backfill-hours');
    if (otBackfillHours) otBackfillHours.addEventListener('input', updatePreview);

    const editOtBackfillCheckbox = document.getElementById('edit-ot-backfill');
    if (editOtBackfillCheckbox) {
        editOtBackfillCheckbox.addEventListener('change', function() {
            const normalInputs = document.getElementById('edit-ot-normal-inputs');
            const backfillGroup = document.getElementById('edit-ot-backfill-hours-group');
            const customActGroup = document.getElementById('edit-ot-custom-activity-group');

            const teamSettings = currentUser ? currentUser.teamSettings : null;
            const activities = (teamSettings && teamSettings.customActivities) ? teamSettings.customActivities : [];

            if (this.checked) {
                if (normalInputs) normalInputs.style.display = 'none';
                if (backfillGroup) backfillGroup.style.display = 'block';
                if (customActGroup) customActGroup.style.display = 'none';

                // Reset edit form other OT choices
                const lunchEl = document.getElementById('edit-ot-lunch');
                if (lunchEl) lunchEl.checked = false;
                const startEl = document.getElementById('edit-ot-start');
                if (startEl) startEl.value = '16:30';
                const endEl = document.getElementById('edit-ot-end');
                if (endEl) endEl.value = '16:30';

                // Uncheck custom activities checkboxes and clear their inputs
                document.querySelectorAll('.edit-ot-custom-activity-checkbox').forEach(chk => {
                    chk.checked = false;
                    const detailGrp = document.getElementById(`edit-ot-custom-activity-detail-group-${chk.dataset.actId}`);
                    if (detailGrp) {
                        detailGrp.style.display = 'none';
                        const input = detailGrp.querySelector('.edit-ot-custom-activity-detail');
                        if (input) {
                            input.value = '';
                            input.required = false;
                        }
                    }
                });
            } else {
                if (normalInputs) normalInputs.style.display = 'block';
                if (backfillGroup) backfillGroup.style.display = 'none';
                
                // Restore custom visibility based on team settings
                if (activities.length > 0) {
                    if (customActGroup) customActGroup.style.display = 'block';
                }
            }
        });
    }

    document.getElementById('ot-start').addEventListener('change', () => {
        const startVal = document.getElementById('ot-start').value;
        const endVal = document.getElementById('ot-end').value;
        if (startVal && endVal) {
            const s = timeToMinutes(startVal);
            const e = timeToMinutes(endVal);
            if (e <= s) {
                document.getElementById('ot-end').value = startVal;
                updatePreview();
            }
        }
    });

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

    // Segmented history control listeners
    const btnMobileHistoryOt = document.getElementById('btn-mobile-history-ot');
    const btnMobileHistoryTrips = document.getElementById('btn-mobile-history-trips');
    if (btnMobileHistoryOt && btnMobileHistoryTrips) {
        btnMobileHistoryOt.addEventListener('click', () => {
            currentMobileHistoryType = 'ot';
            btnMobileHistoryOt.style.background = 'var(--green, #0dd98b)';
            btnMobileHistoryOt.style.color = '#020805';
            btnMobileHistoryTrips.style.background = 'transparent';
            btnMobileHistoryTrips.style.color = '#94a3b8';
            loadHistory();
        });
        btnMobileHistoryTrips.addEventListener('click', () => {
            currentMobileHistoryType = 'trips';
            btnMobileHistoryTrips.style.background = 'var(--green, #0dd98b)';
            btnMobileHistoryTrips.style.color = '#020805';
            btnMobileHistoryOt.style.background = 'transparent';
            btnMobileHistoryOt.style.color = '#94a3b8';
            loadHistory();
        });
    }

    // Navigation
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // Logout
    document.getElementById('btn-logout').addEventListener('click', logout);
    document.getElementById('btn-logout-2').addEventListener('click', logout);

    // Unlink device
    const btnUnlinkDevice = document.getElementById('btn-unlink-device');
    if (btnUnlinkDevice) {
        btnUnlinkDevice.addEventListener('click', async () => {
            const ok = await showConfirm('Bạn có chắc chắn muốn xin huỷ liên kết thiết bị này khỏi tài khoản không? Yêu cầu cần được Quản trị viên duyệt.');
            if (!ok) return;
            
            if (!currentUser || !currentUser.id) {
                showToast('Không tìm thấy thông tin nhân viên!', 'error');
                return;
            }
            
            showToast('Đang gửi yêu cầu huỷ liên kết...', 'info');
            try {
                await api('/api/users/' + currentUser.id, 'PUT', { pendingUnlink: true });
                showToast('Gửi yêu cầu huỷ liên kết thành công, vui lòng chờ Quản lý duyệt!', 'success');
                refreshCurrentUserInfo();
            } catch (err) {
                showToast(err.message || 'Lỗi gửi yêu cầu huỷ liên kết!', 'error');
            }
        });
    }

    // Kéo để làm mới (Pull to refresh)
    let touchStart = 0;
    let isPulling = false;
    let startedAtTop = false;
    const ptr = document.getElementById('pull-to-refresh');
    const scrollContainer = document.querySelector('.mobile-main');

    if (scrollContainer && ptr) {
        // Kiểm tra xem vị trí cuộn có thực sự ở đỉnh trang (bao gồm cả container cuộn phụ của lịch sử)
        const checkAtTop = () => {
            if (scrollContainer.scrollTop > 0) return false;
            
            const activeTab = document.querySelector('.tab-content.active');
            if (activeTab && activeTab.id === 'tab-history') {
                const historyList = document.getElementById('history-list');
                if (historyList && historyList.scrollTop > 0) {
                    return false;
                }
            }
            return true;
        };

        scrollContainer.addEventListener('touchstart', e => {
            startedAtTop = checkAtTop();
            if (startedAtTop) {
                touchStart = e.touches[0].clientY;
            }
            isPulling = false;
        }, { passive: true });

        scrollContainer.addEventListener('touchmove', e => {
            if (!startedAtTop) return;
            const currentY = e.touches[0].clientY;
            const dist = currentY - touchStart;
            
            // Đặt ngưỡng dist > 30 để tránh vô tình kích hoạt khi vuốt chạm nhẹ
            if (checkAtTop() && dist > 30) {
                isPulling = true;
            }
            
            if (!isPulling) return;
            
            if (dist > 0) {
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

    // Tự động kiểm tra và đồng bộ mỗi 10 giây
    setInterval(checkConnection, 10000);

    // Cập nhật phiên bản hiển thị
    updateVersionDisplay();

    // Sự kiện click nút kiểm tra cập nhật thủ công
    const btnCheckUpdateMobile = document.getElementById('btn-check-update-mobile');
    if (btnCheckUpdateMobile) {
        btnCheckUpdateMobile.addEventListener('click', () => {
            checkMobileUpdates(true);
        });
    }

    // Bắt đầu kiểm tra cập nhật định kỳ mỗi 30 phút
    startUpdateCheckInterval();

    // Cấu hình Tabs Đăng nhập (Nhân viên / Quản trị) trên màn hình Login
    const tabEmployeeBtn = document.getElementById('btn-tab-employee');
    const tabAdminBtn = document.getElementById('btn-tab-admin');

    if (tabEmployeeBtn && tabAdminBtn && formLoginEmployee && formLoginAdmin) {
        tabEmployeeBtn.addEventListener('click', () => {
            tabEmployeeBtn.classList.add('active');
            tabAdminBtn.classList.remove('active');
            formLoginEmployee.classList.add('active');
            formLoginAdmin.classList.remove('active');
            formLoginEmployee.style.display = 'block';
            formLoginAdmin.style.display = 'none';
            const errEl = document.getElementById('login-error-emp');
            if (errEl) errEl.textContent = '';
        });

        tabAdminBtn.addEventListener('click', () => {
            tabAdminBtn.classList.add('active');
            tabEmployeeBtn.classList.remove('active');
            formLoginAdmin.classList.add('active');
            formLoginEmployee.classList.remove('active');
            formLoginAdmin.style.display = 'block';
            formLoginEmployee.style.display = 'none';
            const errEl = document.getElementById('login-error-admin');
            if (errEl) errEl.textContent = '';
        });
    }

    // Thiết lập link tải động và mã QR cho mục Tải ứng dụng
    const host = window.location.origin;
    const isGitHubPages = window.location.hostname.includes('github.io');
    const isMobileFolder = window.location.pathname.includes('/mobile');

    // Link APK: Trỏ thẳng tới server Render để tải trực tiếp từ đĩa cục bộ, tránh lỗi 404 trên repo GitHub private
    const defaultApk = isMobileFolder ? 'OT-Manager-mobile.apk' : 'mobile/OT-Manager-mobile.apk';
    const apkUrl = API ? (API + '/OT-Manager-mobile.apk') : defaultApk;

    const apkBtnLanding = document.getElementById('apk-download-btn-landing');
    if (apkBtnLanding) {
        apkBtnLanding.setAttribute('data-url', apkUrl);
        apkBtnLanding.style.cursor = 'pointer';
        if (!apkBtnLanding.dataset.listenerAdded) {
            apkBtnLanding.dataset.listenerAdded = 'true';
            apkBtnLanding.addEventListener('click', function(e) {
                e.preventDefault();
                const downloadUrl = this.getAttribute('data-url');
                if (downloadUrl) window.location.href = downloadUrl;
            });
        }
    }

    const apkQrLanding = document.getElementById('apk-qr-code-landing');
    if (apkQrLanding) {
        const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&color=0f0f1a&data=${encodeURIComponent(apkUrl)}`;
        apkQrLanding.src = qrApiUrl;
    }

    const desktopBtnLanding = document.getElementById('desktop-download-btn-landing');
    if (desktopBtnLanding) {
        desktopBtnLanding.style.cursor = 'pointer';
        if (!desktopBtnLanding.dataset.listenerAdded) {
            desktopBtnLanding.dataset.listenerAdded = 'true';
            desktopBtnLanding.addEventListener('click', function(e) {
                e.preventDefault();
                const downloadUrl = this.getAttribute('data-url');
                if (downloadUrl) window.open(downloadUrl, '_blank');
            });
        }
        fetch((API || host) + '/api/version')
            .then(res => res.json())
            .then(data => {
                if (data.desktopDownloadUrl) {
                    desktopBtnLanding.setAttribute('data-url', data.desktopDownloadUrl);
                }
            })
            .catch(err => {
                console.error('Không thể lấy link EXE từ server:', err);
            });
    }

    const iosBtnLanding = document.getElementById('ios-download-btn-landing');
    if (iosBtnLanding) {
        iosBtnLanding.style.cursor = 'pointer';
        if (!iosBtnLanding.dataset.listenerAdded) {
            iosBtnLanding.dataset.listenerAdded = 'true';
            iosBtnLanding.addEventListener('click', function(e) {
                e.preventDefault();
                window.open('https://otmanager.id.vn/mobile/', '_blank');
            });
        }
    }
    
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
function checkConnection() {
    // Kiểm tra hết hạn phiên đăng nhập (sau 5h sáng hôm sau)
    const loginTime = safeStorage.getItem('ot_login_time');
    if (currentUser && loginTime && isSessionExpired(loginTime)) {
        currentUser = null;
        safeStorage.removeItem('ot_mobile_user');
        safeStorage.removeItem('ot_login_time');
        handleUnauthenticated();
        showToast('Phiên đăng nhập đã hết hạn (sau 5h sáng), vui lòng đăng nhập lại!', 'error');
        return;
    }

    if (!API) return;
    var xhr = new XMLHttpRequest();
    xhr.open('GET', API + '/api/server-info', true);
    xhr.timeout = (API.indexOf('onrender.com') !== -1 || API.indexOf('otmanager.id.vn') !== -1) ? 60000 : 3000;
    xhr.onload = function() {
        if (xhr.status === 200) {
            updateConnectionStatus(true, API);
            syncOfflineData();
            refreshCurrentUserInfo();
        } else {
            updateConnectionStatus(false, '');
        }
    };
    xhr.onerror = function() {
        updateConnectionStatus(false, '');
    };
    xhr.ontimeout = function() {
        updateConnectionStatus(false, '');
    };
    xhr.send();
}

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

// Register Service Worker for PWA and handle auto-update detection
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(reg => {
        reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            if (newWorker) {
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        showToast('Đã tải bản cập nhật mới trên Web. Đang tự động tải lại trang...', 'info');
                        setTimeout(() => {
                            window.location.reload();
                        }, 1500);
                    }
                });
            }
        });
    }).catch(() => {});
}

// ==================== EDIT DYNAMIC OVERLAY ====================
let activeEditRecordId = null;
async function editRecordDialog(id) {
    console.log('[editRecordDialog] Called with id:', id);
    console.log('[editRecordDialog] historyRecordsList length:', historyRecordsList.length);
    console.log('[editRecordDialog] historyRecordsList:', JSON.stringify(historyRecordsList));
    activeEditRecordId = id;
    try {
        console.log('[editRecordDialog] Step 1: Finding record');
        let record = historyRecordsList.find(r => r.id === id);
        console.log('[editRecordDialog] Step 2: Record found:', !!record);
        if (!record) {
            if (id.startsWith('offline_')) {
                const offlineRecords = JSON.parse(safeStorage.getItem('ot_offline_records') || '[]');
                record = offlineRecords.find(r => r.id === id);
            } else {
                const month = document.getElementById('filter-month') ? document.getElementById('filter-month').value : getCurrentMonth();
                const cached = JSON.parse(safeStorage.getItem(`ot_cached_records_${currentUser.id}_${month}`) || '[]');
                record = cached.find(r => r.id === id);
                
                if (!record && API) {
                    try {
                        const data = await api(`/api/records?userId=${currentUser.id}&month=${month}`);
                        record = data.records.find(r => r.id === id);
                    } catch (apiErr) {
                        console.error('[editRecordDialog] API fallback fetch error:', apiErr);
                    }
                }
            }
        }
        console.log('[editRecordDialog] Step 3: Record after fallback:', !!record);

        if (!record) return showToast('Không tìm thấy bản ghi', 'error');

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

        const recordMonth = record.date.substring(0, 7);
        if (closedMonths.includes(recordMonth)) {
            return showToast('Tháng này đã chốt OT, bạn không thể chỉnh sửa bản ghi!', 'error');
        }

        console.log('[editRecordDialog] Step 4: Getting elements');
        const elDate = document.getElementById('edit-ot-date');
        const elLunch = document.getElementById('edit-ot-lunch');
        const elStart = document.getElementById('edit-ot-start');
        const elEnd = document.getElementById('edit-ot-end');
        const elBackfill = document.getElementById('edit-ot-backfill');
        const elNormalInputs = document.getElementById('edit-ot-normal-inputs');
        const elBackfillGroup = document.getElementById('edit-ot-backfill-hours-group');
        const elBackfillHours = document.getElementById('edit-ot-backfill-hours');
        const elNote = document.getElementById('edit-ot-note');
        const elOverlay = document.getElementById('edit-overlay');



        console.log('[editRecordDialog] Step 5: Got elements:', { elDate: !!elDate, elLunch: !!elLunch, elStart: !!elStart, elEnd: !!elEnd, elOverlay: !!elOverlay });

        if (!elDate || !elLunch || !elStart || !elEnd || !elNote || !elOverlay) {
            console.error('DOM Elements for editing are missing!', { elDate, elLunch, elStart, elEnd, elNote, elOverlay });
            return showToast('Lỗi giao diện: Thiếu các thành phần giao diện sửa tăng ca.', 'error');
        }

        console.log('[editRecordDialog] Step 6: Setting element values');
        elDate.value = record.date;
        console.log('[editRecordDialog] Step 7: Date set');
        elDate.max = new Date().toISOString().split('T')[0];
        console.log('[editRecordDialog] Step 8: Date max set');
        elLunch.checked = record.hasLunchOT;
        console.log('[editRecordDialog] Step 9: Lunch set');
        elStart.value = record.otStart || '16:30';
        console.log('[editRecordDialog] Step 10: Start set');
        elEnd.value = record.otEnd || '16:30';
        console.log('[editRecordDialog] Step 11: End set');
        
        const isBackfill = record.isBackfill || (record.note && (record.note.includes('[BÙ THÁNG TRƯỚC]') || record.note.includes('[TĂNG THÁNG NÀY]')));
        if (elBackfill) elBackfill.checked = isBackfill;
        console.log('[editRecordDialog] Step 12: Backfill checkbox set');

        const isSunday = new Date(record.date + 'T00:00:00').getDay() === 0;
        const labelEl = elBackfillGroup ? elBackfillGroup.querySelector('label') : null;

        if (isSunday) {
            if (elNormalInputs) elNormalInputs.style.display = 'none';
            if (elBackfillGroup) elBackfillGroup.style.display = 'block';
            if (elBackfillHours) elBackfillHours.value = record.totalHours;
            if (labelEl) labelEl.textContent = 'Số giờ tăng ca Chủ Nhật';
            const backfillRow = elBackfill ? elBackfill.closest('.toggle-row') : null;
            if (backfillRow) backfillRow.style.display = 'none';
        } else {
            const backfillRow = elBackfill ? elBackfill.closest('.toggle-row') : null;
            if (backfillRow) backfillRow.style.display = 'block';
            if (labelEl) labelEl.textContent = 'Số giờ tăng ca cần bù';

            if (isBackfill) {
                if (elNormalInputs) elNormalInputs.style.display = 'none';
                if (elBackfillGroup) elBackfillGroup.style.display = 'block';
                if (elBackfillHours) elBackfillHours.value = record.totalHours;
            } else {
                if (elNormalInputs) elNormalInputs.style.display = 'block';
                if (elBackfillGroup) elBackfillGroup.style.display = 'none';
                if (elBackfillHours) elBackfillHours.value = '';
            }
        }
        console.log('[editRecordDialog] Step 13: Backfill layout set');

        // Handle delivery trip editing or custom activities
        const elEditCustomActGroup = document.getElementById('edit-ot-custom-activity-group');
        const teamSettings = currentUser ? currentUser.teamSettings : null;
        const activities = (teamSettings && teamSettings.customActivities) ? teamSettings.customActivities : [];

        if (activities.length > 0) {
            if (elEditCustomActGroup) elEditCustomActGroup.style.display = isBackfill ? 'none' : 'block';

            let activeActName = record.customActivity || '';
            if (!activeActName && record.deliveryProvince) {
                const firstTripAct = activities.find(a => a.calcMode === 'trip');
                activeActName = firstTripAct ? firstTripAct.name : (activities[0]?.name || '');
            }

            document.querySelectorAll('.edit-ot-custom-activity-checkbox').forEach(chk => {
                const isSelected = chk.dataset.actName === activeActName;
                chk.checked = isSelected;
                
                const group = document.getElementById(`edit-ot-custom-activity-detail-group-${chk.dataset.actId}`);
                const input = group ? group.querySelector('.edit-ot-custom-activity-detail') : null;
                if (group) {
                    group.style.display = isSelected ? 'block' : 'none';
                    if (input) {
                        input.required = isSelected;
                        if (isSelected) {
                            input.value = record.deliveryProvince || '';
                        } else {
                            input.value = '';
                        }
                    }
                }
            });
        } else {
            if (elEditCustomActGroup) elEditCustomActGroup.style.display = 'none';
        }

        elNote.value = record.note ? record.note.replace('[BÙ THÁNG TRƯỚC] ', '').replace('[BÙ THÁNG TRƯỚC]', '').replace('[TĂNG THÁNG NÀY] ', '').replace('[TĂNG THÁNG NÀY]', '').trim() : '';
        console.log('[editRecordDialog] Step 14: Note set');

        // Auto sync edit ot end when edit ot start changes
        if (!elStart.dataset.listenerBound) {
            elStart.dataset.listenerBound = 'true';
            elStart.addEventListener('change', () => {
                const startVal = elStart.value;
                const endVal = elEnd.value;
                if (startVal && endVal) {
                    const s = timeToMinutes(startVal);
                    const e = timeToMinutes(endVal);
                    if (e <= s) {
                        elEnd.value = startVal;
                    }
                }
            });
        }
        if (!elDate.dataset.listenerBound) {
            elDate.dataset.listenerBound = 'true';
            elDate.addEventListener('change', handleEditDateChange);
            elDate.addEventListener('input', handleEditDateChange);
        }
        console.log('[editRecordDialog] Step 15: Listener set');

        console.log('[editRecordDialog] Adding active class to overlay:', elOverlay);
        elOverlay.classList.add('active');
        console.log('[editRecordDialog] ClassList after adding active:', elOverlay.className);
    } catch (err) {
        console.error('[editRecordDialog] ERROR:', err);
        showToast('Lỗi tải dữ liệu: ' + err.message, 'error');
    }
}

async function handleEditOTSubmit(e) {
    e.preventDefault();
    if (!currentUser || !activeEditRecordId) return;

    const elDate = document.getElementById('edit-ot-date');
    const elLunch = document.getElementById('edit-ot-lunch');
    const elStart = document.getElementById('edit-ot-start');
    const elEnd = document.getElementById('edit-ot-end');
    const elBackfill = document.getElementById('edit-ot-backfill');
    const elBackfillHours = document.getElementById('edit-ot-backfill-hours');
    const elNote = document.getElementById('edit-ot-note');
    const elOverlay = document.getElementById('edit-overlay');



    if (!elDate || !elLunch || !elStart || !elEnd || !elNote || !elOverlay) {
        return showToast('Lỗi giao diện: Không tìm thấy các trường thông tin chỉnh sửa.', 'error');
    }

    const date = elDate.value;
    if (!date) {
        showToast('Vui lòng chọn ngày!', 'error');
        return;
    }
    const isBackfill = elBackfill ? elBackfill.checked : false;

    const todayStr = new Date(Date.now() + 7 * 3600000).toISOString().split('T')[0];
    const currentMonth = todayStr.substring(0, 7);
    const selectedMonth = date.substring(0, 7);
    if (selectedMonth < currentMonth && !isBackfill) {
        showToast('Để chọn ngày thuộc tháng cũ, vui lòng tích chọn "Bù tăng ca"!', 'error');
        return;
    }

    const lunch = elLunch.checked;
    const start = elStart.value;
    const end = elEnd.value;
    let note = elNote.value.trim();

    // Custom activity
    let customActivity = '';
    let calcMode = '';
    let customDetail = '';
    
    const teamSettings = currentUser ? currentUser.teamSettings : null;
    const activities = (teamSettings && teamSettings.customActivities) ? teamSettings.customActivities : [];
    
    if (activities.length > 0) {
        const checkedChk = document.querySelector('.edit-ot-custom-activity-checkbox:checked');
        if (checkedChk) {
            customActivity = checkedChk.dataset.actName;
            calcMode = checkedChk.dataset.actMode;
            const input = document.querySelector(`.edit-ot-custom-activity-detail[data-act-id="${checkedChk.dataset.actId}"]`);
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
        const hoursVal = elBackfillHours ? parseFloat(elBackfillHours.value) || 0 : 0;
        if (hoursVal <= 0) {
            showToast(isSunday ? 'Vui lòng nhập số giờ tăng ca Chủ Nhật hợp lệ!' : 'Vui lòng nhập số giờ bù hợp lệ!', 'error');
            return;
        }
        totalHours = hoursVal;
        eveningOTHours = hoursVal;
    } else {
        eveningOTHours = calcEveningOT(start, end);
        totalHours = (lunch ? OT_LUNCH_HOURS : 0) + eveningOTHours;
 
        if (totalHours <= 0 && !hasTrip) {
            showToast('Vui lòng chọn ít nhất một loại OT hoặc hoạt động ngoài giờ!', 'error');
            return;
        }
    }
 
    const createdMonth = isBackfill ? getCurrentMonth() : date.substring(0, 7);
 
    const updatedData = {
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
        isBackfill
    };

    if (API && !activeEditRecordId.startsWith('offline_')) {
        try {
            await api(`/api/records/${activeEditRecordId}`, 'PUT', updatedData);
            showToast('Đã cập nhật tăng ca thành công!');
            elOverlay.classList.remove('active');
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
    elOverlay.classList.remove('active');
    loadHistory();
    loadProfileStats();
    updateSyncBanner();
}

// ==================== AUTO UPDATE FOR MOBILE APP ====================

function checkMobileUpdates(isManual) {
    const isMobileApp = window.location.protocol === 'file:' || window.AndroidBridge;
    if (!API) {
        if (isManual) showToast('Chưa kết nối Server!', 'error');
        return;
    }
    if (isManual) {
        showToast('Đang kiểm tra cập nhật...', 'info');
    }
    try {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', API + '/api/version?t=' + Date.now(), true);
        xhr.timeout = (API.indexOf('onrender.com') !== -1 || API.indexOf('otmanager.id.vn') !== -1) ? 60000 : 30000;
        xhr.onload = function () {
            if (xhr.status === 200) {
                try {
                    var info = JSON.parse(xhr.responseText);
                    if (info.version && compareMobileVersions(MOBILE_VERSION, info.version) < 0) {
                        showMobileUpdateDialog(info.version, info.forceUpdate || false, info.changelog || '', isMobileApp);
                    } else {
                        updateVersionDisplay();
                        if (isManual) {
                            showToast('Bạn đang sử dụng phiên bản mới nhất: v' + MOBILE_VERSION, 'success');
                        }
                    }
                } catch (e) {
                    if (isManual) showToast('Lỗi kiểm tra cập nhật!', 'error');
                }
            } else {
                if (isManual) showToast('Lỗi kết nối Server!', 'error');
            }
        };
        xhr.onerror = function () {
            if (isManual) showToast('Lỗi kết nối Server!', 'error');
        };
        xhr.ontimeout = function () {
            if (isManual) showToast('Lỗi kiểm tra cập nhật (timeout)!', 'error');
        };
        xhr.send();
    } catch (e) {
        if (isManual) showToast('Lỗi kiểm tra cập nhật!', 'error');
    }
}

function compareMobileVersions(v1, v2) {
    if (!v1 || !v2) return 0;
    var str1 = String(v1).replace(/^[vV]/, '');
    var str2 = String(v2).replace(/^[vV]/, '');
    var parts1 = str1.split('.').map(Number);
    var parts2 = str2.split('.').map(Number);
    for (var i = 0; i < Math.max(parts1.length, parts2.length); i++) {
        var p1 = parts1[i] || 0;
        var p2 = parts2[i] || 0;
        if (p1 < p2) return -1;
        if (p1 > p2) return 1;
    }
    return 0;
}

function updateVersionDisplay() {
    var el = document.getElementById('app-version-display');
    if (el) {
        el.textContent = 'v' + MOBILE_VERSION;
        el.style.color = '#10b981';
    }
    var elLogin = document.querySelector('.login-ver-val');
    if (elLogin) {
        elLogin.textContent = 'v' + MOBILE_VERSION;
    }
}

function showMobileUpdateDialog(newVer, forceUpdate, changelog, isMobileApp) {
    if (document.getElementById('mobile-update-overlay')) return;

    var changelogHtml = '';
    if (changelog) {
        changelogHtml = '<div style="text-align:left; background:rgba(255,255,255,0.05); border-radius:8px; padding:10px 12px; margin-bottom:14px; font-size:0.8rem; color:var(--text-muted); max-height:120px; overflow-y:auto; line-height:1.6;">' +
            '<div style="font-weight:600; color:var(--text); margin-bottom:4px;">📋 Có gì mới:</div>' +
            changelog.replace(/\n/g, '<br>') +
            '</div>';
    }

    var overlay = document.createElement('div');
    overlay.id = 'mobile-update-overlay';
    overlay.className = 'confirm-overlay active';
    overlay.style.zIndex = '9999';
    overlay.innerHTML =
        '<div class="confirm-dialog" style="max-width: 90%; width: 340px; text-align: center;">' +
        '<div style="font-size: 2.5rem; margin-bottom: 8px;">🚀</div>' +
        '<h3 style="margin-top:0; color: #10b981; font-size:1.15rem;">Cập nhật ứng dụng</h3>' +
        '<div style="display:flex; justify-content:center; gap:8px; margin-bottom:12px;">' +
        '<span style="background:rgba(239,68,68,0.15); color:#ef4444; padding:3px 10px; border-radius:20px; font-size:0.75rem; border:1px solid rgba(239,68,68,0.3);">v' + MOBILE_VERSION + '</span>' +
        '<span style="color:var(--text-muted); font-size:0.85rem;">→</span>' +
        '<span style="background:rgba(16,185,129,0.15); color:#10b981; padding:3px 10px; border-radius:20px; font-size:0.75rem; border:1px solid rgba(16,185,129,0.3);">v' + newVer + '</span>' +
        '</div>' +
        changelogHtml +
        '<p style="color: var(--text-muted); font-size:0.82rem; margin-bottom: 16px; line-height: 1.5;">' +
        (forceUpdate
            ? 'Bản cập nhật này là <strong style="color:#ef4444;">bắt buộc</strong>. Vui lòng cập nhật để tiếp tục sử dụng.'
            : 'Vui lòng cập nhật để có trải nghiệm tốt nhất.') +
        '</p>' +
        '<div class="confirm-actions" style="display:flex; gap:10px; justify-content:center;">' +
        (forceUpdate
            ? ''
            : '<button class="btn btn-ghost" id="mobile-update-later" style="padding: 10px 16px; font-size:0.85rem; border-radius:8px;">Để sau</button>') +
        '<button class="btn btn-primary" id="mobile-update-now" style="padding: 10px 20px; font-size:0.85rem; border-radius:8px; background: #10b981; flex:1;">' +
        (isMobileApp ? '⬇️ Tải về ngay' : '🔄 Cập nhật ngay') +
        '</button>' +
        '</div>' +
        '</div>';
    document.body.appendChild(overlay);

    var laterBtn = document.getElementById('mobile-update-later');
    if (laterBtn) {
        laterBtn.addEventListener('click', function () {
            overlay.remove();
            // Ghi nhớ đã bỏ qua, sẽ nhắc lại sau 30 phút
            safeStorage.setItem('ot_update_skipped_at', Date.now().toString());
        });
    }

    document.getElementById('mobile-update-now').addEventListener('click', function () {
        overlay.remove();
        if (isMobileApp) {
            window.location.href = API + '/OT-Manager-mobile.apk';
        } else {
            // WebClip / PWA: Unregister service workers and reload to clear cache and fetch new assets
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.getRegistrations().then(function(registrations) {
                    for (var i = 0; i < registrations.length; i++) {
                        registrations[i].unregister();
                    }
                    window.location.reload(true);
                }).catch(function() {
                    window.location.reload(true);
                });
            } else {
                window.location.reload(true);
            }
        }
    });
}

// Kiểm tra cập nhật định kỳ mỗi 30 phút
function startUpdateCheckInterval() {
    if (updateCheckInterval) clearInterval(updateCheckInterval);
    updateCheckInterval = setInterval(function () {
        // Chỉ kiểm tra nếu đã qua 30 phút kể từ lần bỏ qua
        var skippedAt = parseInt(safeStorage.getItem('ot_update_skipped_at') || '0');
        if (Date.now() - skippedAt > 30 * 60 * 1000) {
            checkMobileUpdates();
        }
    }, 30 * 60 * 1000); // 30 phút
}

// Temporary debug auto-mock login for verification
if (window.location.search.includes('mock=true')) {
    safeStorage.setItem('ot_cached_usernames', JSON.stringify([{id: 'emp_test', username: 'testemp', fullname: 'Nguyễn Văn Test'}]));
    setTimeout(() => {
        const input = document.getElementById('login-user');
        if (input) {
            input.value = 'testemp';
            // Trigger login
            const btn = document.getElementById('btn-login-emp');
            if (btn) btn.click();
        }
    }, 1500);
}

// Expose functions globally to window for onclick handlers to function reliably in all environments
window.editRecordDialog = editRecordDialog;
window.deleteRecord = deleteRecord;

// ==================== WEB PUSH & FIREBASE FCM SUBSCRIPTION ====================
async function checkAndRegisterPushNotifications() {
    if (window.location.protocol === 'file:') {
        // Bỏ qua nếu chạy offline dạng file:// trên Cordova
        return;
    }

    let fcmToken = null;
    let subscription = null;

    // 1. Nếu là Native Android app, lấy trực tiếp FCM Token từ AndroidBridge
    if (window.AndroidBridge && typeof window.AndroidBridge.getFcmToken === 'function') {
        try {
            fcmToken = window.AndroidBridge.getFcmToken();
            console.log('[Native FCM] Lấy token từ AndroidBridge:', fcmToken);
        } catch (nativeErr) {
            console.error('[Native FCM] Lỗi lấy token từ AndroidBridge:', nativeErr);
        }
    }

    // 2. Nếu không phải Android app hoặc lấy từ AndroidBridge thất bại, thử Web Push & Firebase Web SDK
    if (!fcmToken) {
        if (!('serviceWorker' in navigator)) {
            console.warn('[Notification] Trình duyệt không hỗ trợ Service Worker.');
            return;
        }

        try {
            const registration = await navigator.serviceWorker.ready;
            
            // Chỉ yêu cầu quyền Notification nếu trình duyệt có hỗ trợ đối tượng Notification
            if (typeof Notification !== 'undefined') {
                let permission = Notification.permission;
                if (permission === 'default') {
                    permission = await Notification.requestPermission();
                }
                
                if (permission !== 'granted') {
                    console.warn('[Notification] Quyền thông báo bị từ chối.');
                    return;
                }
            }

            // Đăng ký nhận token Firebase FCM bằng Web SDK
            try {
                if (typeof firebase !== 'undefined') {
                    if (firebase.apps.length === 0) {
                        firebase.initializeApp({
                            apiKey: "AIzaSyD8W_NVkhL-7uSfR6aNigLDHXtLN7fO6cI",
                            authDomain: "ot-manager-4a0eb.firebaseapp.com",
                            projectId: "ot-manager-4a0eb",
                            storageBucket: "ot-manager-4a0eb.firebasestorage.app",
                            messagingSenderId: "75783850598",
                            appId: "1:75783850598:web:274a61bee43b65c2343ba7"
                        });
                    }
                    const messaging = firebase.messaging();
                    messaging.useServiceWorker(registration);
                    
                    fcmToken = await messaging.getToken({
                        vapidKey: 'BARnKZdR_my8mhr8jAQN_5hli_kiCCkOPVFJi06ZLvN2TJ5DMKskyaaS0fY_d_wVcIQe73rs8GY57NDqVdUtg5A'
                    });
                    console.log('[FCM Web] Lấy token thành công:', fcmToken);
                }
            } catch (fcmErr) {
                console.warn('[FCM Web] Không khởi tạo được FCM hoặc lỗi lấy token:', fcmErr.message);
            }

            // Thử đăng ký Web Push thuần nếu không lấy được FCM token bằng Web SDK
            if (!fcmToken && typeof Notification !== 'undefined') {
                if ('PushManager' in window) {
                    try {
                        const res = await api('/api/notifications/vapid-public-key');
                        if (res && res.publicKey) {
                            const subscribeOptions = {
                                userVisibleOnly: true,
                                applicationServerKey: urlB64ToUint8Array(res.publicKey)
                            };
                            
                            subscription = await registration.pushManager.getSubscription();
                            if (subscription) {
                                await subscription.unsubscribe();
                            }
                            
                            subscription = await registration.pushManager.subscribe(subscribeOptions);
                            console.log('[Web Push] Đăng ký Subscription thành công:', subscription);
                        }
                    } catch (wpErr) {
                        console.warn('[Web Push] Lỗi đăng ký:', wpErr.message);
                    }
                }
            }
        } catch (err) {
            console.error('[Notification] Lỗi tiến trình đăng ký thông báo:', err);
        }
    }

    // 3. Gửi các thông tin đăng ký lên Server để lưu lại
    if (subscription || fcmToken) {
        try {
            await api('/api/notifications/subscribe', 'POST', { subscription, fcmToken });
            console.log('[Notification] Đồng bộ thông tin thông báo lên Server thành công.');
        } catch (syncErr) {
            console.error('[Notification] Lỗi đồng bộ thông tin thông báo lên Server:', syncErr);
        }
    }
}

function urlB64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/\-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}
