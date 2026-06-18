/**
 * OT Manager - Landing Page & Login Portal JS
 * Quản lý tương tác hình nền cấu trúc 8D, chuyển tab, kết nối server, đăng nhập và điều hướng.
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

// Device ID
let deviceId = safeStorage.getItem('ot_device_id') || '';
if (!deviceId) {
    deviceId = 'dev_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
    safeStorage.setItem('ot_device_id', deviceId);
}

// Server API URL
const isLocalWeb = window.location.protocol.startsWith('http') && !window.location.hostname.includes('github.io') && !window.location.hostname.includes('otmanager.id.vn');
let API = isLocalWeb ? window.location.origin : (safeStorage.getItem('ot_server_ip') || 'https://ot-manager-server-jbxd.onrender.com');

// Clean deprecated IP addresses
let savedIp = safeStorage.getItem('ot_server_ip');
if (!isLocalWeb && savedIp && (savedIp.includes('otms.onrender.com') || savedIp.includes('ot-manager-server.onrender.com') || savedIp.includes('otm.app.vn') || savedIp.includes('new-folder-6471') || savedIp.includes('lhr.life'))) {
    safeStorage.removeItem('ot_server_ip');
    API = 'https://ot-manager-server-jbxd.onrender.com';
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
        this.time = 0;
        this.resize();
        this.initParticles();
        this.bindEvents();
        this.animate();
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
        });
        window.addEventListener('mouseleave', () => {
            this.mouse.x = null;
            this.mouse.y = null;
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

    animate() {
        this.ctx.clearRect(0, 0, this.width, this.height);
        this.time += 0.005;

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

            // 5D: Điều tiết vận tốc xoay theo nhịp điệu của Pha P
            const speedMod = 1 + Math.sin(this.time * 2 + p.p) * 0.4;
            
            // Xoay hạt quanh tâm trục X, Y, Z
            this.rotateX(p, this.angleX * speedMod);
            this.rotateY(p, this.angleY * speedMod);
            this.rotateZ(p, this.angleZ * speedMod);

            // 4D: Nhịp thở - co giãn bán kính hạt qua pha W
            p.radius = 2 + Math.sin(this.time * 3 + p.w) * 1.2;

            // Chiếu 3D sang 2D phối cảnh
            const projectedZ = p.z + 500; // Khoảng cách từ mắt đến camera
            if (projectedZ > 0) {
                const scale = this.perspective / projectedZ;
                p.px = (this.width / 2) + p.x * scale;
                p.py = (this.height / 2) + p.y * scale;
                p.visible = p.px >= 0 && p.px <= this.width && p.py >= 0 && p.py <= this.height;
                p.scale = scale;
            } else {
                p.visible = false;
            }

            // Tương tác chuột (Đẩy hạt nhẹ ra xa nếu chuột ở gần hạt 2D)
            if (p.visible && this.mouse.x !== null) {
                const dx = p.px - this.mouse.x;
                const dy = p.py - this.mouse.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < this.mouse.radius) {
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

            // 6D: Chuyển sắc HSL từ xanh lục bảo (150) -> tím ngọc (260) dựa trên pha Q
            const hue = Math.floor(155 + Math.sin(this.time + p.q) * 85);
            p.color = `hsl(${hue}, 80%, 60%)`;
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

        // Vẽ các hạt chính và hệ vệ tinh 8D
        this.particles.forEach(p => {
            if (!p.visible) return;

            // Vẽ quầng sáng (glow) nền hạt chính
            this.ctx.beginPath();
            const glow = this.ctx.createRadialGradient(p.px, p.py, 0, p.px, p.py, p.radius * 3.5);
            glow.addColorStop(0, p.color.replace(')', ', 0.35)').replace('hsl', 'hsla'));
            glow.addColorStop(1, 'rgba(0,0,0,0)');
            this.ctx.fillStyle = glow;
            this.ctx.arc(p.px, p.py, p.radius * 3.5, 0, Math.PI * 2);
            this.ctx.fill();

            // Vẽ lõi hạt chính
            this.ctx.beginPath();
            this.ctx.fillStyle = p.color;
            this.ctx.arc(p.px, p.py, p.radius * p.scale * 0.8, 0, Math.PI * 2);
            this.ctx.fill();

            // 8D: Vẽ vệ tinh siêu đối xứng (Sub-orbit Satellites) quay quanh hạt chính
            p.v.phase += p.v.speed;
            
            for (let s = 0; s < p.v.count; s++) {
                const phaseOffset = s * Math.PI; // Đối xứng 180 độ nếu có 2 vệ tinh
                const currentPhase = p.v.phase + phaseOffset;

                // Tính toán quỹ đạo vệ tinh trong mặt phẳng nghiêng 3D
                const satX_local = Math.cos(currentPhase) * p.v.radiusX;
                const satY_local = Math.sin(currentPhase) * p.v.radiusY;

                // Xoay elip quỹ đạo vệ tinh theo góc nghiêng inclination
                const satX = p.px + (satX_local * Math.cos(p.v.inclination) - satY_local * Math.sin(p.v.inclination)) * p.scale;
                const satY = p.py + (satX_local * Math.sin(p.v.inclination) + satY_local * Math.cos(p.v.inclination)) * p.scale;

                // Vẽ vệ tinh nhỏ
                this.ctx.beginPath();
                this.ctx.fillStyle = p.color.replace(')', ', 0.75)').replace('hsl', 'hsla');
                this.ctx.arc(satX, satY, 1.2 * p.scale, 0, Math.PI * 2);
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
document.addEventListener('DOMContentLoaded', () => {
    // Khởi tạo hình nền cấu trúc 8D
    new Interactive8DBackground();

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
                        window.location.replace(getRedirectPrefix() + (user.role === 'admin' ? '/desktop/' : '/mobile/'));
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
        }
    }
    window.addEventListener('hashchange', checkHashTab);
    checkHashTab();

    // 4. Login widget form tabs (Employee vs Admin)
    const btnTabEmp = document.getElementById('btn-tab-employee');
    const btnTabAdmin = document.getElementById('btn-tab-admin');
    // formEmp và formAdmin đã được khai báo ở đầu DOMContentLoaded

    if (btnTabEmp && btnTabAdmin && formEmp && formAdmin) {
        btnTabEmp.addEventListener('click', () => {
            btnTabEmp.classList.add('active');
            btnTabAdmin.classList.remove('active');
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
        formEmp.addEventListener('submit', (e) => {
            e.preventDefault();
            const username = document.getElementById('login-user').value.trim();
            const errEl = document.getElementById('login-error-emp');
            errEl.textContent = '';

            const submitBtn = document.getElementById('btn-login-emp');
            submitBtn.disabled = true;
            submitBtn.textContent = 'Đang đăng nhập...';

            apiCall('/api/auth/login', 'POST', { username, deviceId, isBrowser: true })
                .then(data => {
                    if (data.user.role !== 'employee') {
                        throw new Error('Tài khoản này không phải là nhân viên!');
                    }
                    safeStorage.setItem('ot_mobile_user', JSON.stringify(data.user));
                    safeStorage.setItem('ot_login_time', Date.now().toString());

                    showToast('Đăng nhập Nhân viên thành công!', 'success');
                    setTimeout(() => {
                        window.location.replace(getRedirectPrefix() + '/mobile/');
                    }, 800);
                })
                .catch(err => {
                    errEl.textContent = err.message;
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Đăng nhập Nhân viên';
                });
        });
    }

    // Admin Login
    if (formAdmin) {
        formAdmin.addEventListener('submit', (e) => {
            e.preventDefault();
            const username = document.getElementById('login-admin-user').value.trim();
            const password = document.getElementById('login-password').value;
            const errEl = document.getElementById('login-error-admin');
            errEl.textContent = '';

            const submitBtn = document.getElementById('btn-login-admin');
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
});

// Expose scroll helper globally
window.scrollToLogin = function() {
    const navLink = document.querySelector('.landing-nav .nav-link[data-tab="login"]');
    if (navLink) navLink.click();
};
