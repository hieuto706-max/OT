/**
 * OT Manager - Landing Page & Login Portal JS
 * Quản lý tương tác hình nền cấu trúc 8D, chuyển tab, kết nối server, đăng nhập và điều hướng.
 */

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

function getMostRecent5AM() {
    const now = new Date();
    const today5AM = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 5, 0, 0, 0);
    if (now.getTime() < today5AM.getTime()) {
        today5AM.setDate(today5AM.getDate() - 1);
    }
    return today5AM.getTime();
}

function getSessionCycleDateStr() {
    const shifted = new Date(Date.now() - 5 * 3600000);
    return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, '0')}-${String(shifted.getDate()).padStart(2, '0')}`;
}

function clearPortalAuthSession() {
    ['ot_mobile_user', 'ot_current_user', 'ot_login_time', 'ot_login_date', 'ot_auth_token', 'ot_session_temp', 'ot_require_email_setup'].forEach(k => {
        safeStorage.removeItem(k);
    });
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

function getDeviceId(username) {
    let id = safeStorage.getItem('ot_device_id') || '';
    const isWebBrowser = window.location.protocol !== 'file:';
    
    if (!isWebBrowser) {
        // Android App
        if (!id || id.startsWith('dev_')) {
            try {
                if (window.AndroidBridge && typeof window.AndroidBridge.getAndroidId === 'function') {
                    const nativeId = window.AndroidBridge.getAndroidId();
                    if (nativeId) {
                        id = 'android_' + nativeId;
                        safeStorage.setItem('ot_device_id', id);
                    }
                }
            } catch (err) {
                console.error("Lỗi lấy Android ID từ native bridge:", err);
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
    }
    return id;
}

function getFriendlyErrorMessage(err) {
    if (!err) return 'Đã xảy ra lỗi không xác định. Vui lòng thử lại!';
    const msg = (err.message || String(err)).toLowerCase();
    if (msg.includes('failed to fetch') || msg.includes('fetch failed') || msg.includes('network error') || msg.includes('networkerror') || msg.includes('load failed')) {
        return 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra lại kết nối mạng hoặc thử lại sau!';
    }
    return err.message || String(err);
}

// Device ID
let deviceId = getDeviceId();

// Server API URL
const isLocalWeb = window.location.protocol.startsWith('http') && !window.location.hostname.includes('github.io') && !window.location.hostname.includes('otmanager.id.vn');
let API = isLocalWeb ? window.location.origin : (safeStorage.getItem('ot_server_ip') || 'https://api.otmanager.id.vn');

// Nếu chạy trên HTTPS công cộng, không cho phép kết nối tới HTTP local IP (tránh lỗi Mixed Content hoặc Failed to fetch)
if (window.location.protocol === 'https:' && API.startsWith('http://')) {
    API = 'https://api.otmanager.id.vn';
}

// Clean deprecated IP addresses
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
                    // Giữ Service Worker đã đăng ký để duy trì hoạt động của bộ nhớ cache PWA cho tải trang nhanh
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

function getRedirectPrefix() {
    const needsOtPrefix = window.location.hostname.includes('github.io');
    return needsOtPrefix ? '/OT' : '';
}

// Simple toast notification helper
function showToast(msg, type = 'success') {
    let c = document.getElementById('toast-container');
    if (!c) {
        // Create if not exist
        c = document.createElement('div');
        c.id = 'toast-container';
        c.className = 'toast-container';
        document.body.appendChild(c);
    } else {
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
