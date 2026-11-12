// ==================== LANDING LOGIC & AUTOPING ====================
function isSessionExpired(loginTimeMs) {
    if (!loginTimeMs) return true;
    const loginTime = parseInt(loginTimeMs, 10);
    return loginTime < getMostRecent5AM();
}

function isJwtValidForCycle(token) {
    if (!token) return false;
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return false;
        const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
        if (payload.exp && Date.now() / 1000 > payload.exp) return false;
        if (payload.iat && payload.iat * 1000 < getMostRecent5AM()) return false;
        return true;
    } catch (e) {
        return false;
    }
}

let bgInstance = null;
document.addEventListener('DOMContentLoaded', () => {
    // Khởi tạo hình nền cấu trúc 8D
    bgInstance = new Interactive8DBackground();

    // Khởi tạo mô hình thiết bị 3D Hologram ở Hero (Chỉ chạy trên Desktop để tránh nóng máy trên điện thoại di động)
    const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
    if (!isMobileDevice) {
        try {
            new Device3DModelViewer();
        } catch (e) {
            console.error('Không thể khởi tạo mô hình 3D:', e);
        }
    }

    // Tự động điền tài khoản đã lưu nếu người dùng chọn Ghi nhớ ở lần trước (không lưu mật khẩu thô trong localStorage)
    try {
        localStorage.removeItem('ot_saved_admin_pass');

        const savedEmpUser = localStorage.getItem('ot_saved_emp_user');
        const inputEmpUser = document.getElementById('login-user');
        const rememberCheckboxEmp = document.getElementById('login-remember-emp');
        if (savedEmpUser && inputEmpUser) {
            inputEmpUser.value = savedEmpUser;
            if (rememberCheckboxEmp) rememberCheckboxEmp.checked = true;
        }

        const savedAdminUser = localStorage.getItem('ot_saved_admin_user');
        const inputAdminUser = document.getElementById('login-admin-user');
        const rememberCheckboxAdmin = document.getElementById('login-remember-admin');
        if (savedAdminUser && inputAdminUser) {
            inputAdminUser.value = savedAdminUser;
            if (rememberCheckboxAdmin) rememberCheckboxAdmin.checked = true;
        }
    } catch (e) {
        console.error('Lỗi tự động điền tài khoản đã lưu:', e);
    }

    // Kiểm tra session hiện có để hiển thị Welcome Box
    const saved = safeStorage.getItem('ot_mobile_user');
    const loginTime = safeStorage.getItem('ot_login_time');
    const welcomeBox = document.getElementById('login-welcome-box');
    const loginTabs = document.querySelector('.login-tabs');
    const formEmp = document.getElementById('form-login-employee');
    const formAdmin = document.getElementById('form-login-admin');

    const existingToken = safeStorage.getItem('ot_auth_token');
    if (saved && loginTime && !isSessionExpired(loginTime) && isJwtValidForCycle(existingToken)) {
        try {
            const user = JSON.parse(saved);
            if (welcomeBox) {
                welcomeBox.style.display = 'block';
                const welcomeTitle = document.getElementById('welcome-user-title');
                const welcomeDesc = document.getElementById('welcome-user-desc');
                if (welcomeTitle) welcomeTitle.textContent = `Chào mừng trở lại, ${user.fullname || user.username}!`;
                if (welcomeDesc) welcomeDesc.textContent = `Đang đăng nhập với vai trò: ${user.role === 'admin' ? 'Quản lý' : 'Nhân viên'}`;
                
                const btnEnter = document.getElementById('btn-enter-app');
                if (btnEnter) {
                    btnEnter.onclick = () => {
                        const targetUrl = (user.role === 'admin' || !isMobileDevice) ? '/desktop/' : '/mobile/?cleared=1';
                        window.location.replace(getRedirectPrefix() + targetUrl);
                    };
                }
                
                const btnLogout = document.getElementById('btn-logout-portal');
                if (btnLogout) {
                    btnLogout.onclick = () => {
                        clearPortalAuthSession();
                        window.location.reload();
                    };
                }
                
                // Ẩn các tabs và form đăng nhập thường
                const loginTabsWrapper = document.querySelector('.login-tabs-container-wrapper');
                if (loginTabsWrapper) loginTabsWrapper.style.display = 'none';
                if (loginTabs) loginTabs.style.display = 'none';
                if (formEmp) formEmp.style.display = 'none';
                if (formAdmin) formAdmin.style.display = 'none';
            }
        } catch (e) {
            console.error('Lỗi phân tích user đã lưu:', e);
            clearPortalAuthSession();
            document.documentElement.classList.remove('user-logged-in');
            if (welcomeBox) welcomeBox.style.display = 'none';
        }
    } else {
        if (saved || loginTime || existingToken) {
            clearPortalAuthSession();
        }
        document.documentElement.classList.remove('user-logged-in');
        if (welcomeBox) welcomeBox.style.display = 'none';
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

    const host = window.location.origin;
    let savedServerIp = localStorage.getItem('ot_server_ip') || 'https://api.otmanager.id.vn';
    
    // Tự động dọn dẹp các địa chỉ IP cũ hoặc bị lưu nhầm thành domain tĩnh của trang web
    if (savedServerIp && (
        savedServerIp.includes('otms.onrender.com') ||
        savedServerIp.includes('ot-manager-server.onrender.com') ||
        savedServerIp.includes('ot-manager-server-jbxd.onrender.com') ||
        savedServerIp.includes('github.io') ||
        savedServerIp.includes('otmanager.id.vn')
    )) {
        localStorage.removeItem('ot_server_ip');
        savedServerIp = 'https://api.otmanager.id.vn';
    }

    // Nếu chạy trên điện thoại hoặc HTTPS công cộng, lọc và bỏ qua các IP nội bộ tư nhân (như 192.168, localhost, v.v.)
    const isPublicHttps = window.location.protocol === 'https:' || window.location.hostname.includes('github.io') || window.location.hostname.includes('otmanager.id.vn');
    if ((isMobileDevice || isPublicHttps) && isLocalNetworkUrl(savedServerIp)) {
        console.log('[Connection] Bỏ qua IP nội bộ tư nhân trên thiết bị di động/HTTPS:', savedServerIp);
        savedServerIp = 'https://api.otmanager.id.vn';
    }

    let checkUrl = (window.location.protocol.startsWith('http') && !window.location.hostname.includes('github.io') && !window.location.hostname.includes('otmanager.id.vn')) ? host : savedServerIp;
    
    // Nếu chạy trên HTTPS công cộng, không cho phép kết nối tới HTTP local IP (tránh lỗi Mixed Content hoặc Failed to fetch)
    if (window.location.protocol === 'https:' && checkUrl.startsWith('http://')) {
        checkUrl = 'https://api.otmanager.id.vn';
    }

    const statusEl = document.getElementById('connection-status');

    function updateServerData(url) {
        // 1. Fetch version info dynamically from server
        fetch(url + '/api/version')
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
                        desktopBtn.setAttribute('data-url', data.desktopDownloadUrl);
                    }

                    // Update Android APK link & QR Code
                    const apkBtn = document.getElementById('apk-download-btn-landing');
                    if (apkBtn && data.mobileDownloadUrl) {
                        apkBtn.setAttribute('data-url', data.mobileDownloadUrl);
                    }
                    const apkQr = document.getElementById('apk-qr-code-landing');
                    if (apkQr && data.mobileDownloadUrl) {
                        apkQr.src = 'https://api.qrserver.com/v1/create-qr-code/?size=150x150&color=0f0f1a&data=' + encodeURIComponent(data.mobileDownloadUrl);
                    }
                }
            })
            .catch(err => console.warn('Lỗi đồng bộ thông tin phiên bản từ server:', err));
    }

    function checkServerConnection(url, timeoutMs) {
        return new Promise((resolve) => {
            if (typeof AbortController === 'undefined') {
                // Hỗ trợ trình duyệt cũ
                const xhr = new XMLHttpRequest();
                xhr.open('GET', url + '/api/server-info', true);
                xhr.timeout = timeoutMs || 3000;
                xhr.onload = function() { resolve(xhr.status === 200); };
                xhr.onerror = function() { resolve(false); };
                xhr.ontimeout = function() { resolve(false); };
                xhr.send();
                return;
            }
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeoutMs || 3000);

            fetch(url + '/api/server-info', { signal: controller.signal })
                .then(res => {
                    clearTimeout(timeoutId);
                    if (res.ok) {
                        resolve(true);
                    } else {
                        resolve(false);
                    }
                })
                .catch(() => {
                    clearTimeout(timeoutId);
                    resolve(false);
                });
        });
    }

    function autoResolveRentryUrl() {
        return new Promise((resolve) => {
            fetch('https://rentry.co/otmanager-hieutm?t=' + Date.now())
                .then(res => {
                    if (!res.ok) throw new Error();
                    return res.text();
                })
                .then(html => {
                    const match = html.match(/href="([^"]+)" class="external"/);
                    if (match) {
                        let url = match[1];
                        if (url && url.endsWith('/')) {
                            url = url.slice(0, -1);
                        }
                        resolve(url);
                    } else {
                        resolve(null);
                    }
                })
                .catch(() => {
                    resolve(null);
                });
        });
    }

    async function initConnection() {
        if (statusEl) {
            statusEl.style.display = 'block';
            statusEl.innerHTML = `<span style="color:#f59e0b; animation: pulse 1.5s infinite; display: inline-block;">● Đang kết nối Server...</span>`;
        }

        // Thử kết nối URL hiện tại
        let isConnected = await checkServerConnection(checkUrl, 3000);
        
        if (!isConnected && (window.location.protocol === 'https:' || window.location.hostname.includes('github.io') || window.location.hostname.includes('otmanager.id.vn'))) {
            if (statusEl) {
                statusEl.innerHTML = `<span style="color:#f59e0b; animation: pulse 1.5s infinite; display: inline-block;">● Tìm kiếm Server trên Cloud...</span>`;
            }
            // Thử lấy URL mới từ Rentry
            const rentryUrl = await autoResolveRentryUrl();
            if (rentryUrl && rentryUrl !== checkUrl) {
                // Thử kết nối URL mới lấy từ Rentry
                let isRentryConnected = await checkServerConnection(rentryUrl, 4000);
                if (isRentryConnected) {
                    checkUrl = rentryUrl;
                    localStorage.setItem('ot_server_ip', rentryUrl);
                    isConnected = true;
                    console.log('Tự động chuyển server sang Rentry URL:', rentryUrl);
                }
            }
        }

        if (isConnected) {
            if (statusEl) {
                statusEl.style.display = 'none'; // Ẩn khi kết nối thành công
            }
            updateServerData(checkUrl);
        } else {
            if (statusEl) {
                statusEl.innerHTML = `<span style="color:#ef4444;">● Ngoại tuyến (Offline)</span>`;
            }
            // Vẫn nạp dữ liệu từ server cũ / mặc định đề phòng
            updateServerData(checkUrl);
        }
    }

    initConnection();

    // Dynamic download event handlers to prevent showing raw link URLs in browser status bars on hover
    const apkBtn = document.getElementById('apk-download-btn-landing');
    if (apkBtn) {
        apkBtn.style.cursor = 'pointer';
        apkBtn.addEventListener('click', function(e) {
            e.preventDefault();
            const downloadUrl = this.getAttribute('data-url') || 'https://api.otmanager.id.vn/OT-Manager-mobile.apk';
            window.location.href = downloadUrl;
        });
    }
    const desktopBtn = document.getElementById('desktop-download-btn-landing');
    if (desktopBtn) {
        desktopBtn.style.cursor = 'pointer';
        desktopBtn.addEventListener('click', function(e) {
            e.preventDefault();
            const downloadUrl = this.getAttribute('data-url') || 'https://api.otmanager.id.vn/download/desktop';
            window.open(downloadUrl, '_blank');
        });
    }
    const iosBtn = document.getElementById('ios-download-btn-landing');
    if (iosBtn) {
        iosBtn.style.cursor = 'pointer';
        iosBtn.addEventListener('click', function(e) {
            e.preventDefault();
            // Mở modal hướng dẫn
            const modal = document.getElementById('ios-guide-modal');
            if (modal) {
                modal.classList.add('active');
            }
            // Kích hoạt tải về profile kèm theo deviceId để lưu thông tin định danh ổn định
            const curDeviceId = getDeviceId();
            window.location.href = checkUrl + '/download/ios-profile?d=' + encodeURIComponent(curDeviceId);
        });
    }

    // Đóng modal hướng dẫn iOS
    const iosModal = document.getElementById('ios-guide-modal');
    if (iosModal) {
        const closeBtn = document.getElementById('ios-modal-close-btn');
        const confirmBtn = document.getElementById('ios-modal-confirm-btn');
        
        const closeModal = () => {
            iosModal.classList.remove('active');
        };

        if (closeBtn) closeBtn.addEventListener('click', closeModal);
        if (confirmBtn) confirmBtn.addEventListener('click', closeModal);

        // Đóng khi click ngoài vùng modal
        iosModal.addEventListener('click', function(e) {
            if (e.target === iosModal) {
                closeModal();
            }
        });
    }

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
                    const input = document.getElementById('login-admin-user');
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

    // 5. Auth submits & Smart Cold-Start Wakeup Banner
    function createWakeupController() {
        const banner = document.getElementById('cloud-wakeup-banner');
        const textEl = document.getElementById('cloud-wakeup-text');
        const etaEl = document.getElementById('cloud-wakeup-eta');
        const barEl = document.getElementById('cloud-wakeup-bar');
        let delayTimer = null;
        let stepInterval = null;
        let elapsed = 0;

        delayTimer = setTimeout(() => {
            if (!banner) return;
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
            if (delayTimer) clearTimeout(delayTimer);
            if (stepInterval) clearInterval(stepInterval);
            if (banner) banner.style.display = 'none';
        };
    }

    // API client call
    function apiCall(endpoint, method, body) {
        const stopWakeup = createWakeupController();
        return fetch(checkUrl + endpoint, {
            method: method || 'GET',
            headers: {
                'Content-Type': 'application/json',
                'x-device-id': deviceId
            },
            body: body ? JSON.stringify(body) : null
        }).then(res => {
            stopWakeup();
            if (!res.ok) {
                return res.json().then(data => {
                    throw new Error(data.error || `Server HTTP Error ${res.status}`);
                });
            }
            return res.json();
        }).catch(err => {
            stopWakeup();
            throw new Error(getFriendlyErrorMessage(err));
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
            if (!username) {
                return; // Let browser required validation handle it
            }
            deviceId = getDeviceId(username); // Cập nhật deviceId mới nhất theo username trước khi đăng nhập
            const remember = document.getElementById('login-remember-emp') ? document.getElementById('login-remember-emp').checked : true;

            submitBtn.disabled = true;
            submitBtn.textContent = 'Đang đăng nhập...';

            apiCall('/api/auth/login', 'POST', { username, deviceId, isBrowser: true, clientSource: 'web_landing' })
                .then(data => {
                    if (data.user.role !== 'employee') {
                        throw new Error('Tài khoản này không phải là nhân viên!');
                    }
                    if (remember) {
                        sessionStorage.removeItem('ot_session_temp');
                    } else {
                        sessionStorage.setItem('ot_session_temp', '1');
                    }
                    safeStorage.setItem('ot_mobile_user', JSON.stringify(data.user), remember);
                    safeStorage.setItem('ot_login_time', Date.now().toString(), remember);
                    if (data.token) {
                        safeStorage.setItem('ot_auth_token', data.token, remember);
                    }
                    safeStorage.setItem('ot_current_user', JSON.stringify(data.user), remember);
                    safeStorage.setItem('ot_login_date', getSessionCycleDateStr(), remember);
                    
                    if (remember) {
                        localStorage.setItem('ot_saved_emp_user', username);
                    } else {
                        localStorage.removeItem('ot_saved_emp_user');
                    }

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
                                    showToast(getFriendlyErrorMessage(unlinkErr), 'error');
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
            if (!username || !password) {
                return; // Let browser required validation handle it
            }
            const remember = document.getElementById('login-remember-admin') ? document.getElementById('login-remember-admin').checked : true;

            submitBtn.disabled = true;
            submitBtn.textContent = 'Đang đăng nhập...';

            apiCall('/api/auth/login', 'POST', { username, password, deviceId })
                .then(data => {
                    if (data.user.role !== 'admin') {
                        throw new Error('Tài khoản này không có quyền quản trị!');
                    }
                    // Save desktop admin compatible keys
                    if (remember) {
                        sessionStorage.removeItem('ot_session_temp');
                    } else {
                        sessionStorage.setItem('ot_session_temp', '1');
                    }
                    safeStorage.setItem('ot_mobile_user', JSON.stringify(data.user), remember);
                    safeStorage.setItem('ot_current_user', JSON.stringify(data.user), remember);
                    if (data.token) {
                        safeStorage.setItem('ot_auth_token', data.token, remember);
                    }
                    if (data.requireEmailSetup) {
                        safeStorage.setItem('ot_require_email_setup', 'true', remember);
                    } else {
                        safeStorage.removeItem('ot_require_email_setup');
                    }
                    safeStorage.setItem('ot_login_time', Date.now().toString(), remember);
                    safeStorage.setItem('ot_login_date', getSessionCycleDateStr(), remember);
                    
                    localStorage.removeItem('ot_saved_admin_pass');
                    if (remember) {
                        localStorage.setItem('ot_saved_admin_user', username);
                    } else {
                        localStorage.removeItem('ot_saved_admin_user');
                    }

                    showToast('Đăng nhập Quản trị thành công!', 'success');
                    setTimeout(() => {
                        window.location.replace(getRedirectPrefix() + '/desktop/');
                    }, 800);
                })
                .catch(err => {
                    errEl.textContent = getFriendlyErrorMessage(err);
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

    // Show/hide password toggle for Admin portal login
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
});

// Expose scroll helper globally
window.scrollToLogin = function() {
    const navLink = document.querySelector('.landing-nav .nav-link[data-tab="login"]');
    if (navLink) navLink.click();
};
