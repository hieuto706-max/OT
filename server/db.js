const fs = require('fs');
const path = require('path');
const https = require('https');
const config = require('./config');
const { logInfo, logError, generateId, hashPassword, decryptData, encryptData } = require('./utils');
const pg = require('pg');

// Parse PostgreSQL DATE type (OID 1082) as a raw string 'YYYY-MM-DD' to prevent converting to ISO format
pg.types.setTypeParser(1082, (val) => val);

let dbCache = null;
let dbLoadingPromise = null;
let DB_FILE = null;
let dbUpdateCallbacks = [];

// ==================== WRITE QUEUE (Chống xung đột ghi) ====================
let writeQueue = Promise.resolve();

function enqueueWrite(fn) {
    writeQueue = writeQueue.then(fn).catch(e => {
        logError('[WriteQueue] Lỗi:', e.message);
    });
    return writeQueue;
}

function getDbPath() {
    if (DB_FILE) return DB_FILE;

    if (process.env.DB_PATH) {
        DB_FILE = process.env.DB_PATH;
        try {
            const dir = path.dirname(DB_FILE);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        } catch (err) {
            logError('[Server] Không thể tạo thư mục cho DB_PATH:', err.message);
        }
        return DB_FILE;
    }

    const defaultPath = path.join(__dirname, '..', 'db.json');
    try {
        const { app } = require('electron');
        if (app) {
            if (!app.isReady()) {
                return defaultPath;
            }
            const userDataPath = app.getPath('userData');
            const electronDB = path.join(userDataPath, 'db.json');

            // Sao chép cơ sở dữ liệu hiện có bằng read/write để hỗ trợ giải nén từ app.asar
            if (!fs.existsSync(electronDB) && fs.existsSync(defaultPath)) {
                try {
                    const dir = path.dirname(electronDB);
                    if (!fs.existsSync(dir)) {
                        fs.mkdirSync(dir, { recursive: true });
                    }
                    const data = fs.readFileSync(defaultPath, 'utf-8');
                    fs.writeFileSync(electronDB, data, 'utf-8');
                    logInfo(`[Server] Đã sao chép cơ sở dữ liệu sang đường dẫn ghi: ${electronDB}`);
                } catch (copyErr) {
                    logError('[Server] Lỗi sao chép cơ sở dữ liệu:', copyErr);
                }
            }
            DB_FILE = electronDB;
            return DB_FILE;
        }
    } catch (e) {
        // Chạy độc lập ngoài Electron (Node.js thuần)
    }
    DB_FILE = defaultPath;
    return DB_FILE;
}

// ==================== CONNECTION POOL ====================
let pgPool = null;

function getPGPool() {
    if (!pgPool && config.DATABASE_URL) {
        const { Pool } = require('pg');
        pgPool = new Pool({
            connectionString: config.DATABASE_URL,
            ssl: { rejectUnauthorized: false },
            max: 5,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 10000
        });
        pgPool.on('error', (err) => {
            logError('[Database PG] Lỗi kết nối Pool (sẽ tự kết nối lại):', err.message);
        });
        logInfo('[Database PG] Đã khởi tạo Connection Pool (max=5, idle=30s, timeout=10s).');
    }
    return pgPool;
}

async function closePGPool() {
    if (pgPool) {
        await pgPool.end();
        pgPool = null;
        logInfo('[Database PG] Đã đóng Connection Pool.');
    }
}

