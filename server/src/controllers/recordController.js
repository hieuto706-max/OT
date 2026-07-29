const fs = require('fs');
const path = require('path');
const https = require('https');
const config = require('../../config');
const webpush = require('web-push');
const UserRepository = require('../repositories/userRepository');
const RecordRepository = require('../repositories/recordRepository');
const TeamRepository = require('../repositories/teamRepository');
const { generateId, logError } = require('../../utils');
const { loadDB, saveDB, getDbPath } = require('../../db');
const { sendJSON, sendError, parseBody } = require('../utils/http');

const RecordController = {
    async handle(req, res, urlPath, method) {
        if (urlPath === '/api/records' && method === 'GET') {
            return this.getAll(req, res);
        }
        if (urlPath === '/api/records' && method === 'POST') {
            return this.create(req, res);
        }
        if (urlPath.startsWith('/api/records/') && method === 'DELETE') {
            return this.delete(req, res, urlPath);
        }
        if (urlPath.startsWith('/api/records/') && method === 'PUT') {
            return this.update(req, res, urlPath);
        }
        if (urlPath === '/api/records/closed-months' && method === 'GET') {
            return this.getClosedMonths(req, res);
        }
        if (urlPath === '/api/records/close-month' && method === 'POST') {
            return this.closeMonth(req, res);
        }
        if (urlPath === '/api/records/cleanup' && method === 'POST') {
            return this.cleanup(req, res);
        }

        return sendError(res, 404, 'Endpoint không tồn tại');
    },

    async getAll(req, res) {
        const { userId: reqUserId } = req;
        const url = new URL(req.url, `http://${req.headers.host}`);
        const userId = url.searchParams.get('userId');
        const month = url.searchParams.get('month');

        let records = await RecordRepository.getAll();
        // Clone để tránh sửa trực tiếp vào cache nếu có xử lý mảng tiếp theo
        records = [...records];

        // Lọc records theo team nếu requester là Sub-admin
        if (reqUserId) {
            const users = await UserRepository.getAll();
            const reqUser = users.find(u => u.id === reqUserId);
            const reqIsSuperAdmin = reqUser && (reqUser.isSuperAdmin || reqUser.username === 'admin');

            // Ẩn records của Super Admin đối với người dùng thông thường
            if (!reqIsSuperAdmin) {
                const superAdminIds = users.filter(u => u.isSuperAdmin || u.username === 'admin').map(u => u.id);
                records = records.filter(r => !superAdminIds.includes(r.userId));
            }

            if (reqUser && reqUser.role === 'admin' && !reqIsSuperAdmin && reqUser.team !== 'admin') {
                const reqUserTeam = reqUser.team || '';
                const allowedUserIds = users
                    .filter(u => u.role === 'admin' || (reqUserTeam && u.team === reqUserTeam) || !u.team)
                    .map(u => u.id);
                records = records.filter(r => allowedUserIds.includes(r.userId));
            }
        }

        if (userId) records = records.filter(r => r.userId === userId);
        if (month) {
            records = records.filter(r => r.createdMonth === month || (!r.createdMonth && r.date.startsWith(month)));
        }
        records.sort((a, b) => b.date.localeCompare(a.date));
        return sendJSON(res, 200, { records });
    },

    async create(req, res) {
        const { userId: reqUserId, userRole: reqUserRole } = req;
        const body = await parseBody(req);
        const { userId, date, hasLunchOT, otStart, otEnd, eveningOTHours, totalHours, note, deliveryProvince } = body;
        if (!userId || !date) return sendError(res, 400, 'Thiếu thông tin!');

        // Phân quyền: Nhân viên chỉ được tạo bản ghi cho chính mình
        if (reqUserRole === 'employee' && reqUserId !== userId) {
            return sendError(res, 403, 'Bạn chỉ được ghi nhận tăng ca cho chính mình!', req);
        }

        const isUserExists = await UserRepository.existsById(userId);
        if (!isUserExists) {
            return sendError(res, 401, 'Tài khoản của bạn đã bị xóa khỏi hệ thống!');
        }

        const today = new Date(Date.now() + 7 * 3600000).toISOString().split('T')[0];
        if (date > today) {
            return sendError(res, 400, 'Không thể đăng ký tăng ca cho ngày tương lai!');
        }

        // Check for existing record on same date
        const allRecords = await RecordRepository.getAll();
        const existingIdx = allRecords.findIndex(r => r.userId === userId && r.date === date);
        const recordMonth = date.substring(0, 7);
        const currentMonth = today.substring(0, 7);
        const closedMonths = await RecordRepository.getClosedMonths();
        const isMonthClosed = closedMonths && closedMonths.includes(recordMonth);
        const isBackfill = !!body.isBackfill || isMonthClosed || (note && (note.includes('[BÙ THÁNG TRƯỚC]') || note.includes('[TĂNG THÁNG NÀY]')));

        let resolvedRole = reqUserRole;
        if (!resolvedRole && reqUserId) {
            const u = await UserRepository.findById(reqUserId);
            if (u) resolvedRole = u.role;
        }

        let status = 'approved';
        if (resolvedRole === 'admin') {
            status = body.status || 'approved';
        } else {
            // Nhân viên: Kiểm tra luật tự động duyệt của Team
            const employeeUser = await UserRepository.findById(userId);
            const userTeamName = employeeUser ? employeeUser.team : '';
            
            let autoApprove = false;
            if (userTeamName) {
                const teams = await TeamRepository.getAll();
                const team = (teams || []).find(t => (typeof t === 'string' ? t : t.name) === userTeamName);
                if (team && typeof team === 'object' && team.autoApproveRules) {
                    const rules = team.autoApproveRules;
                    const isSunday = new Date(date + 'T00:00:00').getDay() === 0;
                    const hasCustomActivity = !!body.customActivity;
                    
                    if (isSunday && rules.sunday) {
                        autoApprove = true;
                    } else if (isBackfill && rules.backfill) {
                        autoApprove = true;
                    } else if (hasCustomActivity && rules.customActivity) {
                        autoApprove = true;
                    } else if (!isSunday && !isBackfill && !hasCustomActivity && rules.normalOT) {
                        autoApprove = true;
                    }
                }
            }
            status = autoApprove ? 'approved' : 'pending';
        }

        const hasTrip = (deliveryProvince && deliveryProvince.trim() !== '') || body.calcMode === 'trip';
        const hasOT = (totalHours || 0) > 0 || !!hasLunchOT || (eveningOTHours || 0) > 0 || body.calcMode === 'hour';

        if (resolvedRole === 'admin' && status === 'approved' && hasTrip && hasOT) {
            // Tự động tách làm 2 bản ghi khi Admin tạo/duyệt trực tiếp
            const otRecord = {
                id: existingIdx >= 0 ? allRecords[existingIdx].id : generateId(),
                userId,
                date,
                hasLunchOT: !!hasLunchOT,
                otStart: otStart || '',
                otEnd: otEnd || '',
                eveningOTHours: eveningOTHours || 0,
                totalHours: totalHours || 0,
                deliveryProvince: '',
                customActivity: body.calcMode === 'hour' ? (body.customActivity || '') : '',
                calcMode: body.calcMode === 'hour' ? (body.calcMode || '') : '',
                note: note || '',
                createdMonth: body.createdMonth || (isBackfill ? currentMonth : ''),
                isBackfill: isBackfill,
                status: 'approved',
                createdAt: existingIdx >= 0 ? allRecords[existingIdx].createdAt : new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            const tripRecord = {
                id: generateId(),
                userId,
                date,
                hasLunchOT: false,
                otStart: '',
                otEnd: '',
                eveningOTHours: 0,
                totalHours: 0,
                deliveryProvince: deliveryProvince || '',
                customActivity: body.calcMode === 'trip' ? (body.customActivity || '') : '',
                calcMode: body.calcMode === 'trip' ? (body.calcMode || '') : '',
                note: note || '',
                createdMonth: body.createdMonth || (isBackfill ? currentMonth : ''),
                isBackfill: isBackfill,
                status: 'approved',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            await RecordRepository.createSplit(otRecord, tripRecord, existingIdx);
            return sendJSON(res, existingIdx >= 0 ? 200 : 201, { record: otRecord, updated: existingIdx >= 0, split: true });
        }

        const record = {
            id: existingIdx >= 0 ? allRecords[existingIdx].id : generateId(),
            userId,
            date,
            hasLunchOT: !!hasLunchOT,
            otStart: otStart || '',
            otEnd: otEnd || '',
            eveningOTHours: eveningOTHours || 0,
            totalHours: totalHours || 0,
            deliveryProvince: deliveryProvince || '',
            customActivity: body.customActivity || '',
            calcMode: body.calcMode || '',
            note: note || '',
            createdMonth: body.createdMonth || (isBackfill ? currentMonth : ''),
            isBackfill: isBackfill,
            status: status,
            createdAt: existingIdx >= 0 ? allRecords[existingIdx].createdAt : new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        if (existingIdx >= 0) {
            await RecordRepository.update(record.id, record);
        } else {
            await RecordRepository.create(record);
        }
        return sendJSON(res, existingIdx >= 0 ? 200 : 201, { record, updated: existingIdx >= 0 });
    },

    async delete(req, res, urlPath) {
        const { userId: reqUserId, userRole: reqUserRole } = req;
        const recordId = urlPath.split('/api/records/')[1];
        const record = await RecordRepository.findById(recordId);
        
        if (record) {
            const isUserExists = await UserRepository.existsById(record.userId);
            if (!isUserExists) {
                return sendError(res, 401, 'Tài khoản của bạn đã bị xóa khỏi hệ thống!');
            }

            const recordMonth = record.date.substring(0, 7);
            const closedMonths = await RecordRepository.getClosedMonths();
            const isClosed = closedMonths && closedMonths.includes(recordMonth);

            let resolvedRole = reqUserRole;
            if (!resolvedRole && reqUserId) {
                const u = await UserRepository.findById(reqUserId);
                if (u) resolvedRole = u.role;
            }

            if (isClosed && resolvedRole !== 'admin') {
                return sendError(res, 403, 'Tháng này đã chốt OT, bạn không thể xóa bản ghi!', req);
            }

            // Phân quyền: Nhân viên chỉ được xóa bản ghi của chính mình
            if (reqUserRole === 'employee' && record.userId !== reqUserId) {
                return sendError(res, 403, 'Bạn chỉ được xóa bản ghi của chính mình!', req);
            }
        }
        await RecordRepository.delete(recordId);
        return sendJSON(res, 200, { message: 'Đã xóa' });
    },

    async update(req, res, urlPath) {
        const { userId: reqUserId, userRole: reqUserRole } = req;
        const recordId = urlPath.split('/api/records/')[1];
        const body = await parseBody(req);
        const { date, hasLunchOT, otStart, otEnd, eveningOTHours, totalHours, note, deliveryProvince, customActivity, calcMode } = body;
        
        const record = await RecordRepository.findById(recordId);
        if (!record) return sendError(res, 404, 'Không tìm thấy bản ghi!');

        let resolvedRole = reqUserRole;
        if (!resolvedRole && reqUserId) {
            const u = await UserRepository.findById(reqUserId);
            if (u) resolvedRole = u.role;
        }

        // Check if month is closed
        const recordMonth = record.date.substring(0, 7);
        const closedMonths = await RecordRepository.getClosedMonths();
        const isClosed = closedMonths && closedMonths.includes(recordMonth);
        if (isClosed && resolvedRole !== 'admin') {
            return sendError(res, 403, 'Tháng này đã chốt OT, bạn không thể chỉnh sửa bản ghi!', req);
        }

        // Phân quyền: Nhân viên chỉ được sửa bản ghi của chính mình
        if (reqUserRole === 'employee' && record.userId !== reqUserId) {
            return sendError(res, 403, 'Bạn chỉ được sửa bản ghi của chính mình!', req);
        }

        const isUserExists = await UserRepository.existsById(record.userId);
        if (!isUserExists) {
            return sendError(res, 401, 'Tài khoản của bạn đã bị xóa khỏi hệ thống!');
        }

        const today = new Date(Date.now() + 7 * 3600000).toISOString().split('T')[0];
        if (date && date > today) {
            return sendError(res, 400, 'Không thể đăng ký tăng ca cho ngày tương lai!');
        }

        const updates = {};
        updates.date = date || record.date;
        updates.hasLunchOT = hasLunchOT !== undefined ? !!hasLunchOT : record.hasLunchOT;
        updates.otStart = otStart !== undefined ? otStart : record.otStart;
        updates.otEnd = otEnd !== undefined ? otEnd : record.otEnd;
        updates.eveningOTHours = eveningOTHours !== undefined ? eveningOTHours : record.eveningOTHours;
        updates.totalHours = totalHours !== undefined ? totalHours : record.totalHours;
        updates.deliveryProvince = deliveryProvince !== undefined ? deliveryProvince : (record.deliveryProvince || '');
        updates.customActivity = customActivity !== undefined ? customActivity : (record.customActivity || '');
        updates.calcMode = calcMode !== undefined ? calcMode : (record.calcMode || '');
        updates.note = note !== undefined ? note : record.note;
        
        const currentMonth = today.substring(0, 7);
        const currentRecDate = updates.date;
        const currentRecMonth = currentRecDate.substring(0, 7);
        const isMonthClosed = closedMonths && closedMonths.includes(currentRecMonth);
        const currentNote = updates.note;
        const isBackfill = !!body.isBackfill || isMonthClosed || (currentNote && (currentNote.includes('[BÙ THÁNG TRƯỚC]') || currentNote.includes('[TĂNG THÁNG NÀY]')));

        updates.isBackfill = isBackfill;

        if (body.createdMonth !== undefined) {
            updates.createdMonth = body.createdMonth;
        } else if (isBackfill && !record.createdMonth) {
            updates.createdMonth = currentMonth;
        }

        if (resolvedRole === 'admin') {
            if (body.status !== undefined) {
                updates.status = body.status;
            }
        } else {
            // Nhân viên sửa bản ghi: tính toán status tự động dựa trên luật tự duyệt của Team
            const employeeUser = await UserRepository.findById(record.userId);
            const userTeamName = employeeUser ? employeeUser.team : '';
            
            let autoApprove = false;
            if (userTeamName) {
                const teams = await TeamRepository.getAll();
                const team = (teams || []).find(t => (typeof t === 'string' ? t : t.name) === userTeamName);
                if (team && typeof team === 'object' && team.autoApproveRules) {
                    const rules = team.autoApproveRules;
                    const isSunday = new Date(updates.date + 'T00:00:00').getDay() === 0;
                    const hasCustomActivity = !!updates.customActivity;
                    
                    if (isSunday && rules.sunday) {
                        autoApprove = true;
                    } else if (isBackfill && rules.backfill) {
                        autoApprove = true;
                    } else if (hasCustomActivity && rules.customActivity) {
                        autoApprove = true;
                    } else if (!isSunday && !isBackfill && !hasCustomActivity && rules.normalOT) {
                        autoApprove = true;
                    }
                }
            }
            updates.status = autoApprove ? 'approved' : 'pending';
        }

        const statusToBeApproved = (body.status === 'approved') || (updates.status === 'approved') || (record.status === 'approved' && updates.status === undefined);

        if (resolvedRole === 'admin' && statusToBeApproved) {
            const finalProvince = updates.deliveryProvince !== undefined ? updates.deliveryProvince : record.deliveryProvince;
            const finalTotalHours = updates.totalHours !== undefined ? updates.totalHours : record.totalHours;
            const finalHasLunchOT = updates.hasLunchOT !== undefined ? updates.hasLunchOT : record.hasLunchOT;
            const finalEveningOTHours = updates.eveningOTHours !== undefined ? updates.eveningOTHours : record.eveningOTHours;
            const finalCalcMode = updates.calcMode !== undefined ? updates.calcMode : record.calcMode;

            const hasTrip = (finalProvince && finalProvince.trim() !== '') || finalCalcMode === 'trip';
            const hasOT = (finalTotalHours || 0) > 0 || !!finalHasLunchOT || (finalEveningOTHours || 0) > 0 || finalCalcMode === 'hour';

            if (hasTrip && hasOT) {
                // Tách tự động bản ghi kết hợp thành 2 bản ghi độc lập
                const originalProvince = finalProvince;
                
                updates.deliveryProvince = '';
                updates.customActivity = finalCalcMode === 'hour' ? (updates.customActivity || record.customActivity || '') : '';
                updates.calcMode = finalCalcMode === 'hour' ? (finalCalcMode || '') : '';
                updates.status = 'approved';
                updates.updatedAt = new Date().toISOString();

                const tripRecord = {
                    id: generateId(),
                    userId: record.userId,
                    date: updates.date,
                    hasLunchOT: false,
                    otStart: '',
                    otEnd: '',
                    eveningOTHours: 0,
                    totalHours: 0,
                    deliveryProvince: originalProvince,
                    customActivity: finalCalcMode === 'trip' ? (updates.customActivity || record.customActivity || '') : '',
                    calcMode: finalCalcMode === 'trip' ? (finalCalcMode || '') : '',
                    note: updates.note,
                    createdMonth: updates.createdMonth || record.createdMonth,
                    isBackfill: updates.isBackfill,
                    status: 'approved',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };

                const updatedRecord = await RecordRepository.updateSplit(recordId, updates, tripRecord);
                return sendJSON(res, 200, { record: updatedRecord, split: true });
            }
        }

        const updatedRecord = await RecordRepository.update(recordId, updates);
        return sendJSON(res, 200, { record: updatedRecord });
    },

    async getClosedMonths(req, res) {
        const closed = await RecordRepository.getClosedMonths();
        return sendJSON(res, 200, { closedMonths: closed });
    },

    async closeMonth(req, res) {
        const { userId: reqUserId, userRole: reqUserRole } = req;
        if (reqUserId) {
            const user = await UserRepository.findById(reqUserId);
            if (!user || user.role !== 'admin') {
                return sendError(res, 403, 'Bạn không có quyền chốt OT!', req);
            }
        }
        const body = await parseBody(req);
        const { month } = body;
        if (!month || !month.match(/^\d{4}-\d{2}$/)) {
            return sendError(res, 400, 'Tháng không hợp lệ (định dạng đúng: YYYY-MM)!');
        }

        const { closed, closedMonths } = await RecordRepository.closeMonth(month);
        if (closed) {
            // Gửi thông báo đẩy cho tất cả nhân viên
            this.notifyEmployeesMonthClosed(month).catch(e => logError('[Close Month Push] Lỗi:', e.message));
        }
        return sendJSON(res, 200, { success: true, closedMonths });
    },

    async notifyEmployeesMonthClosed(month) {
        try {
            const users = await UserRepository.getAll();
            const employees = users.filter(u => u.role === 'employee');
            
            const parts = month.split('-');
            const displayMonth = parts.length === 2 ? `${parts[1]}/${parts[0]}` : month;
            
            const payload = JSON.stringify({
                title: 'Thông báo chốt công 🔒',
                body: `Tháng ${displayMonth} đã được chốt công và khóa ghi nhận tăng ca.`,
                data: { url: '/mobile/' }
            });
            
            for (const emp of employees) {
                if (emp.pushSubscriptions && emp.pushSubscriptions.length > 0) {
                    const activeSubscriptions = [];
                    for (const sub of emp.pushSubscriptions) {
                        try {
                            await webpush.sendNotification(sub, payload);
                            activeSubscriptions.push(sub);
                        } catch (err) {
                            if (err.statusCode === 410 || err.statusCode === 404) {
                                console.log(`[Web Push Close Month] Xóa subscription hết hạn của nhân viên ${emp.username}`);
                            } else {
                                console.error(`[Web Push Close Month] Lỗi gửi thông báo cho ${emp.username}:`, err.message);
                                activeSubscriptions.push(sub);
                            }
                        }
                    }
                    
                    if (activeSubscriptions.length !== emp.pushSubscriptions.length) {
                        await UserRepository.update(emp.id, { pushSubscriptions: activeSubscriptions });
                    }
                }
            }
            console.log(`[Web Push Close Month] Đã gửi thông báo chốt công tháng ${month} cho nhân viên.`);
        } catch (e) {
            console.error('[Web Push Close Month] Lỗi gửi thông báo:', e.message);
        }
    },

    async cleanup(req, res) {
        const body = await parseBody(req);
        const { month } = body;
        if (!month || !month.match(/^\d{4}-\d{2}$/)) {
            return sendError(res, 400, 'Tháng không hợp lệ (định dạng đúng: YYYY-MM)!');
        }
        try {
            await this.performCleanup(month);
            return sendJSON(res, 200, { success: true, message: `Đã dọn dẹp dữ liệu tháng ${month} thành công!` });
        } catch (err) {
            return sendError(res, 500, `Lỗi dọn dẹp: ${err.message}`);
        }
    },

    async performCleanup(month) {
        const db = await loadDB();
        const cleanMonthStr = month.replace('-', '_'); // e.g. "2026_05"
        const backupFileName = `db_backup_${cleanMonthStr}.json`;
        const backupFilePath = path.join(path.dirname(getDbPath()), backupFileName);
        
        // 1. Sao lưu cục bộ
        try {
            fs.writeFileSync(backupFilePath, JSON.stringify(db, null, 2), 'utf-8');
            console.log(`[Cleanup] Đã lưu tệp sao lưu cục bộ tại: ${backupFilePath}`);
        } catch (err) {
            console.error('[Cleanup] Lỗi sao lưu cục bộ:', err.message);
        }
        
        // 2. Sao lưu lên GitHub Gist
        if (config.GIST_ID && config.GITHUB_TOKEN) {
            try {
                console.log(`[Cleanup] Đang đồng bộ tệp sao lưu ${backupFileName} lên GitHub Gist...`);
                await this.backupGistFile(backupFileName, db);
                console.log('[Cleanup] Đồng bộ Gist thành công!');
            } catch (err) {
                console.error('[Cleanup] Lỗi đồng bộ Gist:', err.message);
            }
        }
        
        // 3. Xoá dữ liệu tháng cũ khỏi DB chính (giữ lại các bản ghi bù/bổ sung của tháng sau)
        await RecordRepository.cleanup(month);
        console.log(`[Cleanup] Đã dọn dẹp dữ liệu của tháng ${month} và các tháng cũ hơn.`);
    },

    backupGistFile(fileName, data) {
        return new Promise((resolve, reject) => {
            const payload = JSON.stringify({
                files: {
                    [fileName]: {
                        content: JSON.stringify(data, null, 2)
                    }
                }
            });

            const options = {
                hostname: 'api.github.com',
                path: `/gists/${config.GIST_ID}`,
                method: 'PATCH',
                headers: {
                    'Authorization': `token ${config.GITHUB_TOKEN}`,
                    'User-Agent': 'Node.js-Server-App',
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(payload)
                }
            };

            const req = https.request(options, (res) => {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(true);
                    } else {
                        reject(new Error(`HTTP status ${res.statusCode}: ${body}`));
                    }
                });
            });

            req.on('error', reject);
            req.write(payload);
            req.end();
        });
    }
};

module.exports = RecordController;
