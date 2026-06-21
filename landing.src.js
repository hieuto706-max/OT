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

// Tạo vân tay trình duyệt để giữ cố định Device ID trên Web ngay cả khi xóa lịch sử
function getBrowserFingerprint() {
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
        if (ua.indexOf("Firefox") !== -1) browser = "Firefox";
        else if (ua.indexOf("Edge") !== -1 || ua.indexOf("Edg") !== -1) browser = "Edge";
        else if (ua.indexOf("OPR") !== -1 || ua.indexOf("Opera") !== -1) browser = "Opera";
        else if (ua.indexOf("Chrome") !== -1) browser = "Chrome";
        else if (ua.indexOf("Safari") !== -1) browser = "Safari";

        // System specs
        const screenSpecs = Math.max(screen.width, screen.height) + 'x' + Math.min(screen.width, screen.height) + 'x' + screen.colorDepth;
        const tz = new Date().getTimezoneOffset();
        const cores = navigator.hardwareConcurrency || '';
        const platform = navigator.platform || '';
        const lang = navigator.language || '';

        const str = os + '_' + browser + '_' + screenSpecs + '_' + tz + '_' + platform + '_' + cores + '_' + lang;
        
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return 'web_' + Math.abs(hash).toString(36);
    } catch (e) {
        let hash = 0;
        const str = navigator.userAgent + (navigator.language || '') + screen.width + 'x' + screen.height;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return 'web_fallback_' + Math.abs(hash).toString(36);
    }
}

