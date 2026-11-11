const UserRepository = require('../repositories/userRepository');
const TeamRepository = require('../repositories/teamRepository');
const { sendJSON, sendError, parseBody } = require('../utils/http');

const TeamController = {
    async handle(req, res, urlPath, method) {
        if (urlPath === '/api/teams' && method === 'GET') {
            return this.getAll(req, res);
        }
        if (urlPath === '/api/teams' && method === 'POST') {
            return this.save(req, res);
        }

        return sendError(res, 404, 'Endpoint không tồn tại');
    },

    async getAll(req, res) {
        const teams = await TeamRepository.getAll();
        return sendJSON(res, 200, { teams });
    },

    async save(req, res) {
        const { userId: reqUserId } = req;
        
        // Phân quyền bắt buộc: Chỉ Admin và Sub-Admin mới được cấu hình team
        if (!reqUserId) {
            return sendError(res, 401, 'Vui lòng đăng nhập!', req);
        }
        const user = await UserRepository.findById(reqUserId);
        if (!user || user.role !== 'admin') {
            return sendError(res, 403, 'Bạn không có quyền thiết lập team!', req);
        }
        const body = await parseBody(req);
        const { teams, oldName, newName, deletedTeam } = body;
        if (!teams || !Array.isArray(teams)) {
            return sendError(res, 400, 'Danh sách team không hợp lệ!', req);
        }

        const updatedTeams = await TeamRepository.updateTeamsAndUsers(teams, { oldName, newName, deletedTeam });
        return sendJSON(res, 200, { success: true, teams: updatedTeams }, req);
    }
};

module.exports = TeamController;
