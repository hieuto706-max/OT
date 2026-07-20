const { loadDB, saveDB } = require('../../db');

const TeamRepository = {
    async getAll() {
        const db = await loadDB(false);
        return db.teams || [];
    },

    async saveAll(teams) {
        const db = await loadDB(true);
        db.teams = teams;
        saveDB(db);
        return db.teams;
    },

    async updateTeamsAndUsers(teams, { oldName, newName, deletedTeam }) {
        const db = await loadDB(true);
        db.users = db.users || [];

        // Rename team for users
        if (oldName && newName) {
            db.users.forEach(u => {
                if (u.team === oldName) {
                    u.team = newName;
                }
            });
        }

        // Delete team for users
        if (deletedTeam) {
            db.users.forEach(u => {
                if (u.team === deletedTeam) {
                    u.team = '';
                }
            });
        }

        // Đồng bộ gán tên team tương ứng cho các Leader và xoá team cho các cựu Leader
        db.users.forEach(u => {
            if (u.role === 'admin') {
                const ledTeam = teams.find(t => {
                    if (t && typeof t === 'object') {
                        const ids = t.leaderIds || (t.leaderId ? [t.leaderId] : []);
                        return ids.includes(u.id);
                    }
                    return false;
                });
                if (ledTeam) {
                    u.team = ledTeam.name;
                } else {
                    u.team = u.isSuperAdmin ? 'admin' : '';
                }
            }
        });

        db.teams = teams;
        saveDB(db);
        return db.teams;
    }
};

module.exports = TeamRepository;
