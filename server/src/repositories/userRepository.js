const { loadDB, saveDB } = require('../../db');

const UserRepository = {
    async getAll() {
        const db = await loadDB(false);
        return db.users || [];
    },

    async findById(id) {
        const db = await loadDB(false);
        return (db.users || []).find(u => u.id === id);
    },

    async findByUsername(username) {
        if (!username) return null;
        const db = await loadDB(false);
        const lower = username.toLowerCase();
        return (db.users || []).find(u => u.username.toLowerCase() === lower);
    },

    async existsById(id) {
        const db = await loadDB(false);
        return (db.users || []).some(u => u.id === id);
    },

    async existsByUsername(username) {
        if (!username) return false;
        const db = await loadDB(false);
        const lower = username.toLowerCase();
        return (db.users || []).some(u => u.username.toLowerCase() === lower);
    },

    async existsByEmail(email, excludeUserId = null) {
        if (!email) return false;
        const db = await loadDB(false);
        const lowerEmail = email.trim().toLowerCase();
        return (db.users || []).some(u => 
            u.id !== excludeUserId && 
            u.email && 
            u.email.toLowerCase() === lowerEmail
        );
    },

    async existsByUsernameExcluding(username, excludeUserId) {
        if (!username) return false;
        const db = await loadDB(false);
        const lower = username.trim().toLowerCase();
        return (db.users || []).some(u => 
            u.id !== excludeUserId && 
            u.username.toLowerCase() === lower
        );
    },

    async create(newUser) {
        const db = await loadDB(true);
        db.users = db.users || [];
        db.users.push(newUser);
        saveDB(db);
        return newUser;
    },

    async update(userId, updates) {
        const db = await loadDB(true);
        db.users = db.users || [];
        const index = db.users.findIndex(u => u.id === userId);
        if (index === -1) return null;

        db.users[index] = {
            ...db.users[index],
            ...updates,
            updatedAt: new Date().toISOString()
        };
        saveDB(db);
        return db.users[index];
    },

    async delete(userId) {
        const db = await loadDB(true);
        db.users = db.users || [];
        db.records = db.records || [];
        
        db.users = db.users.filter(u => u.id !== userId);
        db.records = db.records.filter(r => r.userId !== userId);
        saveDB(db);
        return true;
    }
};

module.exports = UserRepository;