function getDeviceId() {
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
        // Web Browser
        if (!id) {
            id = getBrowserFingerprint();
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

// Device ID
let deviceId = getDeviceId();

// Server API URL
const isLocalWeb = window.location.protocol.startsWith('http') && !window.location.hostname.includes('github.io') && !window.location.hostname.includes('otmanager.id.vn');
let API = isLocalWeb ? window.location.origin : (safeStorage.getItem('ot_server_ip') || 'https://ot-manager-server-jbxd.onrender.com');

// Clean deprecated IP addresses
let savedIp = safeStorage.getItem('ot_server_ip');
if (!isLocalWeb && savedIp && (savedIp.includes('otms.onrender.com') || savedIp.includes('ot-manager-server.onrender.com') || savedIp.includes('otm.app.vn') || savedIp.includes('new-folder-6471') || savedIp.includes('lhr.life'))) {
    safeStorage.removeItem('ot_server_ip');
    API = 'https://ot-manager-server-jbxd.onrender.com';
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

        if (navigator.serviceWorker && typeof navigator.serviceWorker.register === 'function') {
            navigator.serviceWorker.register('nonexistent-sw-test.js').then((reg) => {
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
                    }, 2000); // 2 seconds timeout for slower mobile worker cold starts
                } catch (err) {
                    fallbackQuota();
                }
            } else {
                fallbackQuota();
            }
        }

        function fallbackQuota() {
            const ua = navigator.userAgent.toLowerCase();
            const isSafari = ua.includes('safari') && !ua.includes('chrome') && !ua.includes('android');
            if (isSafari) {
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
            } else {
                const isMobile = /android|iphone|ipad|ipod/i.test(ua);
                if (isMobile) {
                    resolve(false); // Mobile quota is highly dynamic and unreliable. Avoid blocking.
                } else if (navigator.storage && navigator.storage.estimate) {
                    navigator.storage.estimate().then((est) => {
                        resolve(est.quota < 120000000);
                    }).catch(() => resolve(false));
                } else {
                    resolve(false);
                }
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
    const c = document.getElementById('toast-container');
    if (!c) {
        // Create if not exist
        const div = document.createElement('div');
        div.id = 'toast-container';
        div.className = 'toast-container';
        document.body.appendChild(div);
    }
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.textContent = msg;
    document.getElementById('toast-container').appendChild(t);
    setTimeout(() => {
        t.style.opacity = '0';
        t.style.transform = 'translateY(-20px)';
        t.style.transition = '0.3s ease';
        setTimeout(() => t.remove(), 300);
    }, 2500);
}

// ==================== 8D DYNAMIC CANVAS BACKGROUND ====================
class Interactive8DBackground {
    constructor() {
        this.canvas = document.getElementById('canvas-bg');
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        this.particles = [];
        this.maxParticles = 65;
        this.mouse = { x: null, y: null, radius: 150 };
        this.angleX = 0.0008;
        this.angleY = 0.001;
        this.angleZ = 0.0005;
        this.perspective = 400;
        
        // Mouse spatial rotation variables
        this.mouseRotateX = 0;
        this.mouseRotateY = 0;
        
        // Morphing dimensions parameters
        this.targetPerspective = 400;
        this.targetSpeedMultiplier = 1.0;
        this.targetHueStart = 140; // Default: tech green
        this.targetHueRange = 30;
        
        this.currentSpeedMultiplier = 1.0;
        this.currentHueStart = 140;
        this.currentHueRange = 30;
        this.warpFactor = 0.0;
        
        // Ảo lồi 3D (3D Convex Bulge Spring Physics)
        this.currentBulge = 0.15;
        this.targetBulge = 0.15;
        this.bulgeVelocity = 0;
        this.currentScene = 'home';
        
        this.time = 0;
        this.resize();
        this.initParticles();
        this.bindEvents();
        this.animate();
    }
    
    morph(tabName) {
        this.currentScene = tabName;
        this.currentBulge = 2.4; // Cú huých thấu kính ảo lồi 3D nẩy mạnh
        this.bulgeVelocity = 0.15; // Vận tốc nẩy ban đầu
        if (tabName === 'home') {
            this.targetPerspective = 400;
            this.targetSpeedMultiplier = 1.0;
            this.targetHueStart = 140; // Green
            this.targetHueRange = 30;
        } else if (tabName === 'login') {
            this.targetPerspective = 220; // Warp zoom-in close
            this.targetSpeedMultiplier = 2.4; // Spin fast
            this.targetHueStart = 245; // Purple / Indigo
            this.targetHueRange = 40;
        } else if (tabName === 'download') {
            this.targetPerspective = 600; // Far space
            this.targetSpeedMultiplier = 0.65; // Slow drift
            this.targetHueStart = 185; // Cyan
            this.targetHueRange = 35;
        } else if (tabName === 'release') {
            this.targetPerspective = 450;
            this.targetSpeedMultiplier = 1.4;
            this.targetHueStart = 28; // Amber
            this.targetHueRange = 45;
        } else if (tabName === 'terms') {
            this.targetPerspective = 500;
            this.targetSpeedMultiplier = 0.35;
            this.targetHueStart = 205; // Slate Blue
            this.targetHueRange = 25;
        }
        this.warpFactor = 2.8; // Burst dynamic warp stretch
    }

    resize() {
        this.width = this.canvas.width = window.innerWidth;
        this.height = this.canvas.height = window.innerHeight;
    }

    initParticles() {
        this.particles = [];
        for (let i = 0; i < this.maxParticles; i++) {
            // Tọa độ hạt chính trong hệ 8 chiều: (x, y, z, w, p, q, u, v)
            this.particles.push({
                // 3D Space (X, Y, Z coordinates inside a bounds sphere)
                x: (Math.random() - 0.5) * 600,
                y: (Math.random() - 0.5) * 600,
                z: (Math.random() - 0.5) * 600,
                
                // 4D Space (W coordinate - size/breathing factor)
                w: Math.random() * Math.PI * 2,
                
                // 5D Space (P coordinate - rotation velocity oscillation)
                p: Math.random() * Math.PI * 2,
                
                // 6D Space (Q coordinate - individual HSL color offset phase)
                q: Math.random() * Math.PI * 2,
                
                // 7D Space (U coordinate - dynamic proximity connection threshold factor)
                u: Math.random() * Math.PI * 2,
                
                // 8D Space (V coordinate - sub-orbital satellite parameterization)
                v: {
                    phase: Math.random() * Math.PI * 2,
                    speed: 0.02 + Math.random() * 0.04,
                    radiusX: 12 + Math.random() * 18,
                    radiusY: 5 + Math.random() * 10,
                    inclination: (Math.random() - 0.5) * Math.PI / 4,
                    count: Math.random() > 0.4 ? 1 : 2
                },

                // Speed / Velocity
                vx: (Math.random() - 0.5) * 0.8,
                vy: (Math.random() - 0.5) * 0.8,
                vz: (Math.random() - 0.5) * 0.8,
                
                // Projected 2D coordinates
                px: 0,
                py: 0,
                visible: false,
                color: '',
                radius: 2,

                // Mouse force vector
                fx: 0,
                fy: 0
            });
        }
    }

    bindEvents() {
        window.addEventListener('resize', () => this.resize());
        window.addEventListener('mousemove', (e) => {
            this.mouse.x = e.clientX;
            this.mouse.y = e.clientY;
            
            // Subtle 3D rotation of canvas space relative to mouse offset from window center
            this.mouseRotateY = (e.clientX - this.width / 2) * 0.000003;
            this.mouseRotateX = (e.clientY - this.height / 2) * 0.000003;
        });
        window.addEventListener('mouseleave', () => {
            this.mouse.x = null;
            this.mouse.y = null;
            this.mouseRotateX = 0;
            this.mouseRotateY = 0;
        });
    }

    // Xoay quanh trục X
    rotateX(p, angle) {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const y = p.y * cos - p.z * sin;
        const z = p.y * sin + p.z * cos;
        p.y = y;
        p.z = z;
    }

    // Xoay quanh trục Y
    rotateY(p, angle) {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const x = p.x * cos - p.z * sin;
        const z = p.x * sin + p.z * cos;
        p.x = x;
        p.z = z;
    }

    // Xoay quanh trục Z
    rotateZ(p, angle) {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const x = p.x * cos - p.y * sin;
        const y = p.x * sin + p.y * cos;
        p.x = x;
        p.y = y;
    }

    // Hàm chiếu phối cảnh 3D sang 2D kết hợp thấu kính lồi 3D (ảo lồi thun đàn hồi)
    projectPoint(x, y, z) {
        const centerX = this.width / 2;
        const centerY = this.height / 2;
        
        // 1. Phối cảnh Z sâu
        const dist = 500;
        const denominator = Math.max(30, dist + z);
        let scale = this.perspective / denominator;
        let px = centerX + x * scale;
        let py = centerY + y * scale;
        
        // 2. Thấu kính ảo lồi 3D (Spherical Convex Bulge Distortion)
        const dx = px - centerX;
        const dy = py - centerY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const maxDist = Math.max(this.width, this.height) * 0.85;
        
        if (distance < maxDist && distance > 0) {
            const normDist = distance / maxDist;
            // Cú giật lồi thun: pop phồng ra ở tâm, dẹt ở biên
            const bulge = 1.0 + this.currentBulge * (1.0 - normDist * normDist);
            px = centerX + dx * bulge;
            py = centerY + dy * bulge;
            scale = scale * (1.0 + this.currentBulge * 0.35); // Tăng tỷ lệ zoom nhẹ ở tâm lồi
        }
        
        return {
            x: px,
            y: py,
            z: z,
            scale: scale
        };
    }

    // Vẽ Quả cầu Hologram 3D xoay tương tác phong cách VR/AR
    drawHologlobe() {
        const radius = Math.min(this.width, this.height) * 0.28;
        const centerX = this.width / 2;
        const centerY = this.height / 2;
        
        // Góc quay tự động cộng thêm độ nghiêng tương tác từ chuột
        const rotX = this.time * 0.18 + this.mouseRotateX * 60;
        const rotY = this.time * 0.28 + this.mouseRotateY * 60;
        const rotZ = this.time * 0.08;
        
        const cosX = Math.cos(rotX), sinX = Math.sin(rotX);
        const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
        const cosZ = Math.cos(rotZ), sinZ = Math.sin(rotZ);
        
        // Chiếu điểm 3D -> Phối cảnh 2D qua projectPoint chung
        const project = (x, y, z) => {
            // Xoay trục Y
            let x1 = x * cosY - z * sinY;
            let z1 = x * sinY + z * cosY;
            
            // Xoay trục X
            let y2 = y * cosX - z1 * sinX;
            let z2 = y * sinX + z1 * cosX;
            
            // Xoay trục Z
            let x3 = x1 * cosZ - y2 * sinZ;
            let y3 = x1 * sinZ + y2 * cosZ;
            
            return this.projectPoint(x3, y3, z2);
        };

        const hue = Math.floor(this.currentHueStart + Math.sin(this.time) * this.currentHueRange);
        const lineColor = `hsla(${hue}, 75%, 60%, 0.14)`;
        const nodeColor = `hsla(${hue}, 85%, 65%, 0.35)`;

        this.ctx.save();
        
        // 1. Vẽ các đường vĩ tuyến (Latitude lines)
        const latBands = 8;
        const lonSteps = 36;
        for (let i = 1; i < latBands; i++) {
            const theta = (i * Math.PI) / latBands;
            const sinTheta = Math.sin(theta);
            const cosTheta = Math.cos(theta);
            
            this.ctx.beginPath();
            for (let j = 0; j <= lonSteps; j++) {
                const phi = (j * 2 * Math.PI) / lonSteps;
                const x = radius * sinTheta * Math.cos(phi);
                const y = radius * cosTheta;
                const z = radius * sinTheta * Math.sin(phi);
                
                const pt = project(x, y, z);
                if (j === 0) {
                    this.ctx.moveTo(pt.x, pt.y);
                } else {
                    this.ctx.lineTo(pt.x, pt.y);
                }
            }
            this.ctx.strokeStyle = lineColor;
            this.ctx.lineWidth = 0.5;
            this.ctx.stroke();
        }
        
        // 2. Vẽ các đường kinh tuyến (Longitude lines)
        const lonBands = 12;
        const latSteps = 36;
        for (let i = 0; i < lonBands; i++) {
            const phi = (i * 2 * Math.PI) / lonBands;
            const cosPhi = Math.cos(phi);
            const sinPhi = Math.sin(phi);
            
            this.ctx.beginPath();
            for (let j = 0; j <= latSteps; j++) {
                const theta = (j * Math.PI) / latSteps;
                const x = radius * Math.sin(theta) * cosPhi;
                const y = radius * Math.cos(theta);
                const z = radius * Math.sin(theta) * sinPhi;
                
                const pt = project(x, y, z);
                if (j === 0) {
                    this.ctx.moveTo(pt.x, pt.y);
                } else {
                    this.ctx.lineTo(pt.x, pt.y);
                }
            }
            this.ctx.strokeStyle = lineColor;
            this.ctx.lineWidth = 0.5;
            this.ctx.stroke();
        }

        // 3. Vẽ đường xích đạo (Equator) đậm màu làm điểm nhấn
        this.ctx.beginPath();
        for (let j = 0; j <= lonSteps; j++) {
            const phi = (j * 2 * Math.PI) / lonSteps;
            const x = radius * Math.cos(phi);
            const y = 0;
            const z = radius * Math.sin(phi);
            const pt = project(x, y, z);
            if (j === 0) this.ctx.moveTo(pt.x, pt.y);
            else this.ctx.lineTo(pt.x, pt.y);
        }
        this.ctx.strokeStyle = `hsla(${hue}, 85%, 65%, 0.28)`;
        this.ctx.lineWidth = 0.9;
        this.ctx.stroke();

        // 4. Vẽ các nút giao điểm (Nodes) định vị ở bán cầu trước
        for (let i = 1; i < latBands; i += 2) {
            const theta = (i * Math.PI) / latBands;
            const sinTheta = Math.sin(theta);
            const cosTheta = Math.cos(theta);
            for (let j = 0; j < lonBands; j += 2) {
                const phi = (j * 2 * Math.PI) / lonBands;
                const x = radius * sinTheta * Math.cos(phi);
                const y = radius * cosTheta;
                const z = radius * sinTheta * Math.sin(phi);
                
                const pt = project(x, y, z);
                if (pt.z < 0) { // Bán cầu hướng về mắt
                    this.ctx.beginPath();
                    this.ctx.fillStyle = nodeColor;
                    this.ctx.arc(pt.x, pt.y, 1.8 * pt.scale, 0, Math.PI * 2);
                    this.ctx.fill();
                }
            }
        }

        // 5. Vẽ thêm 2 vòng quỹ đạo nghiêng bao quanh (Planetary Orbital HUD Rings)
        const drawOuterRing = (tiltAngle, spinSpeed, thickness, ringColor) => {
            const ringRadius = radius * 1.25;
            this.ctx.beginPath();
            for (let j = 0; j <= 72; j++) {
                const angle = (j * 2 * Math.PI) / 72 + this.time * spinSpeed;
                const rx = ringRadius * Math.cos(angle);
                const ry = 0;
                const rz = ringRadius * Math.sin(angle);
                
                // Nghiêng vòng tròn
                const cosT = Math.cos(tiltAngle), sinT = Math.sin(tiltAngle);
                const ry_t = ry * cosT - rz * sinT;
                const rz_t = ry * sinT + rz * cosT;
                
                const pt = project(rx, ry_t, rz_t);
                if (j === 0) this.ctx.moveTo(pt.x, pt.y);
                else this.ctx.lineTo(pt.x, pt.y);
            }
            this.ctx.strokeStyle = ringColor;
            this.ctx.lineWidth = thickness;
            this.ctx.stroke();
        };

        drawOuterRing(0.35, 0.3, 0.7, `hsla(${hue}, 80%, 60%, 0.16)`);
        drawOuterRing(-0.55, -0.2, 0.5, `hsla(${hue + 45}, 85%, 65%, 0.11)`);

        this.ctx.restore();
    }

    // Vẽ Đường hầm 3D Wireframe Wormhole Cylinder Tunnel (Tab Đăng nhập)
    drawTechTunnel() {
        const hue = Math.floor(this.currentHueStart + Math.sin(this.time) * this.currentHueRange);
        
        // Chiếu điểm ống 3D -> Phối cảnh 2D
        const project = (x, y, z) => {
            return this.projectPoint(x, y, z);
        };
        
        this.ctx.save();
        const numRings = 15;
        const pointsPerRing = 24;
        const tunnelRadius = Math.min(this.width, this.height) * 0.32;
        
        for (let r = 0; r < numRings; r++) {
            // Tọa độ Z sâu, trượt tiến về phía camera theo thời gian
            let z = -400 + (r * 800 / numRings) + (this.time * 240) % (800 / numRings);
            // Độ mờ giảm dần ở viền sâu và viền sát mắt
            const alpha = (1.0 - Math.abs(z) / 400) * 0.22;
            if (alpha <= 0) continue;
            
            const ringColor = `hsla(${hue}, 80%, 60%, ${alpha})`;
            this.ctx.beginPath();
            
            const ringRot = this.time * 0.22 + r * 0.08;
            for (let p = 0; p <= pointsPerRing; p++) {
                const angle = (p * 2 * Math.PI) / pointsPerRing + ringRot;
                const x = tunnelRadius * Math.cos(angle);
                const y = tunnelRadius * Math.sin(angle);
                
                const pt = project(x, y, z);
                if (p === 0) this.ctx.moveTo(pt.x, pt.y);
                else this.ctx.lineTo(pt.x, pt.y);
            }
            this.ctx.strokeStyle = ringColor;
            this.ctx.lineWidth = 0.65;
            this.ctx.stroke();
            
            // Vẽ các đường nối dọc liên kết tạo vách ống lưới 3D
            if (r < numRings - 1) {
                let nextZ = z + 800 / numRings;
                const nextRingRot = this.time * 0.22 + (r + 1) * 0.08;
                this.ctx.beginPath();
                this.ctx.strokeStyle = `hsla(${hue}, 80%, 60%, ${alpha * 0.28})`;
                for (let p = 0; p < pointsPerRing; p += 4) { // Nối cách 4 điểm
                    const angle = (p * 2 * Math.PI) / pointsPerRing + ringRot;
                    const nextAngle = (p * 2 * Math.PI) / pointsPerRing + nextRingRot;
                    
                    const x = tunnelRadius * Math.cos(angle);
                    const y = tunnelRadius * Math.sin(angle);
                    const pt = project(x, y, z);
                    
                    const nx = tunnelRadius * Math.cos(nextAngle);
                    const ny = tunnelRadius * Math.sin(nextAngle);
                    const npt = project(nx, ny, nextZ);
                    
                    this.ctx.moveTo(pt.x, pt.y);
                    this.ctx.lineTo(npt.x, npt.y);
                }
                this.ctx.stroke();
            }
        }
        this.ctx.restore();
    }

    // Vẽ đĩa quét Radar 3D nằm nghiêng (Tab Tải xuống)
    drawRadarGrid() {
        const hue = Math.floor(this.currentHueStart + Math.sin(this.time) * this.currentHueRange);
        
        // Chiếu điểm nằm nghiêng 3D
        const project = (x, y, z) => {
            const cosT = Math.cos(0.92), sinT = Math.sin(0.92); // Góc nghiêng đĩa
            const yRot = y * cosT - z * sinT;
            const zRot = y * sinT + z * cosT;
            return this.projectPoint(x, yRot, zRot);
        };
        
        this.ctx.save();
        const radius = Math.min(this.width, this.height) * 0.38;
        
        // Vẽ 5 vòng tròn đồng tâm mờ dần
        for (let i = 1; i <= 5; i++) {
            const r = radius * (i / 5);
            this.ctx.beginPath();
            const alpha = 0.24 - (i * 0.03);
            this.ctx.strokeStyle = `hsla(${hue}, 80%, 60%, ${alpha})`;
            this.ctx.lineWidth = i === 5 ? 1.4 : 0.6;
            
            for (let j = 0; j <= 60; j++) {
                const angle = (j * 2 * Math.PI) / 60;
                const pt = project(r * Math.cos(angle), 0, r * Math.sin(angle));
                if (j === 0) this.ctx.moveTo(pt.x, pt.y);
                else this.ctx.lineTo(pt.x, pt.y);
            }
            this.ctx.stroke();
        }
        
        // Vẽ 8 tia phân ranh giới vòng quét
        const numSpokes = 8;
        this.ctx.beginPath();
        this.ctx.strokeStyle = `hsla(${hue}, 80%, 60%, 0.12)`;
        for (let s = 0; s < numSpokes; s++) {
            const angle = (s * 2 * Math.PI) / numSpokes + this.time * 0.04;
            const ptInner = project(0, 0, 0);
            const ptOuter = project(radius * Math.cos(angle), 0, radius * Math.sin(angle));
            this.ctx.moveTo(ptInner.x, ptInner.y);
            this.ctx.lineTo(ptOuter.x, ptOuter.y);
        }
        this.ctx.stroke();
        
        // Tia quét radar sáng quét tròn
        const scanAngle = this.time * 0.75;
        const ptCenter = project(0, 0, 0);
        const ptRay = project(radius * Math.cos(scanAngle), 0, radius * Math.sin(scanAngle));
        this.ctx.beginPath();
        const grad = this.ctx.createLinearGradient(ptCenter.x, ptCenter.y, ptRay.x, ptRay.y);
        grad.addColorStop(0, `hsla(${hue}, 90%, 65%, 0.42)`);
        grad.addColorStop(1, `hsla(${hue}, 90%, 65%, 0.0)`);
        this.ctx.strokeStyle = grad;
        this.ctx.lineWidth = 2.4;
        this.ctx.moveTo(ptCenter.x, ptCenter.y);
        this.ctx.lineTo(ptRay.x, ptRay.y);
        this.ctx.stroke();
        
        this.ctx.restore();
    }

    // Vẽ lưới ma trận 3D thác nước số rơi lượn sóng (Tab Thông tin phát hành)
    drawDataMatrix() {
        const hue = Math.floor(this.currentHueStart + Math.sin(this.time) * this.currentHueRange);
        
        const project = (x, y, z) => {
            const cosT = Math.cos(0.4), sinT = Math.sin(0.4); // Nghiêng grid phẳng một chút
            const yRot = y * cosT - z * sinT;
            const zRot = y * sinT + z * cosT;
            return this.projectPoint(x, yRot, zRot);
        };
        
        this.ctx.save();
        const columns = 16;
        const rows = 12;
        const w = Math.min(this.width, this.height) * 0.72;
        const h = Math.min(this.width, this.height) * 0.58;
        
        for (let c = 0; c < columns; c++) {
            const pctC = (c / (columns - 1)) - 0.5;
            const x = pctC * w;
            for (let r = 0; r < rows; r++) {
                const pctR = (r / (rows - 1)) - 0.5;
                const y = pctR * h;
                
                // Trục Z nhấp nhô lượn sóng 3D
                const z = pctR * 180 + Math.sin(this.time * 2.2 + c * 0.8) * 35;
                const pt = project(x, y, z);
                
                // Tạo vệt ma trận nước rơi chạy từ trên xuống
                const fallPos = (this.time * 6.5 + c * 2.8) % (rows + 4);
                let opacity = 0.08;
                let size = 1.0;
                if (Math.abs(r - fallPos) < 1.8) {
                    opacity = 0.46;
                    size = 2.4;
                } else if (r < fallPos && fallPos - r < 5) {
                    opacity = 0.32 - (fallPos - r) * 0.06;
                    size = 1.6 - (fallPos - r) * 0.16;
                }
                
                this.ctx.fillStyle = `hsla(${hue}, 85%, 65%, ${opacity})`;
                this.ctx.fillRect(pt.x - size * pt.scale / 2, pt.y - size * pt.scale / 2, size * pt.scale, size * pt.scale);
            }
        }
        this.ctx.restore();
    }

    // Vẽ khiên bảo mật Torus xoay 3D (Tab Điều khoản & Bảo mật)
    drawTechShield() {
        const hue = Math.floor(this.currentHueStart + Math.sin(this.time) * this.currentHueRange);
        
        // Góc quay tự động đa trục + chuột tương tác
        const rotX = this.time * 0.15 + this.mouseRotateX * 45;
        const rotY = this.time * 0.22 + this.mouseRotateY * 45;
        const cosX = Math.cos(rotX), sinX = Math.sin(rotX);
        const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
        
        const project = (x, y, z) => {
            let x1 = x * cosY - z * sinY;
            let z1 = x * sinY + z * cosY;
            let y2 = y * cosX - z1 * sinX;
            let z2 = y * sinX + z1 * cosX;
            return this.projectPoint(x1, y2, z2);
        };
        
        this.ctx.save();
        const R = Math.min(this.width, this.height) * 0.24; // Bán kính lớn
        const r = Math.min(this.width, this.height) * 0.08; // Đường kính ống
        
        const uBands = 8;
        const vBands = 18;
        
        this.ctx.strokeStyle = `hsla(${hue}, 80%, 60%, 0.15)`;
        this.ctx.lineWidth = 0.6;
        
        // Vẽ vòng lưới trục chính
        for (let u = 0; u < uBands; u++) {
            const theta = (u * 2 * Math.PI) / uBands;
            this.ctx.beginPath();
            for (let v = 0; v <= vBands; v++) {
                const phi = (v * 2 * Math.PI) / vBands;
                
                const x = (R + r * Math.cos(phi)) * Math.cos(theta);
                const y = r * Math.sin(phi);
                const z = (R + r * Math.cos(phi)) * Math.sin(theta);
                
                const pt = project(x, y, z);
                if (v === 0) this.ctx.moveTo(pt.x, pt.y);
                else this.ctx.lineTo(pt.x, pt.y);
            }
            this.ctx.stroke();
        }
        
        // Vẽ các vòng liên kết vuông góc tạo lưới 3D Torus
        for (let v = 0; v < vBands; v += 2) {
            const phi = (v * 2 * Math.PI) / vBands;
            this.ctx.beginPath();
            for (let u = 0; u <= uBands * 4; u++) {
                const theta = (u * 2 * Math.PI) / (uBands * 4);
                const x = (R + r * Math.cos(phi)) * Math.cos(theta);
                const y = r * Math.sin(phi);
                const z = (R + r * Math.cos(phi)) * Math.sin(theta);
                
                const pt = project(x, y, z);
                if (u === 0) this.ctx.moveTo(pt.x, pt.y);
                else this.ctx.lineTo(pt.x, pt.y);
            }
            this.ctx.stroke();
        }
        this.ctx.restore();
    }

    animate() {
        this.ctx.clearRect(0, 0, this.width, this.height);
        this.time = (this.time + 0.005) % (Math.PI * 2000);

        // Smooth parameter interpolation for dimension morph transitions
        this.perspective = this.perspective + (this.targetPerspective - this.perspective) * 0.06;
        this.currentSpeedMultiplier = this.currentSpeedMultiplier + (this.targetSpeedMultiplier - this.currentSpeedMultiplier) * 0.06;
        this.currentHueStart = this.currentHueStart + (this.targetHueStart - this.currentHueStart) * 0.06;
        this.currentHueRange = this.currentHueRange + (this.targetHueRange - this.currentHueRange) * 0.06;
        this.warpFactor = this.warpFactor + (0.0 - this.warpFactor) * 0.05;

        // Lắc lư thấu kính ảo lồi 3D theo dao động điều hòa lò xo giảm chấn
        const springForce = (this.targetBulge - this.currentBulge) * 0.08;
        this.bulgeVelocity += springForce;
        this.bulgeVelocity *= 0.82;
        this.currentBulge += this.bulgeVelocity;

        // Vẽ cấu trúc không gian 3D tương ứng theo tab đang active
        if (this.currentScene === 'home') {
            this.drawHologlobe();
        } else if (this.currentScene === 'login') {
            this.drawTechTunnel();
        } else if (this.currentScene === 'download') {
            this.drawRadarGrid();
        } else if (this.currentScene === 'release') {
            this.drawDataMatrix();
        } else if (this.currentScene === 'terms') {
            this.drawTechShield();
        } else {
            this.drawHologlobe();
        }

        // Cập nhật và chiếu 3D các hạt
        this.particles.forEach(p => {
            // Tự động dịch chuyển vị trí hạt (Vật lý 3D)
            p.x += p.vx;
            p.y += p.vy;
            p.z += p.vz;

            // Bẫy va đập hộp không gian [-350, 350] để hạt luôn trong tầm nhìn
            const bound = 350;
            if (p.x < -bound || p.x > bound) p.vx *= -1;
            if (p.y < -bound || p.y > bound) p.vy *= -1;
            if (p.z < -bound || p.z > bound) p.vz *= -1;

            // 5D: Điều tiết vận tốc xoay theo nhịp điệu của Pha P và hệ số tốc độ
            const speedMod = (1 + Math.sin(this.time * 2 + p.p) * 0.4) * this.currentSpeedMultiplier;
            
            // Xoay hạt quanh tâm trục X, Y, Z và kết hợp góc xoay từ con trỏ chuột
            this.rotateX(p, this.angleX * speedMod + this.mouseRotateX);
            this.rotateY(p, this.angleY * speedMod + this.mouseRotateY);
            this.rotateZ(p, this.angleZ * speedMod);

            // 4D: Nhịp thở - co giãn bán kính hạt qua pha W
            p.radius = 2 + Math.sin(this.time * 3 + p.w) * 1.2;

            // Chiếu 3D sang 2D phối cảnh kèm hiệu ứng co giãn warp và thấu kính ảo lồi
            const warpOffset = this.warpFactor * Math.sin(this.time * 8 + p.x * 0.01) * 70;
            const pt = this.projectPoint(p.x, p.y, p.z + warpOffset);
            p.px = pt.x;
            p.py = pt.y;
            p.scale = pt.scale;
            p.visible = p.px >= 0 && p.px <= this.width && p.py >= 0 && p.py <= this.height;

            // Tương tác chuột (Đẩy hạt nhẹ ra xa nếu chuột ở gần hạt 2D)
            if (p.visible && this.mouse.x !== null) {
                const dx = p.px - this.mouse.x;
                const dy = p.py - this.mouse.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < this.mouse.radius && dist > 0.1) {
                    const force = (this.mouse.radius - dist) / this.mouse.radius;
                    // Lực đẩy
                    p.fx += (dx / dist) * force * 1.5;
                    p.fy += (dy / dist) * force * 1.5;
                }
            }

            // Áp dụng lực đẩy và giảm chấn (friction)
            p.px += p.fx;
            p.py += p.fy;
            p.fx *= 0.85;
            p.fy *= 0.85;

            // 6D: Chuyển sắc HSL mượt mà
            const hue = Math.floor(this.currentHueStart + Math.sin(this.time + p.q) * this.currentHueRange);
            p.color = `hsl(${hue}, 75%, 60%)`;
        });

        // Vẽ liên kết mạng lưới (Constellation Lines)
        for (let i = 0; i < this.particles.length; i++) {
            const p1 = this.particles[i];
            if (!p1.visible) continue;

            for (let j = i + 1; j < this.particles.length; j++) {
                const p2 = this.particles[j];
                if (!p2.visible) continue;

                // Tính khoảng cách Euclidean trong không gian 3D
                const dx = p1.x - p2.x;
                const dy = p1.y - p2.y;
                const dz = p1.z - p2.z;
                const dist3D = Math.sqrt(dx * dx + dy * dy + dz * dz);

                // 7D: Khoảng cách kết nối động co giãn theo pha U
                const connectionThreshold = 140 + Math.sin(this.time * 2 + p1.u + p2.u) * 35;

                if (dist3D < connectionThreshold) {
                    // Tính opacity theo khoảng cách
                    let alpha = (connectionThreshold - dist3D) / connectionThreshold;
                    alpha *= (p1.scale + p2.scale) / 4; // Giảm sáng các hạt quá xa về chiều sâu Z

                    // Tương tác chuột làm nổi bật liên kết
                    if (this.mouse.x !== null) {
                        const mouseDist1 = Math.sqrt((p1.px - this.mouse.x) ** 2 + (p1.py - this.mouse.y) ** 2);
                        const mouseDist2 = Math.sqrt((p2.px - this.mouse.x) ** 2 + (p2.py - this.mouse.y) ** 2);
                        if (mouseDist1 < this.mouse.radius || mouseDist2 < this.mouse.radius) {
                            alpha = Math.min(alpha * 2, 0.7); // Tăng sáng rực liên kết khi gần chuột
                        }
                    }

                    // Giới hạn alpha để tránh NaN/Infinity hoặc màu CSS không hợp lệ
                    alpha = Math.min(Math.max(0, alpha), 1);
                    if (isNaN(alpha) || !isFinite(alpha)) alpha = 0;

                    // Đảm bảo tọa độ hợp lệ trước khi vẽ đường nối
                    if (isFinite(p1.px) && isFinite(p1.py) && isFinite(p2.px) && isFinite(p2.py)) {
                        // Tạo màu Gradient cho liên kết
                        const grad = this.ctx.createLinearGradient(p1.px, p1.py, p2.px, p2.py);
                        grad.addColorStop(0, p1.color.replace(')', `, ${alpha * 0.45})`).replace('hsl', 'hsla'));
                        grad.addColorStop(1, p2.color.replace(')', `, ${alpha * 0.45})`).replace('hsl', 'hsla'));

                        this.ctx.beginPath();
                        this.ctx.strokeStyle = grad;
                        this.ctx.lineWidth = 0.8 * alpha * (p1.scale + p2.scale) / 2;
                        this.ctx.moveTo(p1.px, p1.py);
                        this.ctx.lineTo(p2.px, p2.py);
                        this.ctx.stroke();
                    }
                }
            }
        }

        // Vẽ các hạt chính và hệ vệ tinh 8D
        this.particles.forEach(p => {
            if (!p.visible) return;

            // Đảm bảo các thông số kích thước và tọa độ hạt hợp lệ
            const coreRad = p.radius * p.scale * 0.8;
            const glowRad = p.radius * 3.5;
            if (isFinite(p.px) && isFinite(p.py) && isFinite(coreRad) && isFinite(glowRad) && coreRad > 0 && glowRad > 0) {
                // Vẽ quầng sáng (glow) nền hạt chính
                this.ctx.beginPath();
                const glow = this.ctx.createRadialGradient(p.px, p.py, 0, p.px, p.py, glowRad);
                glow.addColorStop(0, p.color.replace(')', ', 0.35)').replace('hsl', 'hsla'));
                glow.addColorStop(1, 'rgba(0,0,0,0)');
                this.ctx.fillStyle = glow;
                this.ctx.arc(p.px, p.py, glowRad, 0, Math.PI * 2);
                this.ctx.fill();

                // Vẽ lõi hạt chính
                this.ctx.beginPath();
                this.ctx.fillStyle = p.color;
                this.ctx.arc(p.px, p.py, coreRad, 0, Math.PI * 2);
                this.ctx.fill();
            }

            // 8D: Vẽ vệ tinh siêu đối xứng (Sub-orbit Satellites) quay quanh hạt chính
            p.v.phase = (p.v.phase + p.v.speed) % (Math.PI * 2);
            
            for (let s = 0; s < p.v.count; s++) {
                const phaseOffset = s * Math.PI; // Đối xứng 180 độ nếu có 2 vệ tinh
                const currentPhase = p.v.phase + phaseOffset;

                // Tính toán quỹ đạo vệ tinh trong mặt phẳng nghiêng 3D
                const satX_local = Math.cos(currentPhase) * p.v.radiusX;
                const satY_local = Math.sin(currentPhase) * p.v.radiusY;

                // Xoay elip quỹ đạo vệ tinh theo góc nghiêng inclination
                const satX = p.px + (satX_local * Math.cos(p.v.inclination) - satY_local * Math.sin(p.v.inclination)) * p.scale;
                const satY = p.py + (satX_local * Math.sin(p.v.inclination) + satY_local * Math.cos(p.v.inclination)) * p.scale;
                const satRadius = 1.2 * p.scale;
                const orbitRadius = p.v.radiusX * p.scale;

                // Kiểm tra tính hợp lệ trước khi vẽ
                if (isFinite(satX) && isFinite(satY) && isFinite(satRadius) && isFinite(orbitRadius) && satRadius > 0 && orbitRadius > 0 && isFinite(p.px) && isFinite(p.py)) {
                    // Vẽ vệ tinh nhỏ
                    this.ctx.beginPath();
                    this.ctx.fillStyle = p.color.replace(')', ', 0.75)').replace('hsl', 'hsla');
                    this.ctx.arc(satX, satY, satRadius, 0, Math.PI * 2);
                    this.ctx.fill();

                    // Vẽ vòng quỹ đạo vệ tinh mỏng, mờ ảo
                    this.ctx.beginPath();
                    this.ctx.strokeStyle = p.color.replace(')', ', 0.07)').replace('hsl', 'hsla');
                    this.ctx.lineWidth = 0.5 * p.scale;
                    this.ctx.save();
                    this.ctx.translate(p.px, p.py);
                    this.ctx.rotate(p.v.inclination);
                    this.ctx.scale(1, p.v.radiusY / p.v.radiusX);
                    this.ctx.arc(0, 0, p.v.radiusX * p.scale, 0, Math.PI * 2);
                    this.ctx.restore();
                    this.ctx.stroke();
                }
            }
        });

        requestAnimationFrame(() => this.animate());
    }
}

// Helper to check session expiration
function isSessionExpired(loginTimeMs) {
    if (!loginTimeMs) return true;
    const loginDate = new Date(parseInt(loginTimeMs, 10));
    const cutoff = new Date(loginDate.getFullYear(), loginDate.getMonth(), loginDate.getDate() + 1, 5, 0, 0, 0);
    return Date.now() >= cutoff.getTime();
}

// ==================== LANDING LOGIC & AUTOPING ====================
let bgInstance = null;
document.addEventListener('DOMContentLoaded', () => {
    // Khởi tạo hình nền cấu trúc 8D
    bgInstance = new Interactive8DBackground();

    // Khởi tạo mô hình thiết bị 3D Hologram ở Hero
    try {
        new Device3DModelViewer();
    } catch (e) {
        console.error('Không thể khởi tạo mô hình 3D:', e);
    }

    // Kiểm tra session hiện có để hiển thị Welcome Box
    const saved = safeStorage.getItem('ot_mobile_user');
    const loginTime = safeStorage.getItem('ot_login_time');
    const welcomeBox = document.getElementById('login-welcome-box');
    const loginTabs = document.querySelector('.login-tabs');
    const formEmp = document.getElementById('form-login-employee');
    const formAdmin = document.getElementById('form-login-admin');

    if (saved && loginTime && !isSessionExpired(loginTime)) {
        try {
            const user = JSON.parse(saved);
            if (welcomeBox && loginTabs && formEmp && formAdmin) {
                const descEl = document.getElementById('welcome-user-desc');
                if (descEl) {
                    descEl.innerHTML = `Bạn đã đăng nhập dưới tên <strong style="color:var(--green-light); font-weight:700;">${user.fullname}</strong> (${user.role === 'admin' ? 'Quản trị viên' : 'Nhân viên'}).`;
                }

                // Hiển thị welcome box, ẩn các form đăng nhập
                welcomeBox.style.display = 'block';
                loginTabs.style.display = 'none';
                formEmp.style.display = 'none';
                formEmp.classList.remove('active');
                formAdmin.style.display = 'none';
                formAdmin.classList.remove('active');

                // Bắt sự kiện nút Vào ứng dụng
                const btnEnter = document.getElementById('btn-enter-app');
                if (btnEnter) {
                    if (user.role === 'admin') {
                        btnEnter.className = 'btn btn-purple btn-full';
                    }
                    btnEnter.addEventListener('click', () => {
                        const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
                        const targetUrl = (user.role === 'admin' || !isMobileDevice) ? '/desktop/' : '/mobile/?cleared=1';
                        window.location.replace(getRedirectPrefix() + targetUrl);
                    });
                }

                // Bắt sự kiện nút Đăng xuất trên cổng portal
                const btnLogoutPortal = document.getElementById('btn-logout-portal');
                if (btnLogoutPortal) {
                    btnLogoutPortal.addEventListener('click', () => {
                        safeStorage.removeItem('ot_mobile_user');
                        safeStorage.removeItem('ot_login_time');
                        safeStorage.removeItem('ot_current_user');
                        safeStorage.removeItem('ot_login_date');
                        document.documentElement.classList.remove('user-logged-in'); // Dọn dẹp class tránh flash
                        showToast('Đã đăng xuất tài khoản thành công', 'info');
                        
                        // Phục hồi giao diện đăng nhập bình thường
                        welcomeBox.style.display = 'none';
                        loginTabs.style.display = 'flex';
                        const btnTabEmp = document.getElementById('btn-tab-employee');
                        if (btnTabEmp) btnTabEmp.click();
                    });
                }
            }
        } catch (e) {
            console.error('Lỗi khởi tạo Welcome Box:', e);
        }
    }

    const host = window.location.origin;
    const savedServerIp = localStorage.getItem('ot_server_ip') || 'https://ot-manager-server-jbxd.onrender.com';
    const checkUrl = (window.location.protocol.startsWith('http') && !window.location.hostname.includes('github.io') && !window.location.hostname.includes('otmanager.id.vn')) ? host : savedServerIp;

    // 1. Fetch version info dynamically from server
    fetch(checkUrl + '/api/version')
        .then(res => res.json())
        .then(data => {
            if (data.version) {
                // Update version text elements
                document.querySelectorAll('.web-version-badge, .login-ver-val').forEach(el => {
                    el.textContent = 'v' + data.version;
                });

                // Update Windows EXE release link
                const desktopBtn = document.getElementById('desktop-download-btn-landing');
                if (desktopBtn && data.desktopDownloadUrl) {
                    desktopBtn.href = data.desktopDownloadUrl;
                }

                // Update Android APK link & QR Code
                const apkBtn = document.getElementById('apk-download-btn-landing');
                if (apkBtn && data.mobileDownloadUrl) {
                    apkBtn.href = data.mobileDownloadUrl;
                }
                const apkQr = document.getElementById('apk-qr-code-landing');
                if (apkQr && data.mobileDownloadUrl) {
                    apkQr.src = 'https://api.qrserver.com/v1/create-qr-code/?size=150x150&color=0f0f1a&data=' + encodeURIComponent(data.mobileDownloadUrl);
                }
            }
        })
        .catch(err => console.warn('Lỗi đồng bộ thông tin phiên bản từ server:', err));

    // 2. Connection Status check
    const statusEl = document.getElementById('connection-status');
    if (statusEl) {
        statusEl.style.display = 'block';
        statusEl.innerHTML = `<span style="color:#f59e0b; animation: pulse 1.5s infinite; display: inline-block;">● Đang kết nối Cloud...</span>`;
    }

    fetch(checkUrl + '/api/server-info')
        .then(res => res.json())
        .then(info => {
            if (statusEl) {
                // Đã kết nối thành công, ẩn trạng thái để giao diện sạch sẽ
                statusEl.style.display = 'none';
            }
        })
        .catch(err => {
            if (statusEl) {
                statusEl.innerHTML = `<span style="color:#ef4444;">● Ngoại tuyến (Offline)</span>`;
            }
        });

    // 3. Tab switching logic
    document.querySelectorAll('.landing-nav .nav-link').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const tabName = this.getAttribute('data-tab');
            if (!tabName) return;

            // Active button states
            document.querySelectorAll('.landing-nav .nav-link').forEach(l => l.classList.remove('active'));
            this.classList.add('active');

            // Switch tab content views
            document.querySelectorAll('.landing-tab-content').forEach(p => p.classList.remove('active'));
            const targetPanel = document.getElementById('ltab-' + tabName);
            if (targetPanel) {
                targetPanel.classList.add('active');
            }

            // Trigger background dimensional shift morphing
            if (bgInstance && typeof bgInstance.morph === 'function') {
                bgInstance.morph(tabName);
            }

            history.pushState(null, null, '#' + tabName);
            if (tabName === 'login') {
                setTimeout(() => {
                    const input = document.getElementById('login-user');
                    if (input) input.focus();
                }, 150);
            }
        });
    });

    // Check URL hashes for deep links
    function checkHashTab() {
        const hash = window.location.hash.substring(1);
        const validTabs = ['home', 'download', 'release', 'terms', 'login'];
        let targetTab = 'home';
        
        if (hash === 'features' || hash === 'features-section') targetTab = 'home';
        else if (hash === 'download-section') targetTab = 'download';
        else if (hash === 'login-section') targetTab = 'login';
        else if (validTabs.includes(hash)) targetTab = hash;

        const navLink = document.querySelector(`.landing-nav .nav-link[data-tab="${targetTab}"]`);
        if (navLink) {
            document.querySelectorAll('.landing-nav .nav-link').forEach(l => l.classList.remove('active'));
            navLink.classList.add('active');

            document.querySelectorAll('.landing-tab-content').forEach(p => p.classList.remove('active'));
            const targetPanel = document.getElementById('ltab-' + targetTab);
            if (targetPanel) {
                targetPanel.classList.add('active');
            }

            // Trigger background dimensional shift morphing
            if (bgInstance && typeof bgInstance.morph === 'function') {
                bgInstance.morph(targetTab);
            }
        }
    }
    window.addEventListener('hashchange', checkHashTab);
    checkHashTab();

    // 4. Login widget form tabs (Employee vs Admin)
    const btnTabEmp = document.getElementById('btn-tab-employee');
    const btnTabAdmin = document.getElementById('btn-tab-admin');
    // formEmp và formAdmin đã được khai báo ở đầu DOMContentLoaded

    if (btnTabEmp && btnTabAdmin && formEmp && formAdmin) {
        const tabsContainer = document.querySelector('.login-tabs');

        btnTabEmp.addEventListener('click', () => {
            btnTabEmp.classList.add('active');
            btnTabAdmin.classList.remove('active');
            if (tabsContainer) tabsContainer.classList.remove('admin-active');
            formEmp.style.display = 'block';
            formEmp.classList.add('active');
            formAdmin.style.display = 'none';
            formAdmin.classList.remove('active');
            const input = document.getElementById('login-user');
            if (input) input.focus();
        });

        btnTabAdmin.addEventListener('click', () => {
            btnTabAdmin.classList.add('active');
            btnTabEmp.classList.remove('active');
            if (tabsContainer) tabsContainer.classList.add('admin-active');
            formAdmin.style.display = 'block';
            formAdmin.classList.add('active');
            formEmp.style.display = 'none';
            formEmp.classList.remove('active');
            const input = document.getElementById('login-admin-user');
            if (input) input.focus();
        });
    }

    // 5. Auth submits
    // API client call
    function apiCall(endpoint, method, body) {
        return fetch(checkUrl + endpoint, {
            method: method || 'GET',
            headers: {
                'Content-Type': 'application/json',
                'x-device-id': deviceId
            },
            body: body ? JSON.stringify(body) : null
        }).then(res => {
            if (!res.ok) {
                return res.json().then(data => {
                    throw new Error(data.error || `Server HTTP Error ${res.status}`);
                });
            }
            return res.json();
        });
    }

    // Employee Login
    if (formEmp) {
        formEmp.addEventListener('submit', async (e) => {
            e.preventDefault();
            const errEl = document.getElementById('login-error-emp');
            errEl.textContent = '';

            const submitBtn = document.getElementById('btn-login-emp');

            if (await isPrivateMode()) {
                errEl.textContent = 'Hệ thống không cho phép đăng nhập từ trình duyệt ẩn danh (Incognito Mode) để đảm bảo an toàn thiết bị!';
                return;
            }

            const username = document.getElementById('login-user').value.trim();
            submitBtn.disabled = true;
            submitBtn.textContent = 'Đang đăng nhập...';

            apiCall('/api/auth/login', 'POST', { username, deviceId, isBrowser: true })
                .then(data => {
                    if (data.user.role !== 'employee') {
                        throw new Error('Tài khoản này không phải là nhân viên!');
                    }
                    safeStorage.setItem('ot_mobile_user', JSON.stringify(data.user));
                    safeStorage.setItem('ot_login_time', Date.now().toString());
                    if (data.token) {
                        safeStorage.setItem('ot_auth_token', data.token);
                    }
                    safeStorage.setItem('ot_current_user', JSON.stringify(data.user));
                    const todayStr = new Date().toISOString().split('T')[0];
                    safeStorage.setItem('ot_login_date', todayStr);

                    showToast('Đăng nhập Nhân viên thành công!', 'success');
                    setTimeout(() => {
                        const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
                        const targetUrl = isMobileDevice ? '/mobile/?cleared=1' : '/desktop/';
                        window.location.replace(getRedirectPrefix() + targetUrl);
                    }, 800);
                })
                .catch(err => {
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
                            unlinkBtn.addEventListener('click', () => {
                                unlinkBtn.disabled = true;
                                unlinkBtn.textContent = 'Đang gửi yêu cầu...';
                                fetch(checkUrl + '/api/auth/request-unlink', {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json'
                                    },
                                    body: JSON.stringify({ username })
                                })
                                .then(res => {
                                    if (!res.ok) {
                                        return res.json().then(data => { throw new Error(data.error || 'Lỗi gửi yêu cầu!'); });
                                    }
                                    return res.json();
                                })
                                .then(data => {
                                    showToast('Gửi yêu cầu thành công!', 'success');
                                    errEl.innerHTML = `<span style="color:#10b981; font-weight: 700; display: block; margin-top: 8px;">✅ ${data.message || 'Đã gửi yêu cầu huỷ liên kết đến Quản trị viên!'}</span>`;
                                })
                                .catch(unlinkErr => {
                                    showToast(unlinkErr.message, 'error');
                                    unlinkBtn.disabled = false;
                                    unlinkBtn.textContent = 'Xin Quản lý huỷ liên kết';
                                });
                            });
                        }
                    } else {
                        errEl.textContent = err.message;
                    }
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Đăng nhập Nhân viên';
                });
        });
    }

    // Admin Login
    if (formAdmin) {
        formAdmin.addEventListener('submit', async (e) => {
            e.preventDefault();
            const errEl = document.getElementById('login-error-admin');
            errEl.textContent = '';

            const submitBtn = document.getElementById('btn-login-admin');

            if (await isPrivateMode()) {
                errEl.textContent = 'Hệ thống không cho phép đăng nhập từ trình duyệt ẩn danh (Incognito Mode) để đảm bảo an toàn thiết bị!';
                return;
            }

            const username = document.getElementById('login-admin-user').value.trim();
            const password = document.getElementById('login-password').value;
            submitBtn.disabled = true;
            submitBtn.textContent = 'Đang đăng nhập...';

            apiCall('/api/auth/login', 'POST', { username, password, deviceId })
                .then(data => {
                    if (data.user.role !== 'admin') {
                        throw new Error('Tài khoản này không có quyền quản trị!');
                    }
                    // Save desktop admin compatible keys
                    safeStorage.setItem('ot_mobile_user', JSON.stringify(data.user));
                    safeStorage.setItem('ot_current_user', JSON.stringify(data.user));
                    safeStorage.setItem('ot_login_time', Date.now().toString());
                    safeStorage.setItem('ot_login_date', new Date().toISOString().split('T')[0]);

                    showToast('Đăng nhập Quản trị thành công!', 'success');
                    setTimeout(() => {
                        window.location.replace(getRedirectPrefix() + '/desktop/');
                    }, 800);
                })
                .catch(err => {
                    errEl.textContent = err.message;
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Đăng nhập Quản trị';
                });
        });
    }

    // Hide splash screen after initialization
    setTimeout(() => {
        const splash = document.getElementById('splash');
        if (splash) splash.classList.remove('active');
    }, 1000);

    // Toggle mobile menu
    const toggleBtn = document.getElementById('mobile-menu-toggle');
    const landingNav = document.querySelector('.landing-nav');
    if (toggleBtn && landingNav) {
        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            landingNav.classList.toggle('open');
            toggleBtn.classList.toggle('active');
        });
        
        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!landingNav.contains(e.target) && e.target !== toggleBtn) {
                landingNav.classList.remove('open');
                toggleBtn.classList.remove('active');
            }
        });

        // Close menu when clicking a link
        landingNav.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', () => {
                landingNav.classList.remove('open');
                toggleBtn.classList.remove('active');
            });
        });
    }
});

