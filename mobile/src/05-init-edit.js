// ==================== INIT ====================
function initApp() {
    syncMobileThemeUI();
    syncQuickTimeChips('ot-end', 'ot-quick-time-chips');
    const isBrowser = window.location.protocol !== 'file:' && !window.AndroidBridge;
    if (isBrowser) {
        document.body.classList.add('is-web-browser');
    }
    const otDateEl = document.getElementById('ot-date');
    if (otDateEl) {
        otDateEl.max = new Date().toISOString().split('T')[0];
        otDateEl.addEventListener('change', handleDateChange);
        otDateEl.addEventListener('input', handleDateChange);
        handleDateChange();
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
                if (currentUser && currentUser.settings) {
                    mobileSystemSettings = currentUser.settings;
                }
                enterApp();
                return;
            } catch (e) {}
        } else {
            // Hết hạn hoặc chưa đăng nhập, dọn dẹp session
            clearMobileAuthSession();
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
    const btnLoginAdmin = document.getElementById('btn-login-admin');
    if (btnLoginAdmin) {
        btnLoginAdmin.addEventListener('click', handleAdminLogin);
    }
    const btnToggleAdminPw = document.getElementById('btn-toggle-admin-pw');
    if (btnToggleAdminPw) {
        btnToggleAdminPw.addEventListener('click', () => {
            const pwInput = document.getElementById('login-admin-password');
            if (pwInput) {
                pwInput.type = pwInput.type === 'password' ? 'text' : 'password';
            }
        });
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
                const backfillMonthGroup = document.getElementById('ot-backfill-month-group');
                if (backfillMonthGroup) backfillMonthGroup.style.display = 'block';
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
                const backfillMonthGroup = document.getElementById('ot-backfill-month-group');
                if (backfillMonthGroup) backfillMonthGroup.style.display = 'none';
                
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
                const backfillMonthGroup = document.getElementById('edit-ot-backfill-month-group');
                if (backfillMonthGroup) backfillMonthGroup.style.display = 'block';
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
                const backfillMonthGroup = document.getElementById('edit-ot-backfill-month-group');
                if (backfillMonthGroup) backfillMonthGroup.style.display = 'none';
                
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
            if (e <= s && e > 12 * 60) {
                document.getElementById('ot-end').value = startVal;
                updatePreview();
            }
        }
    });

    // Edit OT form
    const formEditOT = document.getElementById('form-edit-ot');
    if (formEditOT) formEditOT.addEventListener('submit', handleEditOTSubmit);

    const editOtEndInput = document.getElementById('edit-ot-end');
    if (editOtEndInput) {
        editOtEndInput.addEventListener('change', () => syncQuickTimeChips('edit-ot-end', 'edit-ot-quick-time-chips'));
        editOtEndInput.addEventListener('input', () => syncQuickTimeChips('edit-ot-end', 'edit-ot-quick-time-chips'));
    }

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
                        const refreshTasks = [loadHistory(), loadProfileStats(), syncOfflineData()];
                        if (currentUser.role === 'admin') {
                            refreshTasks.push(loadApprovals());
                        }
                        await Promise.all(refreshTasks);
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

    // Cấu hình Tabs Đăng nhập (Nhân viên / Quản lý) trên màn hình Login
    const tabEmployeeBtn = document.getElementById('tab-btn-login-emp') || document.getElementById('btn-tab-employee');
    const tabAdminBtn = document.getElementById('tab-btn-login-admin') || document.getElementById('btn-tab-admin');

    if (tabEmployeeBtn && tabAdminBtn && formLoginEmployee && formLoginAdmin) {
        tabEmployeeBtn.addEventListener('click', () => {
            tabEmployeeBtn.classList.add('active');
            tabAdminBtn.classList.remove('active');
            tabEmployeeBtn.style.background = 'var(--green)';
            tabEmployeeBtn.style.color = '#020604';
            tabAdminBtn.style.background = 'transparent';
            tabAdminBtn.style.color = 'var(--text-sub)';
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
            tabAdminBtn.style.background = 'var(--green)';
            tabAdminBtn.style.color = '#020604';
            tabEmployeeBtn.style.background = 'transparent';
            tabEmployeeBtn.style.color = 'var(--text-sub)';
            formLoginAdmin.classList.add('active');
            formLoginEmployee.classList.remove('active');
            formLoginAdmin.style.display = 'block';
            formLoginEmployee.style.display = 'none';
            const errEl = document.getElementById('login-error-admin');
            if (errEl) errEl.textContent = '';
        });
    }

    // Lắng nghe thay đổi tháng phê duyệt đơn
    const filterApprovalsMonth = document.getElementById('filter-approvals-month');
    if (filterApprovalsMonth) {
        filterApprovalsMonth.addEventListener('change', loadApprovals);
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
        clearMobileAuthSession();
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
                        if (!record) {
                            const byId = await api(`/api/records?id=${encodeURIComponent(id)}`);
                            if (byId && Array.isArray(byId.records) && byId.records.length > 0) {
                                record = byId.records[0];
                            }
                        }
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
        syncQuickTimeChips('edit-ot-end', 'edit-ot-quick-time-chips');
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
                const elBackfillMonthGroup = document.getElementById('edit-ot-backfill-month-group');
                if (elBackfillMonthGroup) elBackfillMonthGroup.style.display = 'block';
                if (elBackfillHours) elBackfillHours.value = record.totalHours;
            } else {
                if (elNormalInputs) elNormalInputs.style.display = 'block';
                if (elBackfillGroup) elBackfillGroup.style.display = 'none';
                const elBackfillMonthGroup = document.getElementById('edit-ot-backfill-month-group');
                if (elBackfillMonthGroup) elBackfillMonthGroup.style.display = 'none';
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

        // Setup predefined reasons for Edit form based on current lunch OT state
        const reasonsList = (teamSettings && teamSettings.predefinedReasons) ? teamSettings.predefinedReasons : [];
        let backfillMonth = '';
        let backfillMonthInputVal = '';
        if (isBackfill && record.note) {
            const match = record.note.match(/tháng\s+([^\s]+)/i);
            if (match) {
                backfillMonth = match[1];
                const myMatch = backfillMonth.match(/^(\d{1,2})\/(\d{4})$/);
                if (myMatch) {
                    backfillMonthInputVal = `${myMatch[2]}-${myMatch[1].padStart(2, '0')}`;
                } else if (/^\d{4}-\d{2}$/.test(backfillMonth)) {
                    backfillMonthInputVal = backfillMonth;
                } else if (/^\d{1,2}$/.test(backfillMonth)) {
                    backfillMonthInputVal = `${new Date().getFullYear()}-${backfillMonth.padStart(2, '0')}`;
                }
            }
        }
        const elBackfillMonth = document.getElementById('edit-ot-backfill-month');
        if (elBackfillMonth) elBackfillMonth.value = backfillMonthInputVal;

        const dateVal = elDate ? elDate.value : '';
        const isSundayOT = dateVal ? new Date(dateVal + 'T00:00:00').getDay() === 0 : false;

        setupMobilePredefinedReasonsSelect(reasonsList, elNote, elLunch.checked, isBackfill, backfillMonth, isSundayOT);

        if (!isBackfill && !isSundayOT) {
            elNote.value = record.note ? record.note.replace('[BÙ THÁNG TRƯỚC] ', '').replace('[BÙ THÁNG TRƯỚC]', '').replace('[TĂNG THÁNG NÀY] ', '').replace('[TĂNG THÁNG NÀY]', '').trim() : '';
        }
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
                    if (e <= s && e > 12 * 60) {
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
