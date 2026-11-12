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

// ==================== PHÊ DUYỆT ĐƠN (DÀNH CHO QUẢN LÝ) ====================
async function loadApprovals() {
    if (!currentUser || currentUser.role !== 'admin') return;

    const monthInput = document.getElementById('filter-approvals-month');
    let month = (monthInput && monthInput.value) ? monthInput.value : getCurrentMonth();
    if (monthInput && !monthInput.value) {
        monthInput.value = month;
    }

    try {
        const [recordsRes, usersRes] = await Promise.all([
            api('/api/records?month=' + month),
            api('/api/users')
        ]);

        const allRecords = (recordsRes && recordsRes.records) ? recordsRes.records : [];
        const allUsers = (usersRes && usersRes.users) ? usersRes.users : [];
        const userMap = new Map(allUsers.map(u => [u.id, u]));

        // Lọc các bản ghi đang chờ duyệt
        const pendingRecords = allRecords.filter(r => r.status === 'pending');
        pendingRecords.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        // Lọc danh sách nhân viên yêu cầu huỷ liên kết thiết bị
        const pendingUnlinks = allUsers.filter(u => u.pendingUnlink === true);

        // Cập nhật thống kê và badge
        const pendingCount = pendingRecords.length;
        const unlinkCount = pendingUnlinks.length;
        const totalPending = pendingCount + unlinkCount;

        const countEl = document.getElementById('approvals-pending-count');
        if (countEl) {
            countEl.textContent = `${totalPending} đơn${unlinkCount > 0 ? ` (${pendingCount} OT, ${unlinkCount} huỷ máy)` : ''}`;
        }

        const badgeEl = document.getElementById('nav-approvals-badge');
        if (badgeEl) {
            if (totalPending > 0) {
                badgeEl.textContent = totalPending > 99 ? '99+' : totalPending;
                badgeEl.style.display = 'inline-block';
            } else {
                badgeEl.style.display = 'none';
            }
        }

        // Render danh sách yêu cầu huỷ thiết bị
        const unlinksSection = document.getElementById('approvals-unlinks-section');
        const unlinksList = document.getElementById('approvals-unlinks-list');
        if (unlinksSection && unlinksList) {
            if (unlinkCount > 0) {
                unlinksSection.style.display = 'block';
                unlinksList.innerHTML = pendingUnlinks.map(u => {
                    const safeName = escapeHTML(u.fullname || u.username);
                    const teamName = escapeHTML(u.team || 'Chưa phân nhóm');
                    const escapedForAttr = (u.fullname || u.username).replace(/'/g, "\\'");
                    return `
                        <div class="approval-card" style="background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.25); border-radius: 12px; padding: 12px; margin-bottom: 10px;">
                            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                                <div>
                                    <div style="font-weight: 700; font-size: 14px; color: #f87171;">${safeName}</div>
                                    <div style="font-size: 11px; color: var(--text-sub); margin-top: 2px;">Nhóm: ${teamName} • @${escapeHTML(u.username)}</div>
                                </div>
                                <span style="background: rgba(239, 68, 68, 0.2); color: #ef4444; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px;">Đổi thiết bị</span>
                            </div>
                            <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 10px;">
                                Nhân viên yêu cầu huỷ liên kết máy cũ để đăng nhập thiết bị mới.
                            </div>
                            <div style="display: flex; gap: 8px;">
                                <button class="btn btn-sm btn-primary" onclick="approveUnlinkMobile('${u.id}', '${escapedForAttr}')" style="flex: 1; padding: 8px 12px; font-size: 13px; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 4px;">
                                    ✓ Duyệt huỷ máy
                                </button>
                                <button class="btn btn-sm btn-danger" onclick="rejectUnlinkMobile('${u.id}', '${escapedForAttr}')" style="flex: 1; padding: 8px 12px; font-size: 13px; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 4px;">
                                    ✕ Từ chối
                                </button>
                            </div>
                        </div>
                    `;
                }).join('');
            } else {
                unlinksSection.style.display = 'none';
                unlinksList.innerHTML = '';
            }
        }

        // Render danh sách đơn OT chờ duyệt
        const recordsList = document.getElementById('approvals-records-list');
        if (recordsList) {
            if (pendingCount === 0) {
                recordsList.innerHTML = `
                    <div class="empty-state" style="padding: 30px 10px; text-align: center;">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48" style="color: var(--text-muted); margin: 0 auto 12px; display: block;">
                            <circle cx="12" cy="12" r="10"/>
                            <polyline points="12 6 12 12 14 14"/>
                        </svg>
                        <p style="color: var(--text-sub); font-size: 13px; margin: 0;">Không có đơn OT nào chờ duyệt trong tháng ${month}</p>
                    </div>
                `;
            } else {
                recordsList.innerHTML = pendingRecords.map(r => {
                    const emp = userMap.get(r.userId) || { fullname: 'Chưa rõ', username: r.userId };
                    const empName = escapeHTML(emp.fullname || emp.username);
                    const empTeam = escapeHTML(emp.team || '');
                    const isBackfill = r.isBackfill || (r.note && (r.note.includes('[BÙ THÁNG TRƯỚC]') || r.note.includes('[TĂNG THÁNG NÀY]')));

                    let tags = '';
                    if (r.hasLunchOT) tags += '<span class="htag htag-lunch" style="font-size: 10px; padding: 1px 5px;">OT Trưa 1h</span> ';
                    if (r.eveningOTHours > 0 && !isBackfill) tags += `<span class="htag htag-evening" style="font-size: 10px; padding: 1px 5px;">OT Chiều ${r.eveningOTHours.toFixed(1)}h</span> `;
                    if (r.customActivity) {
                        tags += `<span class="htag" style="font-size: 10px; padding: 1px 5px; background: rgba(99,102,241,0.15); color: #818cf8; border: 1px solid rgba(99,102,241,0.3);">📋 ${escapeHTML(r.customActivity)}</span> `;
                    }
                    if (r.deliveryProvince) {
                        tags += `<span class="htag" style="font-size: 10px; padding: 1px 5px; background: rgba(245,158,11,0.15); color: #f59e0b; border: 1px solid rgba(245,158,11,0.3);">🚚 ${escapeHTML(r.deliveryProvince)}</span> `;
                    }
                    if (isBackfill) {
                        tags += `<span class="htag htag-backfill" style="font-size: 10px; padding: 1px 5px; background: rgba(245,158,11,0.15); color: #f59e0b; border: 1px solid rgba(245,158,11,0.3);">⚠️ Bù tháng trước</span> `;
                    }

                    const cleanNote = r.note ? r.note.replace('[BÙ THÁNG TRƯỚC] ', '').replace('[BÙ THÁNG TRƯỚC]', '').replace('[TĂNG THÁNG NÀY] ', '').replace('[TĂNG THÁNG NÀY]', '').trim() : '';

                    return `
                        <div class="approval-card" style="background: rgba(255, 255, 255, 0.03); border: 1px solid var(--border-color); border-radius: 12px; padding: 12px; margin-bottom: 12px;">
                            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                                <div>
                                    <div style="display: flex; align-items: center; gap: 6px;">
                                        <strong style="font-size: 14px; color: var(--text-main);">${empName}</strong>
                                        ${empTeam ? `<span style="font-size: 10px; background: rgba(255,255,255,0.08); padding: 1px 6px; border-radius: 4px; color: var(--text-sub);">${empTeam}</span>` : ''}
                                    </div>
                                    <div style="font-size: 12px; color: var(--accent-cyan); font-weight: 600; margin-top: 3px;">
                                        📅 ${fmtDate(r.date)}
                                    </div>
                                </div>
                                <div style="text-align: right;">
                                    <span style="font-size: 16px; font-weight: 800; color: var(--green);">${(r.totalHours || 0).toFixed(1)}h</span>
                                </div>
                            </div>

                            ${tags ? `<div style="margin-bottom: 8px; display: flex; flex-wrap: wrap; gap: 4px;">${tags}</div>` : ''}

                            ${cleanNote ? `<div style="font-size: 12px; color: var(--text-sub); background: rgba(0,0,0,0.15); padding: 6px 10px; border-radius: 6px; margin-bottom: 10px; word-break: break-word;">📝 ${escapeHTML(cleanNote)}</div>` : ''}

                            <div style="display: flex; gap: 8px; margin-top: 8px;">
                                <button class="btn btn-sm btn-primary" onclick="approveRecordMobile('${r.id}')" style="flex: 1; padding: 8px 12px; font-size: 13px; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 4px; background: var(--green); border-color: var(--green); color: #000;">
                                    ✓ Duyệt
                                </button>
                                <button class="btn btn-sm btn-danger" onclick="rejectRecordMobile('${r.id}')" style="flex: 1; padding: 8px 12px; font-size: 13px; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 4px;">
                                    ✕ Từ chối
                                </button>
                            </div>
                        </div>
                    `;
                }).join('');
            }
        }
    } catch (err) {
        console.error('Lỗi tải danh sách phê duyệt:', err);
    }
}

async function approveRecordMobile(recordId) {
    try {
        await api(`/api/records/${recordId}`, 'PUT', { status: 'approved' });
        showToast('Đã phê duyệt đơn thành công!');
        await loadApprovals();
    } catch (err) {
        console.error('Lỗi duyệt đơn:', err);
        showToast(err.message || 'Lỗi khi duyệt đơn', 'error');
    }
}

async function rejectRecordMobile(recordId) {
    const confirmed = await showConfirm('Bạn có chắc chắn muốn từ chối đơn này không?', 'Từ chối', 'btn btn-danger');
    if (!confirmed) return;
    try {
        await api(`/api/records/${recordId}`, 'PUT', { status: 'rejected' });
        showToast('Đã từ chối đơn!');
        await loadApprovals();
    } catch (err) {
        console.error('Lỗi từ chối đơn:', err);
        showToast(err.message || 'Lỗi khi từ chối đơn', 'error');
    }
}

async function approveUnlinkMobile(userId, fullname) {
    const confirmed = await showConfirm(`Xác nhận duyệt huỷ liên kết thiết bị cho "${fullname}"? Nhân viên sẽ có thể đăng nhập trên máy mới.`, 'Duyệt huỷ máy', 'btn btn-primary');
    if (!confirmed) return;
    try {
        await api(`/api/users/${userId}`, 'PUT', { deviceId: null, browserDeviceId: null, pendingUnlink: false });
        showToast('Đã huỷ liên kết thiết bị thành công!');
        await loadApprovals();
    } catch (err) {
        console.error('Lỗi duyệt huỷ thiết bị:', err);
        showToast(err.message || 'Lỗi huỷ thiết bị', 'error');
    }
}

async function rejectUnlinkMobile(userId, fullname) {
    const confirmed = await showConfirm(`Từ chối yêu cầu huỷ liên kết thiết bị của "${fullname}"?`, 'Từ chối', 'btn btn-danger');
    if (!confirmed) return;
    try {
        await api(`/api/users/${userId}`, 'PUT', { pendingUnlink: false });
        showToast('Đã từ chối yêu cầu huỷ thiết bị!');
        await loadApprovals();
    } catch (err) {
        console.error('Lỗi từ chối huỷ thiết bị:', err);
        showToast(err.message || 'Lỗi từ chối', 'error');
    }
}

// Expose functions globally to window for onclick handlers to function reliably in all environments
window.editRecordDialog = editRecordDialog;
window.deleteRecord = deleteRecord;
window.loadApprovals = loadApprovals;
window.approveRecordMobile = approveRecordMobile;
window.rejectRecordMobile = rejectRecordMobile;
window.approveUnlinkMobile = approveUnlinkMobile;
window.rejectUnlinkMobile = rejectUnlinkMobile;

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
                            const targetKey = urlB64ToUint8Array(res.publicKey);
                            const subscribeOptions = {
                                userVisibleOnly: true,
                                applicationServerKey: targetKey
                            };
                            
                            subscription = await registration.pushManager.getSubscription();
                            if (subscription) {
                                let keyMatches = false;
                                if (subscription.options && subscription.options.applicationServerKey) {
                                    const currentKey = new Uint8Array(subscription.options.applicationServerKey);
                                    if (currentKey.length === targetKey.length) {
                                        keyMatches = currentKey.every((val, idx) => val === targetKey[idx]);
                                    }
                                }
                                if (!keyMatches) {
                                    await subscription.unsubscribe();
                                    subscription = null;
                                }
                            }
                            
                            if (!subscription) {
                                subscription = await registration.pushManager.subscribe(subscribeOptions);
                                console.log('[Web Push] Đăng ký Subscription mới thành công:', subscription);
                            }
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
