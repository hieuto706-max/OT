// ==================== EVENT LISTENERS ====================
document.addEventListener('DOMContentLoaded', () => {
    if (!isElectron) {
        document.body.classList.add('is-web-browser');
    }
    syncAdminThemeUI();
    syncDensityUI();
    syncKpiCollapseUI();

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
        // Ghi nhận trạng thái phiên ngay đồng bộ lúc mới mở trang để tránh race condition nếu người dùng đăng nhập trong lúc đang chờ mạng
        let initialSessionActive = null;
        try {
            initialSessionActive = window.sessionStorage.getItem('ot_session_active');
            if (isElectron) {
                window.sessionStorage.setItem('ot_session_active', 'true');
            }
        } catch (e) {}

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

            // Nếu là phiên làm việc mới (app bị tắt hoàn toàn và bật lại) VÀ người dùng chưa tự đăng nhập mới trong lúc chờ ở trên
            if (isElectron && !initialSessionActive && !hasManualLoginInThisPageLoad) {
                // Nếu không phải là cập nhật (phiên bản cũ và mới giống nhau)
                if (storedVersion === currentVersion) {
                    // Tắt app hoàn toàn và bật lại bản cũ -> bắt đăng nhập lại, dọn sạch session cũ
                    clearAuthSession();
                } else {
                    // Đây là cập nhật phiên bản -> giữ nguyên login, chỉ cập nhật version lưu trữ
                    localStorage.setItem('ot_app_version', currentVersion);
                }
            } else {
                // Trên web hoặc đã đăng nhập thủ công, chỉ cập nhật version lưu trữ, không log out
                localStorage.setItem('ot_app_version', currentVersion);
            }
        } catch (e) {
            console.error('Lỗi kiểm tra phiên bản:', e);
            const verEl = document.getElementById('login-version');
            if (verEl) {
                const valEl = verEl.querySelector('.login-ver-val');
                if (valEl) {
                    valEl.textContent = 'v' + (window.OT_LOCAL_VERSION || '1.6.2');
                } else {
                    verEl.textContent = 'Phiên bản v' + (window.OT_LOCAL_VERSION || '1.6.2');
                }
            }
        }

        // Nếu người dùng đã chủ động đăng nhập xong trong lúc chờ initCloudConfig / version ở trên,
        // proceedLogin đã khởi tạo Dashboard đầy đủ -> không ghi đè hay khởi tạo lại lần 2
        if (hasManualLoginInThisPageLoad) {
            initSseConnection();
            return;
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
                            clearAuthSession();
                            window.location.reload();
                            return;
                        }
                    }
                } catch (e) {
                    clearAuthSession();
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
                    clearAuthSession();
                    const needsOtPrefix = window.location.hostname.includes('github.io');
                    const mainPageUrl = needsOtPrefix ? '/OT/index.html' : '/index.html';
                    window.location.href = mainPageUrl;
                }
            }
        } else {
            // Nếu không có session trên bản Web, chuyển hướng thẳng về Landing Page
            if (!isElectron) {
                clearAuthSession();
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
            const pendingSubTab = document.querySelector('.sub-tab[data-subtab="records-pending"]') || document.querySelector('.sub-tab[data-subtab="subtab-content-records-pending"]');
            if (pendingSubTab) pendingSubTab.click();
        });
    }

    const cardPendingUnlinks = document.getElementById('stat-card-pending-unlinks');
    if (cardPendingUnlinks) {
        cardPendingUnlinks.addEventListener('click', () => {
            const usersTab = document.querySelector('.admin-tab[data-admin-tab="users"]');
            if (usersTab) usersTab.click();
            const employeesSubTab = document.querySelector('.sub-tab[data-subtab="employees"]') || document.querySelector('.sub-tab[data-subtab="subtab-content-employees"]');
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
                    if (e <= s && e > 12 * 60) {
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
                    const backfillMonthGroup = document.getElementById('admin-ot-backfill-month-group');
                    if (backfillMonthGroup) backfillMonthGroup.style.display = 'block';
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
                    const backfillMonthGroup = document.getElementById('admin-ot-backfill-month-group');
                    if (backfillMonthGroup) backfillMonthGroup.style.display = 'none';
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
            handleAdminDateChange();
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
            if (e <= s && e > 12 * 60) {
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
                const backfillMonthGroup = document.getElementById('ot-backfill-month-group');
                if (backfillMonthGroup) backfillMonthGroup.style.display = 'block';
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
                const backfillMonthGroup = document.getElementById('ot-backfill-month-group');
                if (backfillMonthGroup) backfillMonthGroup.style.display = 'none';
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
            const data = await api(`/api/records?id=${encodeURIComponent(recordId)}`);
            const foundList = data.records || [];
            record = foundList.find(r => r.id === recordId);
        }
        if (!record) return showToast('Không tìm thấy bản ghi', 'error');

        const isBackfill = record.isBackfill || (record.note && (record.note.includes('[BÙ THÁNG TRƯỚC]') || record.note.includes('[TĂNG THÁNG NÀY]')));
        let backfillMonth = '';
        if (isBackfill && record.note) {
            const match = record.note.match(/tháng\s+([^\s]+)/i);
            if (match) {
                backfillMonth = match[1];
            }
        }
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

            <!-- Backfill month input -->
            <div class="form-group" id="modal-rec-backfill-month-group" style="display: ${isBackfill ? 'block' : 'none'}; margin-bottom: 15px;">
                <label style="display:block;margin-bottom:6px;font-weight:600;">Tháng bị thiếu</label>
                <input type="text" id="modal-rec-backfill-month" placeholder="Ví dụ: 07/2026 hoặc 07" class="input-sm" style="width:100%; box-sizing:border-box; height:38px; border-radius:8px;" value="${backfillMonth}">
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
                const backfillMonthGroup = document.getElementById('modal-rec-backfill-month-group');
                const customActGroup = document.getElementById('modal-rec-custom-activity-group');
                if (this.checked) {
                    if (normalInputs) normalInputs.style.display = 'none';
                    if (backfillGroup) backfillGroup.style.display = 'block';
                    if (backfillMonthGroup) backfillMonthGroup.style.display = 'block';
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
                    if (backfillMonthGroup) backfillMonthGroup.style.display = 'none';
                }
            });
        }

        const modalStart = document.getElementById('modal-rec-start');
        const modalEnd = document.getElementById('modal-rec-end');
        if (modalStart && modalEnd) {
            const syncModalEnd = () => {
                const s = timeToMinutes(modalStart.value);
                const e = timeToMinutes(modalEnd.value);
                if (e <= s && e > 12 * 60) {
                    modalEnd.value = modalStart.value;
                }
            };
            modalStart.addEventListener('change', syncModalEnd);
            modalStart.addEventListener('input', syncModalEnd);
        }
        
        const modalRecLunch = document.getElementById('modal-rec-lunch');
        const modalRecBackfill = document.getElementById('modal-rec-backfill');
        const modalRecBackfillMonth = document.getElementById('modal-rec-backfill-month');
        const modalRecDate = document.getElementById('modal-rec-date');
        const modalRecNote = document.getElementById('modal-rec-note');
        const updateModalPredefinedReasons = () => {
            const isLunchChecked = modalRecLunch ? modalRecLunch.checked : false;
            const isBackfillChecked = modalRecBackfill ? modalRecBackfill.checked : false;
            const backfillMonthVal = modalRecBackfillMonth ? modalRecBackfillMonth.value.trim() : '';
            const dateVal = modalRecDate ? modalRecDate.value : '';
            const isSunday = dateVal ? new Date(dateVal + 'T00:00:00').getDay() === 0 : false;
            setupPredefinedReasonsSelect(userTeam, modalRecNote, isLunchChecked, isBackfillChecked, backfillMonthVal, isSunday);
        };
        if (modalRecLunch) {
            modalRecLunch.addEventListener('change', updateModalPredefinedReasons);
        }
        if (modalRecBackfill) {
            modalRecBackfill.addEventListener('change', updateModalPredefinedReasons);
        }
        if (modalRecBackfillMonth) {
            modalRecBackfillMonth.addEventListener('input', updateModalPredefinedReasons);
            modalRecBackfillMonth.addEventListener('change', updateModalPredefinedReasons);
        }
        if (modalRecDate) {
            modalRecDate.addEventListener('change', updateModalPredefinedReasons);
            modalRecDate.addEventListener('input', updateModalPredefinedReasons);
        }
        updateModalPredefinedReasons();
        
        const initialDateVal = modalRecDate ? modalRecDate.value : '';
        const initialIsSunday = initialDateVal ? new Date(initialDateVal + 'T00:00:00').getDay() === 0 : false;
        if (modalRecNote && !isBackfill && !initialIsSunday) {
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