async function initPGTable() {
    const pool = getPGPool();
    if (!pool) return;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Bảng nhân viên
        await client.query(`
            CREATE TABLE IF NOT EXISTS pg_users (
                id VARCHAR(100) PRIMARY KEY,
                username VARCHAR(100) UNIQUE NOT NULL,
                fullname VARCHAR(200),
                password TEXT,
                role VARCHAR(20) DEFAULT 'user',
                team VARCHAR(100),
                device_id TEXT,
                browser_device_id TEXT,
                push_subscriptions JSONB,
                fcm_tokens JSONB DEFAULT '[]'::jsonb,
                pending_unlink BOOLEAN DEFAULT false,
                is_super_admin BOOLEAN DEFAULT false,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await client.query('ALTER TABLE pg_users ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN DEFAULT false');

        // Bảng bản ghi tăng ca
        await client.query(`
            CREATE TABLE IF NOT EXISTS pg_records (
                id VARCHAR(100) PRIMARY KEY,
                user_id VARCHAR(100) NOT NULL REFERENCES pg_users(id) ON DELETE CASCADE,
                date DATE NOT NULL,
                has_lunch_ot BOOLEAN DEFAULT false,
                ot_start TIME,
                ot_end TIME,
                evening_ot_hours REAL DEFAULT 0,
                total_hours REAL DEFAULT 0,
                note TEXT,
                status VARCHAR(30),
                is_backfill BOOLEAN DEFAULT false,
                created_month VARCHAR(10),
                delivery_province TEXT,
                extra_data JSONB,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Bảng đội/tổ
        await client.query(`
            CREATE TABLE IF NOT EXISTS pg_teams (
                id VARCHAR(100) PRIMARY KEY,
                data JSONB NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Bảng tháng đã chốt công
        await client.query(`
            CREATE TABLE IF NOT EXISTS pg_closed_months (
                month VARCHAR(10) PRIMARY KEY
            )
        `);

        await client.query(`CREATE INDEX IF NOT EXISTS idx_records_user_id ON pg_records(user_id)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_records_date ON pg_records(date)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_records_user_date ON pg_records(user_id, date)`);

        await client.query('COMMIT');
        logInfo('[Database PG] Khởi tạo thành công 4 bảng và các chỉ mục (bao gồm composite index).');
    } catch (err) {
        try {
            await client.query('ROLLBACK');
        } catch (rollbackErr) {}
        logError('[Database PG] Lỗi khởi tạo bảng:', err.message);
    } finally {
        client.release();
    }
}

function pgUserToJS(row) {
    return {
        id: row.id, username: row.username, fullname: row.fullname,
        password: row.password, role: row.role, team: row.team || undefined,
        deviceId: row.device_id || undefined, browserDeviceId: row.browser_device_id || undefined,
        pushSubscriptions: row.push_subscriptions || undefined,
        fcmTokens: row.fcm_tokens || [],
        pendingUnlink: row.pending_unlink || undefined,
        isSuperAdmin: !!row.is_super_admin,
        createdAt: row.created_at ? row.created_at.toISOString() : undefined,
        updatedAt: row.updated_at ? row.updated_at.toISOString() : undefined
    };
}

function pgRecordToJS(row) {
    const obj = {
        id: row.id,
        userId: row.user_id,
        date: row.date,
        hasLunchOT: row.has_lunch_ot,
        otStart: row.ot_start ? row.ot_start.substring(0, 5) : undefined,
        otEnd: row.ot_end ? row.ot_end.substring(0, 5) : undefined,
        eveningOTHours: row.evening_ot_hours,
        totalHours: row.total_hours,
        note: row.note,
        status: row.status || undefined,
        isBackfill: row.is_backfill || undefined,
        createdMonth: row.created_month || undefined,
        deliveryProvince: row.delivery_province || undefined,
        createdAt: row.created_at ? row.created_at.toISOString() : undefined,
        updatedAt: row.updated_at ? row.updated_at.toISOString() : undefined
    };
    if (row.extra_data) {
        Object.assign(obj, row.extra_data);
    }
    Object.keys(obj).forEach(k => (obj[k] === undefined || obj[k] === null) && delete obj[k]);
    return obj;
}

async function loadDBFromPG() {
    const pool = getPGPool();
    if (!pool) return null;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const usersCheck = await client.query('SELECT COUNT(*) as cnt FROM pg_users');
        const hasNewTables = parseInt(usersCheck.rows[0].cnt) > 0;

        if (hasNewTables) {
            const usersRes = await client.query('SELECT * FROM pg_users ORDER BY created_at');
            const recordsRes = await client.query('SELECT * FROM pg_records ORDER BY date DESC, created_at');
            const teamsRes = await client.query('SELECT data FROM pg_teams');
            const closedRes = await client.query('SELECT month FROM pg_closed_months');

            await client.query('COMMIT');

            const result = {
                users: usersRes.rows.map(pgUserToJS),
                records: recordsRes.rows.map(pgRecordToJS),
                teams: teamsRes.rows.map(r => r.data),
                closedMonths: closedRes.rows.map(r => r.month)
            };
            logInfo(`[Database PG] Tải từ bảng tách riêng: ${result.users.length} nhân viên, ${result.records.length} bản ghi, ${result.teams.length} đội.`);
            return result;
        } else {
            await client.query('COMMIT');
        }
    } catch (err) {
        try {
            await client.query('ROLLBACK');
        } catch (rollbackErr) {}
        logError('[Database PG] Lỗi nạp dữ liệu từ PostgreSQL:', err.message);
    } finally {
        client.release();
    }
    return null;
}

async function saveDBToPG(data) {
    const pool = getPGPool();
    if (!pool) return;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // === Đồng bộ bảng pg_users ===
        const existingUsers = await client.query('SELECT id FROM pg_users');
        const existingUserIds = new Set(existingUsers.rows.map(r => r.id));
        const currentUserIds = new Set((data.users || []).map(u => u.id));

        for (const id of existingUserIds) {
            if (!currentUserIds.has(id)) {
                await client.query('DELETE FROM pg_users WHERE id = $1', [id]);
            }
        }

        for (const u of (data.users || [])) {
            await client.query(`
                INSERT INTO pg_users (id, username, fullname, password, role, team, device_id, browser_device_id, push_subscriptions, pending_unlink, fcm_tokens, is_super_admin, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
                ON CONFLICT (id) DO UPDATE SET
                    username = $2, fullname = $3, password = $4, role = $5, team = $6,
                    device_id = $7, browser_device_id = $8, push_subscriptions = $9,
                    pending_unlink = $10, fcm_tokens = $11, is_super_admin = $12, updated_at = $14
            `, [
                u.id, u.username, u.fullname || '', u.password || '',
                u.role || 'user', u.team || null,
                u.deviceId || null, u.browserDeviceId || null,
                u.pushSubscriptions ? JSON.stringify(u.pushSubscriptions) : null,
                u.pendingUnlink || false,
                u.fcmTokens ? JSON.stringify(u.fcmTokens) : '[]',
                u.isSuperAdmin || false,
                u.createdAt || new Date().toISOString(),
                u.updatedAt || new Date().toISOString()
            ]);
        }

        // === Đồng bộ bảng pg_records ===
        const existingRecords = await client.query('SELECT id FROM pg_records');
        const existingRecordIds = new Set(existingRecords.rows.map(r => r.id));
        const currentRecordIds = new Set((data.records || []).map(r => r.id));

        for (const id of existingRecordIds) {
            if (!currentRecordIds.has(id)) {
                await client.query('DELETE FROM pg_records WHERE id = $1', [id]);
            }
        }

        for (const r of (data.records || [])) {
            const knownFields = ['id','userId','date','hasLunchOT','otStart','otEnd','eveningOTHours','totalHours','note','status','isBackfill','createdMonth','deliveryProvince','createdAt','updatedAt'];
            const extraData = {};
            for (const key of Object.keys(r)) {
                if (!knownFields.includes(key)) extraData[key] = r[key];
            }
            await client.query(`
                INSERT INTO pg_records (id, user_id, date, has_lunch_ot, ot_start, ot_end, evening_ot_hours, total_hours, note, status, is_backfill, created_month, delivery_province, extra_data, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
                ON CONFLICT (id) DO UPDATE SET
                    user_id = $2, date = $3, has_lunch_ot = $4, ot_start = $5, ot_end = $6,
                    evening_ot_hours = $7, total_hours = $8, note = $9, status = $10,
                    is_backfill = $11, created_month = $12, delivery_province = $13,
                    extra_data = $14, updated_at = $16
            `, [
                r.id, r.userId, r.date,
                r.hasLunchOT || false, r.otStart || null, r.otEnd || null,
                r.eveningOTHours || 0, r.totalHours || 0,
                r.note || '', r.status || null,
                r.isBackfill || false, r.createdMonth || null,
                r.deliveryProvince || null,
                Object.keys(extraData).length > 0 ? JSON.stringify(extraData) : null,
                r.createdAt || new Date().toISOString(),
                r.updatedAt || new Date().toISOString()
            ]);
        }

        // === Đồng bộ bảng pg_teams ===
        await client.query('DELETE FROM pg_teams');
        for (const t of (data.teams || [])) {
            await client.query(`
                INSERT INTO pg_teams (id, data) VALUES ($1, $2)
            `, [t.id, JSON.stringify(t)]);
        }

        // === Đồng bộ bảng pg_closed_months ===
        await client.query('DELETE FROM pg_closed_months');
        for (const m of (data.closedMonths || [])) {
            await client.query(`
                INSERT INTO pg_closed_months (month) VALUES ($1)
            `, [m]);
        }

        await client.query('COMMIT');
        logInfo('[Database PG] Đồng bộ thành công lên 4 bảng.');
    } catch (err) {
        try {
            await client.query('ROLLBACK');
        } catch (rollbackErr) {}
        logError('[Database PG] Lỗi đồng bộ lên PostgreSQL:', err.message);
    } finally {
        client.release();
    }
}

function fetchGist() {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.github.com',
            path: `/gists/${config.GIST_ID}`,
            method: 'GET',
            headers: {
                'Authorization': `token ${config.GITHUB_TOKEN}`,
                'User-Agent': 'Node.js-Server-App'
            }
        };

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    if (res.statusCode !== 200) {
                        return reject(new Error(`HTTP status ${res.statusCode}`));
                    }
                    const gist = JSON.parse(body);
                    const file = gist.files['db.json'];
                    if (!file) {
                        return reject(new Error('db.json not found in Gist'));
                    }
                    const rawContent = decryptData(file.content);
                    const db = JSON.parse(rawContent);
                    resolve(db);
                } catch (e) {
                    reject(e);
                }
            });
        });

        req.on('error', reject);
        req.end();
    });
}

function updateGist(data) {
    return new Promise((resolve, reject) => {
        const dbContent = JSON.stringify(data, null, 2);
        const encryptedContent = encryptData(dbContent);
        const payload = JSON.stringify({
            files: {
                'db.json': {
                    content: encryptedContent
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

function isUserEqual(u1, u2) {
    return u1.username === u2.username &&
           u1.fullname === u2.fullname &&
           u1.password === u2.password &&
           u1.role === u2.role &&
           u1.team === u2.team &&
           u1.deviceId === u2.deviceId &&
           u1.browserDeviceId === u2.browserDeviceId &&
           JSON.stringify(u1.pushSubscriptions) === JSON.stringify(u2.pushSubscriptions) &&
           JSON.stringify(u1.fcmTokens) === JSON.stringify(u2.fcmTokens) &&
           u1.pendingUnlink === u2.pendingUnlink;
}

function isRecordEqual(r1, r2) {
    const keys1 = Object.keys(r1);
    const keys2 = Object.keys(r2);
    if (keys1.length !== keys2.length) return false;
    for (const key of keys1) {
        if (typeof r1[key] === 'object' && r1[key] !== null) {
            if (JSON.stringify(r1[key]) !== JSON.stringify(r2[key])) return false;
        } else {
            if (r1[key] !== r2[key]) return false;
        }
    }
    return true;
}

async function syncDiffToPG(oldData, newData) {
    if (!oldData) {
        return saveDBToPG(newData);
    }

    const pool = getPGPool();
    if (!pool) return;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        let changesCount = 0;

        // === 1. Đồng bộ bảng pg_users ===
        const oldUsersMap = new Map((oldData.users || []).map(u => [u.id, u]));
        const newUsersMap = new Map((newData.users || []).map(u => [u.id, u]));

        for (const [id] of oldUsersMap) {
            if (!newUsersMap.has(id)) {
                await client.query('DELETE FROM pg_users WHERE id = $1', [id]);
                changesCount++;
            }
        }

        for (const [id, nu] of newUsersMap) {
            const ou = oldUsersMap.get(id);
            if (!ou || !isUserEqual(ou, nu)) {
                await client.query(`
                    INSERT INTO pg_users (id, username, fullname, password, role, team, device_id, browser_device_id, push_subscriptions, pending_unlink, fcm_tokens, is_super_admin, created_at, updated_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
                    ON CONFLICT (id) DO UPDATE SET
                        username = $2, fullname = $3, password = $4, role = $5, team = $6,
                        device_id = $7, browser_device_id = $8, push_subscriptions = $9,
                        pending_unlink = $10, fcm_tokens = $11, is_super_admin = $12, updated_at = $14
                `, [
                    nu.id, nu.username, nu.fullname || '', nu.password || '',
                    nu.role || 'user', nu.team || null,
                    nu.deviceId || null, nu.browserDeviceId || null,
                    nu.pushSubscriptions ? JSON.stringify(nu.pushSubscriptions) : null,
                    nu.pendingUnlink || false,
                    nu.fcmTokens ? JSON.stringify(nu.fcmTokens) : '[]',
                    nu.isSuperAdmin || false,
                    nu.createdAt || new Date().toISOString(),
                    nu.updatedAt || new Date().toISOString()
                ]);
                changesCount++;
            }
        }

        // === 2. Đồng bộ bảng pg_records ===
        const oldRecordsMap = new Map((oldData.records || []).map(r => [r.id, r]));
        const newRecordsMap = new Map((newData.records || []).map(r => [r.id, r]));

        for (const [id] of oldRecordsMap) {
            if (!newRecordsMap.has(id)) {
                await client.query('DELETE FROM pg_records WHERE id = $1', [id]);
                changesCount++;
            }
        }

        for (const [id, nr] of newRecordsMap) {
            const or = oldRecordsMap.get(id);
            if (!or || !isRecordEqual(or, nr)) {
                const knownFields = ['id','userId','date','hasLunchOT','otStart','otEnd','eveningOTHours','totalHours','note','status','isBackfill','createdMonth','deliveryProvince','createdAt','updatedAt'];
                const extraData = {};
                for (const key of Object.keys(nr)) {
                    if (!knownFields.includes(key)) extraData[key] = nr[key];
                }
                await client.query(`
                    INSERT INTO pg_records (id, user_id, date, has_lunch_ot, ot_start, ot_end, evening_ot_hours, total_hours, note, status, is_backfill, created_month, delivery_province, extra_data, created_at, updated_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
                    ON CONFLICT (id) DO UPDATE SET
                        user_id = $2, date = $3, has_lunch_ot = $4, ot_start = $5, ot_end = $6,
                        evening_ot_hours = $7, total_hours = $8, note = $9, status = $10,
                        is_backfill = $11, created_month = $12, delivery_province = $13,
                        extra_data = $14, updated_at = $16
                `, [
                    nr.id, nr.userId, nr.date,
                    nr.hasLunchOT || false, nr.otStart || null, nr.otEnd || null,
                    nr.eveningOTHours || 0, nr.totalHours || 0,
                    nr.note || '', nr.status || null,
                    nr.isBackfill || false, nr.createdMonth || null,
                    nr.deliveryProvince || null,
                    Object.keys(extraData).length > 0 ? JSON.stringify(extraData) : null,
                    nr.createdAt || new Date().toISOString(),
                    nr.updatedAt || new Date().toISOString()
                ]);
                changesCount++;
            }
        }

        // === 3. Đồng bộ bảng pg_teams ===
        const oldTeamsMap = new Map((oldData.teams || []).map(t => [t.id, t]));
        const newTeamsMap = new Map((newData.teams || []).map(t => [t.id, t]));

        for (const [id] of oldTeamsMap) {
            if (!newTeamsMap.has(id)) {
                await client.query('DELETE FROM pg_teams WHERE id = $1', [id]);
                changesCount++;
            }
        }

        for (const [id, nt] of newTeamsMap) {
            const ot = oldTeamsMap.get(id);
            if (!ot || JSON.stringify(ot) !== JSON.stringify(nt)) {
                await client.query(`
                    INSERT INTO pg_teams (id, data) VALUES ($1, $2)
                    ON CONFLICT (id) DO UPDATE SET data = $2
                `, [nt.id, JSON.stringify(nt)]);
                changesCount++;
            }
        }

        // === 4. Đồng bộ bảng pg_closed_months ===
        const oldMonthsSet = new Set(oldData.closedMonths || []);
        const newMonthsSet = new Set(newData.closedMonths || []);

        for (const m of oldMonthsSet) {
            if (!newMonthsSet.has(m)) {
                await client.query('DELETE FROM pg_closed_months WHERE month = $1', [m]);
                changesCount++;
            }
        }

        for (const m of newMonthsSet) {
            if (!oldMonthsSet.has(m)) {
                await client.query(`
                    INSERT INTO pg_closed_months (month) VALUES ($1)
                    ON CONFLICT (month) DO NOTHING
                `, [m]);
                changesCount++;
            }
        }

        await client.query('COMMIT');
        if (changesCount > 0) {
            logInfo(`[Database PG] Đồng bộ thành công ${changesCount} thay đổi (Direct CRUD).`);
        }
    } catch (err) {
        try {
            await client.query('ROLLBACK');
        } catch (rollbackErr) {}
        logError('[Database PG] Lỗi đồng bộ trực tiếp:', err.message);
    } finally {
        client.release();
    }
}

async function migratePasswords(db) {
    let migrated = false;
    db.users.forEach(user => {
        if (user.role === 'admin' && user.password && !user.password.startsWith('pbkdf2$')) {
            logInfo(`[Migration] Băm mật khẩu cho tài khoản admin: ${user.username}`);
            user.password = hashPassword(user.password);
            migrated = true;
        }
    });
    return migrated;
}

function migrateTeams(db) {
    if (!db.teams) {
        db.teams = [];
        return false;
    }
    let migrated = false;
    db.teams = db.teams.map(team => {
        if (typeof team === 'string') {
            migrated = true;
            return {
                id: team,
                name: team,
                leaderId: null,
                leaderIds: [],
                customActivities: [],
                autoApproveRules: {
                    lunch: false,
                    evening: false,
                    customActivity: false
                }
            };
        }
        if (!team.leaderIds) {
            team.leaderIds = team.leaderId ? [team.leaderId] : [];
            migrated = true;
        }
        if (!team.customActivities) {
            team.customActivities = [];
            migrated = true;
        }
        if (!team.autoApproveRules) {
            team.autoApproveRules = {
                lunch: false,
                evening: false,
                customActivity: false
            };
            migrated = true;
        }
        return team;
    });
    return migrated;
}

async function loadDB() {
    if (dbCache) return JSON.parse(JSON.stringify(dbCache));
    if (dbLoadingPromise) return dbLoadingPromise.then(res => JSON.parse(JSON.stringify(res)));

    dbLoadingPromise = (async () => {
        if (config.DATABASE_URL) {
            try {
                logInfo('[Database PG] Đang kết nối tải cơ sở dữ liệu từ Cloud PostgreSQL...');
                const pgData = await loadDBFromPG();
                if (pgData) {
                    if (!pgData.users) pgData.users = [];
                    if (!pgData.records) pgData.records = [];
                    if (!pgData.closedMonths) pgData.closedMonths = [];
                    
                    const migratedTeams = migrateTeams(pgData);
                    const migratedPass = await migratePasswords(pgData);
                    if (migratedTeams || migratedPass) {
                        await saveDBToPG(pgData);
                    }
                    logInfo('[Database PG] Tải dữ liệu từ PostgreSQL thành công!');
                    dbCache = pgData;
                    return pgData;
                }
            } catch (e) {
                logError('[Database PG] Lỗi khi tải dữ liệu khởi động từ PostgreSQL:', e.message);
            }
        }

        const dbFile = getDbPath();
        let fileLoaded = false;
        let localDB = null;

        if (config.GIST_ID && config.GITHUB_TOKEN) {
            try {
                logInfo('[Gist] Đang kết nối tải cơ sở dữ liệu từ GitHub Gist...');
                const gistData = await fetchGist();
                if (gistData) {
                    if (!gistData.users) gistData.users = [];
                    if (!gistData.records) gistData.records = [];
                    if (!gistData.closedMonths) gistData.closedMonths = [];
                    
                    const migratedTeams = migrateTeams(gistData);
                    const migratedPass = await migratePasswords(gistData);
                    if (migratedTeams || migratedPass) {
                        saveDB(gistData);
                    } else {
                        fs.writeFileSync(dbFile, JSON.stringify(gistData, null, 2), 'utf-8');
                    }
                    logInfo('[Gist] Tải dữ liệu từ Gist thành công!');
                    if (config.DATABASE_URL) {
                        saveDBToPG(gistData).catch(e => logError('[Database PG] Lỗi đồng bộ từ Gist lên PG:', e.message));
                    }
                    dbCache = gistData;
                    return gistData;
                }
            } catch (e) {
                logError('[Gist] Lỗi khi tải dữ liệu khởi động từ Gist (sẽ dùng file local):', e.message);
            }
        }

        try {
            if (fs.existsSync(dbFile)) {
                const data = fs.readFileSync(dbFile, 'utf-8').trim();
                if (data) {
                    localDB = JSON.parse(data);
                    if (!localDB.users) localDB.users = [];
                    if (!localDB.records) localDB.records = [];
                    if (!localDB.closedMonths) localDB.closedMonths = [];
                    dbCache = localDB;
                    fileLoaded = true;
                    logInfo('[Database] Tải dữ liệu thành công từ file local db.json.');
                }
            }
        } catch (e) {
            logError('[Database] Lỗi khi đọc file local db.json:', e.message);
        }

        if (fileLoaded && localDB) {
            const migratedPass = await migratePasswords(localDB);
            const migratedTeams = migrateTeams(localDB);
            if (migratedPass || migratedTeams) {
                saveDB(localDB);
                logInfo('[Migration] Đã tự động di trú cơ sở dữ liệu (Passwords/Teams).');
            } else if (config.DATABASE_URL) {
                saveDBToPG(localDB).catch(e => logError('[Database PG] Lỗi đồng bộ từ local lên PG:', e.message));
            }
            return localDB;
        }

        const defaultDB = {
            users: [{
                id: generateId(),
                username: 'admin',
                password: hashPassword('admin123'),
                fullname: 'Quản trị viên',
                role: 'admin',
                isSuperAdmin: true,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            }],
            records: [],
            teams: [],
            closedMonths: []
        };
        saveDB(defaultDB);
        logInfo('[Database] Đã khởi tạo cơ sở dữ liệu mặc định.');
        return defaultDB;
    })();

    return dbLoadingPromise.then(res => JSON.parse(JSON.stringify(res)));
}

function saveDB(data) {
    const oldData = dbCache ? JSON.parse(JSON.stringify(dbCache)) : null;
    dbCache = data;

    enqueueWrite(() => {
        fs.writeFileSync(getDbPath(), JSON.stringify(data, null, 2), 'utf-8');

        // Trigger hooks
        dbUpdateCallbacks.forEach(cb => {
            try { cb(oldData, data); } catch (e) {}
        });

        if (config.DATABASE_URL) {
            syncDiffToPG(oldData, data).catch(e => {
                logError('[Database PG] Lỗi cập nhật lên PostgreSQL:', e.message);
            });
        }

        if (config.GIST_ID && config.GITHUB_TOKEN) {
            return updateGist(data).catch(e => {
                logError('[Gist] Lỗi cập nhật lên Gist:', e.message);
            });
        }
    });
}

function getDBCache() {
    return dbCache;
}

function setDBCache(val) {
    dbCache = val;
}

function onUpdate(callback) {
    dbUpdateCallbacks.push(callback);
}

module.exports = {
    getDbPath,
    getPGPool,
    closePGPool,
    initPGTable,
    loadDB,
    saveDB,
    getDBCache,
    setDBCache,
    onUpdate
};
