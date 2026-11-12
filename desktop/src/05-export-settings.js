function loadScript(src) {
    return new Promise((resolve, reject) => {
        const exists = document.querySelector(`script[src="${src}"]`);
        if (exists) {
            if (window.ExcelJS) return resolve();
            exists.onload = resolve;
            exists.onerror = reject;
            return;
        }
        const s = document.createElement('script');
        s.src = src;
        s.onload = resolve;
        s.onerror = reject;
        document.body.appendChild(s);
    });
}

async function exportExcel() {
    if (typeof ExcelJS === 'undefined') {
        const originalBtn = document.activeElement;
        let originalText = '';
        if (originalBtn && originalBtn.tagName === 'BUTTON') {
            originalBtn.disabled = true;
            originalText = originalBtn.textContent;
            originalBtn.textContent = 'Đang tải thư viện Excel...';
        }
        try {
            await loadScript('exceljs.min.js');
        } catch (err) {
            showToast('Lỗi tải thư viện Excel, vui lòng thử lại!', 'error');
            if (originalBtn) {
                originalBtn.disabled = false;
                originalBtn.textContent = originalText;
            }
            return;
        }
        if (originalBtn) {
            originalBtn.disabled = false;
            originalBtn.textContent = originalText;
        }
    }

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
            const isBackfill = r.isBackfill || (r.note && (r.note.includes('[BÙ THÁNG TRƯỚC]') || r.note.includes('[TĂNG THÁNG NÀY]')));
            // Lọc phía client: loại bỏ bản ghi không phải backfill mà ngày không thuộc tháng đang xem
            if (!isBackfill && !r.date.startsWith(month)) return false;
            return r.status === 'approved' || (!isBackfill && r.status !== 'pending' && r.status !== 'rejected');
        });

        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        const exportTime = `${formatDateFull(now)} lúc ${timeStr}`;

        // Khởi tạo workbook mới của ExcelJS
        const workbook = new ExcelJS.Workbook();
        
        // ------------------ SHEET 1: TỔNG HỢP ------------------
        const wsSummary = workbook.addWorksheet('Tổng Hợp', {
            views: [{ showGridLines: true }]
        });

        const holidays = (currentSystemSettings.holidays || "")
            .split(',')
            .map(d => d.trim())
            .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d));

        // 1. Tiêu đề chính
        wsSummary.mergeCells('A1:H1');
        const title1 = wsSummary.getCell('A1');
        title1.value = `BÁO CÁO TĂNG CA THÁNG ${displayMonth}`;
        title1.font = { name: 'Times New Roman', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
        title1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B365D' } }; // Navy Blue đậm
        title1.alignment = { vertical: 'middle', horizontal: 'center' };
        wsSummary.getRow(1).height = 40;

        // 2. Ngày xuất báo cáo
        wsSummary.mergeCells('A2:H2');
        const subtitle1 = wsSummary.getCell('A2');
        subtitle1.value = `Ngày xuất báo cáo: ${exportTime}`;
        subtitle1.font = { name: 'Times New Roman', size: 10, italic: true, color: { argb: 'FF4B5563' } };
        subtitle1.alignment = { vertical: 'middle', horizontal: 'center' };
        wsSummary.getRow(2).height = 20;

        // 3. Dòng trống
        wsSummary.getRow(3).height = 15;

        // 4. Tiêu đề bảng
        wsSummary.getCell('A4').value = "I. BẢNG TỔNG HỢP GIỜ TĂNG CA & CHUYẾN ĐI XE";
        wsSummary.getCell('A4').font = { name: 'Times New Roman', size: 12, bold: true, color: { argb: 'FF1F2937' } };
        wsSummary.getRow(4).height = 22;

        // 5. Headers
        const headers1 = ["STT", "Họ và tên", "Team", "Mã nhân viên", "Số ngày OT", "Tổng OT thực tế (giờ)", "Tổng OT quy đổi (giờ)", "Tổng chuyến xe"];
        wsSummary.getRow(5).values = headers1;
        wsSummary.getRow(5).height = 28;
        wsSummary.getRow(5).font = { name: 'Times New Roman', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
        
        for (let col = 1; col <= 8; col++) {
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

        // 6. Dữ liệu nhân viên
        let summaryStartRow = 6;
        const activeUsers = users.filter(u => records.some(r => r.userId === u.id));
        
        activeUsers.forEach((u, i) => {
            const ur = records.filter(r => r.userId === u.id);
            const days = ur.length;
            const trips = ur.filter(r => r.calcMode === 'trip' || (!r.calcMode && r.deliveryProvince && r.deliveryProvince.trim() !== '')).length;
            const totalH = ur.reduce((s, r) => s + (r.totalHours || 0), 0);
            const totalEqH = ur.reduce((s, r) => {
                const coef = getOTCoefficient(r.date, holidays);
                return s + ((r.totalHours || 0) * coef);
            }, 0);

            const rowNum = summaryStartRow + i;
            const row = wsSummary.getRow(rowNum);
            row.values = [
                i + 1,
                u.fullname,
                u.team === 'admin' ? 'admin' : (u.team || 'Chưa phân team'),
                u.username,
                days,
                totalH,
                totalEqH,
                trips
            ];
            row.height = 22;
            row.font = { name: 'Times New Roman', size: 10 };

            for (let col = 1; col <= 8; col++) {
                const cell = row.getCell(col);
                cell.border = {
                    top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
                    left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
                    bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
                    right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
                };

                cell.alignment = { vertical: 'middle', horizontal: 'center' };

                if (col === 1 || col === 5 || col === 8) {
                    cell.numFmt = '0';
                } else if (col === 6 || col === 7) {
                    cell.numFmt = '#,##0.0';
                }
            }
        });

        // Thiết lập bộ lọc tự động cho Summary Sheet
        wsSummary.autoFilter = 'A5:H' + (summaryStartRow + activeUsers.length - 1);

        // Kiểm tra xem có dữ liệu OT hoặc Chuyến đi nào không để ẩn cột tương ứng
        const totalOTAllUsers = activeUsers.reduce((sum, u) => {
            const ur = records.filter(r => r.userId === u.id);
            return sum + ur.reduce((s, r) => s + (r.totalHours || 0), 0);
        }, 0);

        const totalTripsAllUsers = activeUsers.reduce((sum, u) => {
            const ur = records.filter(r => r.userId === u.id);
            return sum + ur.filter(r => r.calcMode === 'trip' || (!r.calcMode && r.deliveryProvince && r.deliveryProvince.trim() !== '')).length;
        }, 0);

        // Ẩn cột ở sheet Tổng Hợp nếu không có dữ liệu
        if (totalOTAllUsers === 0) {
            wsSummary.getColumn(6).hidden = true; // Cột F: Tổng OT thực tế
            wsSummary.getColumn(7).hidden = true; // Cột G: Tổng OT quy đổi
        }
        if (totalTripsAllUsers === 0) {
            wsSummary.getColumn(8).hidden = true; // Cột H: Tổng chuyến xe
        }

        // Độ rộng cột
        wsSummary.columns = [
            { width: 8 },   // STT
            { width: 28 },  // Họ và tên
            { width: 18 },  // Nhóm
            { width: 16 },  // Mã nhân viên
            { width: 14 },  // Số ngày OT
            { width: 20 },  // Tổng OT thực tế
            { width: 20 },  // Tổng OT quy đổi
            { width: 18 }   // Tổng chuyến xe
        ];

        // ------------------ SHEET 2: CHI TIẾT ------------------
        const wsDetail = workbook.addWorksheet('Chi Tiết', {
            views: [{ showGridLines: true }]
        });

        // 1. Tiêu đề chính
        wsDetail.mergeCells('A1:K1');
        const title2 = wsDetail.getCell('A1');
        title2.value = `CHI TIẾT TĂNG CA THÁNG ${displayMonth}`;
        title2.font = { name: 'Times New Roman', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
        title2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B365D' } }; // Navy Blue đậm
        title2.alignment = { vertical: 'middle', horizontal: 'center' };
        wsDetail.getRow(1).height = 40;

        // 2. Ngày xuất báo cáo
        wsDetail.mergeCells('A2:K2');
        const subtitle2 = wsDetail.getCell('A2');
        subtitle2.value = `Ngày xuất báo cáo: ${exportTime}`;
        subtitle2.font = { name: 'Times New Roman', size: 10, italic: true, color: { argb: 'FF4B5563' } };
        subtitle2.alignment = { vertical: 'middle', horizontal: 'center' };
        wsDetail.getRow(2).height = 20;

        // 3. Dòng trống
        wsDetail.getRow(3).height = 15;

        // 4. Tiêu đề bảng
        wsDetail.getCell('A4').value = "II. BẢNG CHI TIẾT TĂNG CA TỪNG NGÀY";
        wsDetail.getCell('A4').font = { name: 'Times New Roman', size: 12, bold: true, color: { argb: 'FF1F2937' } };
        wsDetail.getRow(4).height = 22;

        // 5. Headers
        const headers2 = ["STT", "Ngày", "Họ và tên", "Team", "Mã nhân viên", "Thời gian OT", "Hệ số", "Giờ thực tế (giờ)", "Giờ quy đổi (giờ)", "Hoạt động / Chuyến đi", "Ghi chú"];
        wsDetail.getRow(5).values = headers2;
        wsDetail.getRow(5).height = 28;
        wsDetail.getRow(5).font = { name: 'Times New Roman', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
        
        for (let col = 1; col <= 11; col++) {
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

        // 6. Điền dữ liệu chi tiết
        let currentDetailRow = 6;
        let detailedIdx = 1;
        let isFirstUser = true;

        activeUsers.forEach(u => {
            const userRecords = records.filter(r => r.userId === u.id);
            if (userRecords.length === 0) return;
            userRecords.sort((a, b) => a.date.localeCompare(b.date));

            // Thêm dòng trống ngăn cách giữa các nhân viên
            if (!isFirstUser) {
                wsDetail.addRow([]);
                wsDetail.getRow(currentDetailRow).height = 14;
                for (let col = 1; col <= 11; col++) {
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
                let timeRange = '—';
                if (r.hasLunchOT && r.eveningOTHours > 0) {
                    timeRange = `12:20-13:20, ${r.otStart}-${r.otEnd}`;
                } else if (r.hasLunchOT) {
                    timeRange = '12:20-13:20';
                } else if (r.eveningOTHours > 0) {
                    timeRange = `${r.otStart}-${r.otEnd}`;
                }

                let activityVal = '—';
                if (r.customActivity) {
                    if (r.calcMode === 'trip') {
                        activityVal = `${r.customActivity}${r.deliveryProvince ? ': ' + r.deliveryProvince : ''}`;
                    } else {
                        activityVal = r.customActivity;
                    }
                } else if (r.deliveryProvince && r.deliveryProvince.trim() !== '') {
                    activityVal = r.deliveryProvince;
                }

                const coef = getOTCoefficient(r.date, holidays);
                const actualHours = r.totalHours || 0;
                const eqHours = actualHours * coef;

                const row = wsDetail.getRow(currentDetailRow);
                row.values = [
                    detailedIdx++,
                    new Date(r.date + 'T00:00:00Z'),
                    u.fullname,
                    u.team === 'admin' ? 'admin' : (u.team || 'Chưa phân team'),
                    u.username,
                    timeRange,
                    coef,
                    actualHours,
                    eqHours,
                    activityVal,
                    r.note || '—'
                ];
                row.height = 22;
                row.font = { name: 'Times New Roman', size: 10 };

                for (let col = 1; col <= 11; col++) {
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
                    } else if (col === 2) {
                        cell.numFmt = 'dd/mm/yyyy';
                    } else if (col === 7) {
                        cell.numFmt = '0.0';
                    } else if (col === 8 || col === 9) {
                        cell.numFmt = '#,##0.0';
                    }
                }
                currentDetailRow++;
            });
        });

        // 7. Tổng cộng chi tiết
        if (detailedIdx > 1) {
            // Áp dụng bộ lọc cho toàn bộ vùng dữ liệu chi tiết (từ dòng 5 đến dòng cuối cùng trước dòng tổng cộng)
            wsDetail.autoFilter = 'A5:K' + (currentDetailRow - 1);
        } else {
            wsDetail.mergeCells(`A${currentDetailRow}:K${currentDetailRow}`);
            const emptyCell = wsDetail.getCell(`A${currentDetailRow}`);
            emptyCell.value = "Chưa có dữ liệu chi tiết tăng ca cho tháng này.";
            emptyCell.alignment = { vertical: 'middle', horizontal: 'center' };
            wsDetail.getRow(currentDetailRow).height = 30;
        }

        // Độ rộng cột sheet Chi tiết
        wsDetail.columns = [
            { width: 8 },   // STT
            { width: 14 },  // Ngày
            { width: 28 },  // Họ và tên
            { width: 18 },  // Nhóm
            { width: 16 },  // Mã nhân viên
            { width: 24 },  // Thời gian OT
            { width: 12 },  // Hệ số
            { width: 18 },  // Giờ thực tế
            { width: 18 },  // Giờ quy đổi
            { width: 20 },  // Đi xe (Tỉnh)
            { width: 35 }   // Ghi chú
        ];

        // Ẩn cột ở sheet Chi Tiết nếu không có dữ liệu
        if (totalOTAllUsers === 0) {
            wsDetail.getColumn(6).hidden = true; // Cột F: Thời gian OT
            wsDetail.getColumn(7).hidden = true; // Cột G: Hệ số
            wsDetail.getColumn(8).hidden = true; // Cột H: Giờ thực tế (giờ)
            wsDetail.getColumn(9).hidden = true; // Cột I: Giờ quy đổi (giờ)
        }
        if (totalTripsAllUsers === 0) {
            const hasCustomActivities = records.some(r => r.customActivity && r.calcMode !== 'trip');
            if (!hasCustomActivities) {
                wsDetail.getColumn(10).hidden = true; // Cột J: Hoạt động / Chuyến đi
            }
        }

        // 8. Lưu file Excel
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `bao-cao-tang-ca-chi-tiet-${month}.xlsx`;
        a.click();
        window.URL.revokeObjectURL(url);

        showToast('Đã xuất file Excel chi tiết có định dạng!');
    } catch (e) {
        showToast('Lỗi xuất Excel: ' + e.message, 'error');
        console.error(e);
    }
}

async function handleCloseMonth() {
    const month = document.getElementById('report-filter-month').value;
    if (!month) {
        showToast('Vui lòng chọn tháng cần chốt công!', 'error');
        return;
    }

    // Bước 1: Yêu cầu tải báo cáo Excel trước
    showModal(
        'Xác nhận Chốt công & Khóa tháng',
        `<p style="font-size: 14px; line-height: 1.6; color: var(--text-primary);">
            Hệ thống yêu cầu bạn đã xuất báo cáo Excel lưu trữ về máy tính trước khi thực hiện.<br><br>
            <strong>Bạn đã tải báo cáo Excel tháng ${month} về chưa?</strong>
         </p>`,
        [
            {
                text: 'Chưa tải (Tải ngay)',
                class: 'btn-ghost',
                action: async () => {
                    await exportExcel();
                }
            },
            {
                text: 'Đã tải (Khóa tháng)',
                class: 'btn-primary',
                action: () => {
                    setTimeout(() => {
                        // Bước 2: Cảnh báo và xác nhận khóa tháng
                        showModal(
                            'XÁC NHẬN KHÓA THÁNG',
                            `<p style="font-size: 14px; line-height: 1.6; color: var(--text-primary);">
                                Thao tác này sẽ **khóa ghi nhận tăng ca** của tháng ${month}.<br><br>
                                Sau khi khóa, nhân viên đăng ký OT trong tháng này sẽ phải được **Quản lý phê duyệt** mới được tính.<br><br>
                                Bạn có chắc chắn muốn khóa tháng ${month}?
                             </p>`,
                            [
                                {
                                    text: 'Hủy bỏ',
                                    class: 'btn-ghost',
                                    action: null
                                },
                                {
                                    text: 'Xác nhận khóa tháng',
                                    class: 'btn-warning',
                                    action: async () => {
                                        try {
                                            showToast('Đang thực hiện khóa tháng...');
                                            const res = await api('/api/records/close-month', 'POST', { month });
                                            showToast('Khóa tháng thành công!');
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

let currentSystemSettings = {};

async function loadSystemSettings() {
    try {
        const settings = await api('/api/settings');
        if (settings) {
            currentSystemSettings = settings;
            OT_LUNCH_HOURS = Number(settings.lunchOTHours) || 1;
            WORK_END = settings.eveningOTStart || "16:30";
            

        }
    } catch (e) {
        console.error('Error loading system settings:', e);
    }
}





async function handleDatabaseCleanup() {
    const monthInput = document.getElementById('cleanup-month-input');
    if (!monthInput) return;
    const month = monthInput.value;
    if (!month) {
        showToast('Vui lòng chọn tháng cần dọn dẹp!', 'error');
        return;
    }

    // Bước 1: Yêu cầu tải báo cáo Excel trước
    showModal(
        'Xác nhận Chốt công & Dọn dẹp',
        `<p style="font-size: 14px; line-height: 1.6; color: var(--text-primary);">
            Hệ thống yêu cầu bạn đã xuất báo cáo Excel lưu trữ về máy tính trước khi thực hiện.<br><br>
            <strong>Bạn đã tải báo cáo Excel tháng ${month} về chưa?</strong>
         </p>`,
        [
            {
                text: 'Chưa tải (Tải ngay)',
                class: 'btn-ghost',
                action: async () => {
                    const originalFilterVal = document.getElementById('report-filter-month').value;
                    document.getElementById('report-filter-month').value = month;
                    await exportExcel();
                    document.getElementById('report-filter-month').value = originalFilterVal;
                }
            },
            {
                text: 'Đã tải (Tiếp tục dọn dẹp)',
                class: 'btn-primary',
                action: () => {
                    setTimeout(() => {
                        // Bước 2: Cảnh báo xóa dữ liệu vĩnh viễn trên Server
                        showModal(
                            'CẢNH BÁO QUAN TRỌNG',
                            `<p style="font-size: 14px; line-height: 1.6; color: var(--accent-red); font-weight: 600;">
                                CẢNH BÁO: Tất cả dữ liệu tăng ca của tháng ${month} và các tháng cũ hơn sẽ bị xóa sạch khỏi Server.<br><br>
                                Hệ thống sẽ tự động tạo file sao lưu trên Server và GitHub Gist, tuy nhiên dữ liệu hiển thị hiện tại sẽ bị xóa vĩnh viễn.<br><br>
                                Thao tác này KHÔNG THỂ HOÀN TÁC! Bạn vẫn muốn tiếp tục?
                             </p>`,
                            [
                                {
                                    text: 'Hủy bỏ',
                                    class: 'btn-ghost',
                                    action: null
                                },
                                {
                                    text: 'Xác nhận xóa dữ liệu',
                                    class: 'btn-danger',
                                    action: async () => {
                                        try {
                                            showToast('Đang thực hiện dọn dẹp...');
                                            const res = await api('/api/records/cleanup', 'POST', { month });
                                            showToast('Dọn dẹp dữ liệu thành công!');
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
