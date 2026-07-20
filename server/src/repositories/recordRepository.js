const { loadDB, saveDB } = require('../../db');

const RecordRepository = {
    async getAll() {
        const db = await loadDB(false);
        return db.records || [];
    },

    async findById(id) {
        const db = await loadDB(false);
        return (db.records || []).find(r => r.id === id);
    },

    async findIndexById(id) {
        const db = await loadDB(false);
        return (db.records || []).findIndex(r => r.id === id);
    },

    async create(newRecord) {
        const db = await loadDB(true);
        db.records = db.records || [];
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
        if (index === -1) return null;

        db.records[index] = {
            ...db.records[index],
            ...updates,
            updatedAt: new Date().toISOString()
        };
        saveDB(db);
        return db.records[index];
    },

    async updateSplit(id, otUpdates, tripRecord) {
        const db = await loadDB(true);
        db.records = db.records || [];
        const index = db.records.findIndex(r => r.id === id);
        if (index === -1) return null;

        db.records[index] = {
            ...db.records[index],
            ...otUpdates,
            updatedAt: new Date().toISOString()
        };
        db.records.push(tripRecord);
        saveDB(db);
        return db.records[index];
    },

    async delete(id) {
        const db = await loadDB(true);
        db.records = db.records || [];
        db.records = db.records.filter(r => r.id !== id);
        saveDB(db);
        return true;
    },

    async cleanup(month) {
        const db = await loadDB(true);
        db.records = db.records || [];
        db.records = db.records.filter(r => {
            const recordMonth = r.createdMonth || r.date.substring(0, 7);
            return recordMonth > month;
        });
        saveDB(db);
        return true;
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