// Expose scroll helper globally
window.scrollToLogin = function() {
    const navLink = document.querySelector('.landing-nav .nav-link[data-tab="login"]');
    if (navLink) navLink.click();
};

// ==================== 8D DYNAMIC PARALLAX CARDS ====================
document.addEventListener('DOMContentLoaded', () => {
    const apply8DEffect = (selector, intensity = 10, innerSelector = null) => {
        const cards = document.querySelectorAll(selector);
        cards.forEach(card => {
            const target = innerSelector ? card.querySelector(innerSelector) : card;
            if (!target) return;
            
            // Add glare element if not present
            let glare = target.querySelector('.tilt-glare');
            if (!glare) {
                glare = document.createElement('div');
                glare.className = 'tilt-glare';
                target.appendChild(glare);
            }
            
            card.addEventListener('mousemove', (e) => {
                const rect = card.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                
                const centerX = rect.width / 2;
                const centerY = rect.height / 2;
                
                const rotateX = ((centerY - y) / centerY) * intensity;
                const rotateY = ((x - centerX) / centerX) * intensity;
                
                // Calculate percents for glare position
                const px = x / rect.width;
                const py = y / rect.height;
                
                target.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateZ(20px)`;
                target.style.boxShadow = '0 20px 40px rgba(0, 0, 0, 0.6), 0 0 30px rgba(13, 217, 139, 0.06)';
                
                glare.style.opacity = '1';
                glare.style.left = `${px * 100}%`;
                glare.style.top = `${py * 100}%`;
            });
            
            card.addEventListener('mouseleave', () => {
                target.style.transform = `rotateX(0deg) rotateY(0deg) translateZ(0)`;
                target.style.boxShadow = '';
                glare.style.opacity = '0';
                target.style.transition = 'transform 0.6s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.6s ease';
            });
            
            card.addEventListener('mouseenter', () => {
                target.style.transition = 'transform 0.1s ease-out, box-shadow 0.1s ease-out';
            });
        });
    };
    
    // Áp dụng cho ảnh mockup review (xoay toàn bộ khung viền 3D)
    apply8DEffect('#app-review-3d', 14, '.device-mockup-wrapper');
    
    // Áp dụng cho các loại thẻ trên trang chủ
    apply8DEffect('.feat-card-large', 12);
    apply8DEffect('.download-card-large', 10);
    apply8DEffect('.login-page-card', 8);
    apply8DEffect('.terms-card', 6);
    apply8DEffect('.gallery-card', 10);

    // Toggle collapsible changelog timeline logs
    document.querySelectorAll('.changelog-item').forEach(item => {
        const header = item.querySelector('.changelog-header-btn');
        if (header) {
            header.addEventListener('click', () => {
                const isActive = item.classList.contains('active');
                document.querySelectorAll('.changelog-item').forEach(other => {
                    other.classList.remove('active');
                });
                if (!isActive) {
                    item.classList.add('active');
                }
            });
        }
    });

    // Make the first release item open by default
    const firstChangelog = document.querySelector('.changelog-item');
    if (firstChangelog) {
        firstChangelog.classList.add('active');
    }

    // Toggle gallery tabs (Employee vs Admin screenshots)
    document.querySelectorAll('.gallery-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            const galleryType = this.getAttribute('data-gallery');
            if (!galleryType) return;
            
            // Toggle active state on buttons
            document.querySelectorAll('.gallery-tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            
            // Toggle active state on content panels
            document.querySelectorAll('.gallery-content').forEach(p => p.classList.remove('active'));
            const targetPanel = document.getElementById('gallery-content-' + galleryType);
            if (targetPanel) {
                targetPanel.classList.add('active');
            }
        });
    });
});

// ==================== 3D HOLOGRAM DEVICE MODEL VIEWER ====================
class Device3DModelViewer {
    constructor() {
        this.canvas = document.getElementById('canvas-3d-model');
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        this.mouse = { x: 0, y: 0 };
        this.time = 0;
        this.resize();
        this.initGeometry();
        this.bindEvents();
        this.animate();
    }
    
    resize() {
        if (!this.canvas) return;
        this.width = this.canvas.width = window.innerWidth;
        this.height = this.canvas.height = window.innerHeight;
    }
    
    initGeometry() {
        this.vertices = [];
        this.edges = [];
        
        // 1. MONITOR MODEL (Centered in 3D Space)
        const mw = 145; // Half width of monitor screen
        const mh = 90;  // Half height of monitor screen
        
        // Front screen vertices (index 0 - 3)
        this.vertices.push({ x: -mw, y: -mh, z: 0, color: 'monitor' });
        this.vertices.push({ x: mw, y: -mh, z: 0, color: 'monitor' });
        this.vertices.push({ x: mw, y: mh, z: 0, color: 'monitor' });
        this.vertices.push({ x: -mw, y: mh, z: 0, color: 'monitor' });
        
        // Back screen bezel (index 4 - 7)
        this.vertices.push({ x: -mw + 8, y: -mh + 6, z: 12, color: 'monitor_back' });
        this.vertices.push({ x: mw - 8, y: -mh + 6, z: 12, color: 'monitor_back' });
        this.vertices.push({ x: mw - 8, y: mh - 6, z: 12, color: 'monitor_back' });
        this.vertices.push({ x: -mw + 8, y: mh - 6, z: 12, color: 'monitor_back' });
        
        // Connect monitor outer bezel edges
        this.edges.push([0, 1], [1, 2], [2, 3], [3, 0]);
        this.edges.push([4, 5], [5, 6], [6, 7], [7, 4]);
        this.edges.push([0, 4], [1, 5], [2, 6], [3, 7]);
        
        // Inner screen scanlines grid wireframe (index 8 - 11)
        this.vertices.push({ x: -mw + 12, y: -mh + 12, z: 1, color: 'screen_lines' });
        this.vertices.push({ x: mw - 12, y: -mh + 12, z: 1, color: 'screen_lines' });
        this.vertices.push({ x: mw - 12, y: mh - 12, z: 1, color: 'screen_lines' });
        this.vertices.push({ x: -mw + 12, y: mh - 12, z: 1, color: 'screen_lines' });
        this.edges.push([8, 9], [9, 10], [10, 11], [11, 8]);
        
        // Stand neck lines (index 12 - 15)
        this.vertices.push({ x: -18, y: mh, z: 6, color: 'stand' });
        this.vertices.push({ x: 18, y: mh, z: 6, color: 'stand' });
        this.vertices.push({ x: -12, y: mh + 50, z: 20, color: 'stand' });
        this.vertices.push({ x: 12, y: mh + 50, z: 20, color: 'stand' });
        this.edges.push([12, 14], [13, 15], [14, 15]);
        
        // Base plate (index 16 - 19)
        this.vertices.push({ x: -50, y: mh + 50, z: 45, color: 'base' });
        this.vertices.push({ x: 50, y: mh + 50, z: 45, color: 'base' });
        this.vertices.push({ x: 40, y: mh + 50, z: -10, color: 'base' });
        this.vertices.push({ x: -40, y: mh + 50, z: -10, color: 'base' });
        this.edges.push([16, 17], [17, 18], [18, 19], [19, 16], [14, 16], [15, 17]);

        // 2. MOBILE PHONE MODEL (Positioned on the front right in Z)
        const px = 140;
        const py = 35;
        const pz = -65;
        const pw = 40;
        const ph = 80;
        const pd = 8;
        
        // Phone Front (index 20 - 23)
        this.vertices.push({ x: px - pw, y: py - ph, z: pz - pd/2, color: 'phone' });
        this.vertices.push({ x: px + pw, y: py - ph, z: pz - pd/2, color: 'phone' });
        this.vertices.push({ x: px + pw, y: py + ph, z: pz - pd/2, color: 'phone' });
        this.vertices.push({ x: px - pw, y: py + ph, z: pz - pd/2, color: 'phone' });
        
        // Phone Back (index 24 - 27)
        this.vertices.push({ x: px - pw, y: py - ph, z: pz + pd/2, color: 'phone_back' });
        this.vertices.push({ x: px + pw, y: py - ph, z: pz + pd/2, color: 'phone_back' });
        this.vertices.push({ x: px + pw, y: py + ph, z: pz + pd/2, color: 'phone_back' });
        this.vertices.push({ x: px - pw, y: py + ph, z: pz + pd/2, color: 'phone_back' });
        
        // Connect phone rings
        this.edges.push([20, 21], [21, 22], [22, 23], [23, 20]);
        this.edges.push([24, 25], [25, 26], [26, 27], [27, 24]);
        this.edges.push([20, 24], [21, 25], [22, 26], [23, 27]);
        
        // Phone screen bezel inner lines
        this.vertices.push({ x: px - pw + 5, y: py - ph + 8, z: pz - pd/2 + 1, color: 'phone_screen' });
        this.vertices.push({ x: px + pw - 5, y: py - ph + 8, z: pz - pd/2 + 1, color: 'phone_screen' });
        this.vertices.push({ x: px + pw - 5, y: py + ph - 8, z: pz - pd/2 + 1, color: 'phone_screen' });
        this.vertices.push({ x: px - pw + 5, y: py + ph - 8, z: pz - pd/2 + 1, color: 'phone_screen' });
        this.edges.push([28, 29], [29, 30], [30, 31], [31, 28]);
    }
    
    bindEvents() {
        window.addEventListener('resize', () => this.resize());
    }
    
    animate() {
        if (!this.canvas) return;
        this.ctx.clearRect(0, 0, this.width, this.height);
        this.time += 0.006;
        
        const centerX = this.width / 2;
        const centerY = this.height / 2;
        
        // Xoay tự động (không theo con chuột)
        const rotY = this.time * 0.22;
        const rotX = Math.sin(this.time * 0.1) * 0.15;
        const rotZ = Math.sin(this.time * 0.05) * 0.05;
        
        const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
        const cosX = Math.cos(rotX), sinX = Math.sin(rotX);
        const cosZ = Math.cos(rotZ), sinZ = Math.sin(rotZ);
        
        const projected = [];
        
        // Chiếu tất cả các điểm 3D
        this.vertices.forEach(v => {
            let x1 = v.x * cosY - v.z * sinY;
            let z1 = v.x * sinY + v.z * cosY;
            
            let y2 = v.y * cosX - z1 * sinX;
            let z2 = v.y * sinX + z1 * cosX;
            
            let x3 = x1 * cosZ - y2 * sinZ;
            let y3 = x1 * sinZ + y2 * cosZ;
            
            const d = 500;
            const scale = 360 / Math.max(30, d + z2);
            projected.push({
                x: centerX + x3 * scale,
                y: centerY + y3 * scale,
                z: z2,
                color: v.color
            });
        });
        
        // Vẽ lưới neon
        this.ctx.save();
        this.ctx.shadowBlur = 10;
        this.ctx.shadowColor = 'rgba(13, 217, 139, 0.45)';
        
        this.edges.forEach(edge => {
            const p1 = projected[edge[0]];
            const p2 = projected[edge[1]];
            
            this.ctx.beginPath();
            const avgZ = (p1.z + p2.z) / 2;
            const opacity = Math.min(Math.max(0.08, 0.42 - (avgZ / 350)), 0.65);
            
            if (p1.color.startsWith('phone')) {
                this.ctx.strokeStyle = `rgba(9, 227, 227, ${opacity})`;
            } else if (p1.color === 'screen_lines') {
                this.ctx.strokeStyle = `rgba(13, 217, 139, ${opacity * 0.35})`;
            } else {
                this.ctx.strokeStyle = `rgba(13, 217, 139, ${opacity})`;
            }
            
            this.ctx.lineWidth = p1.color === 'screen_lines' || p1.color === 'phone_screen' ? 0.6 : 1.2;
            this.ctx.moveTo(p1.x, p1.y);
            this.ctx.lineTo(p2.x, p2.y);
            this.ctx.stroke();
        });
        
        this.ctx.restore();
        requestAnimationFrame(() => this.animate());
    }
}

