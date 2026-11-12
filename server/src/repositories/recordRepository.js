const config = require('../../config');
const {
    loadDB,
    saveDB,
    getEffectiveRecordMonth,
    queryPGRecordsByMonth,
    queryPGRecordsUpToMonth,
    queryPGRecordById,
    upsertPGRecord,
    deletePGRecordById,
    cleanupPGRecordsUpToMonth
} = require('../../db');

const RecordRepository = {
    async getAll() {
        const db = await loadDB(false);
        return db.records || [];
    },

    async getByMonth(month) {
        const db = await loadDB(false);
        if (!month) return db.records || [];
        if (config.DATABASE_URL && db._hotCutoffMonth && month < db._hotCutoffMonth) {
            return await queryPGRecordsByMonth(month);
        }
        return (db.records || []).filter(r => getEffectiveRecordMonth(r) === month);
    },

    async findById(id) {
        const db = await loadDB(false);
        const found = (db.records || []).find(r => r.id === id);
        if (found) return found;
        if (config.DATABASE_URL && db._hotCutoffMonth) {
            return await queryPGRecordById(id);
        }
        return undefined;
    },

    async findIndexById(id) {
        const db = await loadDB(false);
        return (db.records || []).findIndex(r => r.id === id);
    },

    async create(newRecord) {
        const db = await loadDB(true);
        db.records = db.records || [];
        const effMonth = getEffectiveRecordMonth(newRecord);
        if (config.DATABASE_URL && db._hotCutoffMonth && effMonth && effMonth < db._hotCutoffMonth && newRecord.status !== 'pending') {
            await upsertPGRecord(newRecord);
            return newRecord;
        }
        db.records.push(newRecord);
        saveDB(db);
        return newRecord;
    },

    async createSplit(otRecord, tripRecord, existingIdx = -1) {
        const db = await loadDB(true);
        db.records = db.records || [];
        if (existingIdx >= 0) {
            db.records[existingIdx] = otRecord;
        } else {
            db.records.push(otRecord);
        }
        db.records.push(tripRecord);
        saveDB(db);
        return { otRecord, tripRecord };
    },

    async update(id, updates) {
        const db = await loadDB(true);
        db.records = db.records || [];
        const index = db.records.findIndex(r => r.id === id);
        if (index !== -1) {
            db.records[index] = {
                ...db.records[index],
                ...updates,
                updatedAt: new Date().toISOString()
            };
            saveDB(db);
            return db.records[index];
        }

        if (config.DATABASE_URL && db._hotCutoffMonth) {
            const coldRecord = await queryPGRecordById(id);
            if (!coldRecord) return null;
            const merged = {
                ...coldRecord,
                ...updates,
                updatedAt: new Date().toISOString()
            };
            await upsertPGRecord(merged);
            const effMonth = getEffectiveRecordMonth(merged);
            if ((effMonth && effMonth >= db._hotCutoffMonth) || merged.status === 'pending') {
                db.records.push(merged);
                saveDB(db);
            }
            return merged;
        }
        return null;
    },

    async updateSplit(id, otUpdates, tripRecord) {
        const db = await loadDB(true);
        db.records = db.records || [];
        const index = db.records.findIndex(r => r.id === id);
        if (index !== -1) {
            db.records[index] = {
                ...db.records[index],
                ...otUpdates,
                updatedAt: new Date().toISOString()
            };
            db.records.push(tripRecord);
            saveDB(db);
            return db.records[index];
        }

        if (config.DATABASE_URL && db._hotCutoffMonth) {
            const coldRecord = await queryPGRecordById(id);
            if (!coldRecord) return null;
            const merged = {
                ...coldRecord,
                ...otUpdates,
                updatedAt: new Date().toISOString()
            };
            await upsertPGRecord(merged);
            await upsertPGRecord(tripRecord);
            return merged;
        }
        return null;
    },

    async delete(id) {
        const db = await loadDB(true);
        db.records = db.records || [];
        const beforeLen = db.records.length;
        db.records = db.records.filter(r => r.id !== id);
        if (db.records.length !== beforeLen) {
            saveDB(db);
            return true;
        }
        if (config.DATABASE_URL && db._hotCutoffMonth) {
            return await deletePGRecordById(id);
        }
        return true;
    },

    async cleanup(month) {
        const db = await loadDB(true);
        db.records = db.records || [];
        db.records = db.records.filter(r => getEffectiveRecordMonth(r) > month);
        saveDB(db);
        if (config.DATABASE_URL && db._hotCutoffMonth) {
            await cleanupPGRecordsUpToMonth(month);
        }
        return true;
    },

    async getColdRecordsUpToMonth(month) {
        const db = await loadDB(false);
        if (config.DATABASE_URL && db._hotCutoffMonth && month < db._hotCutoffMonth) {
            return await queryPGRecordsUpToMonth(month);
        }
        return [];
    },

    async getClosedMonths() {
        const db = await loadDB(false);
        return db.closedMonths || [];
    },

    async closeMonth(month) {
        const db = await loadDB(true);
        db.closedMonths = db.closedMonths || [];
        if (!db.closedMonths.includes(month)) {
            db.closedMonths.push(month);
            saveDB(db);
            return { closed: true, closedMonths: db.closedMonths };
        }
        return { closed: false, closedMonths: db.closedMonths };
    }
};

module.exports = RecordRepository;
