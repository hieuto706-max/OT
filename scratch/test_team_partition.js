const http = require('http');
const fs = require('fs');
const path = require('path');

const dbTestPath = path.join(__dirname, '..', 'db.json');
process.env.DB_PATH = dbTestPath;
process.env.PORT = '9998';

const { startServer, stopServer, PORT } = require('../server/server');

// Helper to make requests
function request(options, body = null) {
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: '127.0.0.1',
            port: PORT,
            headers: { 'Content-Type': 'application/json' },
            ...options
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                let parsed = null;
                try {
                    parsed = data ? JSON.parse(data) : {};
                } catch(e) {
                    parsed = { text: data };
                }
                resolve({ statusCode: res.statusCode, body: parsed });
            });
        });
        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function runTests() {
    console.log('--- Starting Team Partitioning Verification Tests ---');

    // Backup current db.json
    const dbBackup = fs.readFileSync(dbTestPath, 'utf-8');

    // Start server
    const { ip, port } = await startServer();
    console.log(`Test server running at http://${ip}:${port}`);

    try {
        // 1. Create a sub-admin manager
        console.log('1. Creating a sub-admin...');
        const resSub = await request({ path: '/api/auth/register', method: 'POST' }, {
            fullname: 'Sub-admin Manager',
            username: 'subadmin_test',
            password: 'pwd_subadmin',
            role: 'admin'
        });
        if (resSub.statusCode !== 201) throw new Error(`Failed to create sub-admin: ${resSub.body.error}`);
        const subadminId = resSub.body.user.id;

        // 2. Create another admin manager
        console.log('2. Creating another admin...');
        const resOtherAdmin = await request({ path: '/api/auth/register', method: 'POST' }, {
            fullname: 'Other Admin',
            username: 'otheradmin_test',
            password: 'pwd_otheradmin',
            role: 'admin'
        });
        if (resOtherAdmin.statusCode !== 201) throw new Error(`Failed to create other admin: ${resOtherAdmin.body.error}`);
        const otherAdminId = resOtherAdmin.body.user.id;

        // 3. Create employees
        // Employee 1: Unassigned
        console.log('3. Registering employees...');
        const resEmpUnassigned = await request({ path: '/api/auth/register', method: 'POST' }, {
            fullname: 'Unassigned Employee',
            username: 'unassigned_test',
            role: 'employee',
            managerId: ''
        });
        const unassignedId = resEmpUnassigned.body.user.id;

        // Employee 2: Assigned to subadmin_test
        const resEmpTeam = await request({ path: '/api/auth/register', method: 'POST', headers: { 'x-user-id': subadminId } }, {
            fullname: 'Team Employee',
            username: 'teamemp_test',
            role: 'employee',
            managerId: subadminId
        });
        const teamEmpId = resEmpTeam.body.user.id;

        // Employee 3: Assigned to otheradmin_test
        const resEmpOtherTeam = await request({ path: '/api/auth/register', method: 'POST', headers: { 'x-user-id': otherAdminId } }, {
            fullname: 'Other Team Employee',
            username: 'otheremp_test',
            role: 'employee',
            managerId: otherAdminId
        });
        const otherEmpId = resEmpOtherTeam.body.user.id;

        // 4. Test GET /api/users for subadmin_test
        console.log('4. Testing GET /api/users for sub-admin manager...');
        const resGetUsers = await request({
            path: '/api/users',
            method: 'GET',
            headers: { 'x-user-id': subadminId }
        });
        if (resGetUsers.statusCode !== 200) throw new Error('GET /api/users failed');
        const visibleUsers = resGetUsers.body.users;
        const visibleUserIds = visibleUsers.map(u => u.id);

        // Subadmin should see: admins (including superadmin, otheradmin, themselves), teamemp_test, unassigned_test
        // It should NOT see otheremp_test
        console.log(' - Verifying user visibility boundaries...');
        if (!visibleUserIds.includes(subadminId)) throw new Error('Sub-admin cannot see themselves');
        if (!visibleUserIds.includes(unassignedId)) throw new Error('Sub-admin cannot see unassigned employees');
        if (!visibleUserIds.includes(teamEmpId)) throw new Error('Sub-admin cannot see their team employee');
        if (visibleUserIds.includes(otherEmpId)) throw new Error('Sub-admin can see another team\'s employee (Boundary Violation!)');
        console.log(' -> User visibility tests passed.');

        // 5. Test GET /api/records for subadmin_test
        console.log('5. Testing GET /api/records team filtration...');
        // Create OT record for each user
        await request({ path: '/api/records', method: 'POST', headers: { 'x-user-id': subadminId } }, {
            userId: subadminId, date: '2026-06-18', hasLunchOT: true, totalHours: 1, note: 'Self OT'
        });
        await request({ path: '/api/records', method: 'POST', headers: { 'x-user-id': subadminId } }, {
            userId: teamEmpId, date: '2026-06-18', hasLunchOT: true, totalHours: 1, note: 'Team Emp OT'
        });
        await request({ path: '/api/records', method: 'POST', headers: { 'x-user-id': subadminId } }, {
            userId: unassignedId, date: '2026-06-18', hasLunchOT: true, totalHours: 1, note: 'Unassigned OT'
        });
        await request({ path: '/api/records', method: 'POST', headers: { 'x-user-id': otherAdminId } }, {
            userId: otherEmpId, date: '2026-06-18', hasLunchOT: true, totalHours: 1, note: 'Other Team OT'
        });

        const resGetRecords = await request({
            path: '/api/records',
            method: 'GET',
            headers: { 'x-user-id': subadminId }
        });
        const records = resGetRecords.body.records;
        const recordUserIds = records.map(r => r.userId);
        
        if (!recordUserIds.includes(subadminId)) throw new Error('Sub-admin cannot see their own record');
        if (!recordUserIds.includes(teamEmpId)) throw new Error('Sub-admin cannot see team record');
        if (!recordUserIds.includes(unassignedId)) throw new Error('Sub-admin cannot see unassigned record');
        if (recordUserIds.includes(otherEmpId)) throw new Error('Sub-admin can see another team\'s record (Boundary Violation!)');
        console.log(' -> Record filtering tests passed.');

        // 6. Test sub-admin editing unassigned employee to pull them to their team
        console.log('6. Testing sub-admin pulling unassigned employee to their team...');
        const resEditUnassigned = await request({
            path: `/api/users/${unassignedId}`,
            method: 'PUT',
            headers: { 'x-user-id': subadminId }
        }, {
            fullname: 'Unassigned Employee Pulled',
            managerId: subadminId
        });
        if (resEditUnassigned.statusCode !== 200) throw new Error(`Failed to update unassigned employee: ${resEditUnassigned.body.error}`);
        if (resEditUnassigned.body.user.managerId !== subadminId) throw new Error('Manager assignment failed on edit');
        console.log(' -> Successfully pulled unassigned employee.');

        // 7. Test sub-admin editing another team's employee (Should be forbidden)
        console.log('7. Testing editing boundary (modifying other team)...');
        const resEditOther = await request({
            path: `/api/users/${otherEmpId}`,
            method: 'PUT',
            headers: { 'x-user-id': subadminId }
        }, {
            fullname: 'Hacker Edit'
        });
        console.log(` - Result: Status ${resEditOther.statusCode}, Error: ${resEditOther.body.error}`);
        if (resEditOther.statusCode !== 403) throw new Error('Expected 403 Forbidden when editing another team\'s user');
        console.log(' -> Editing boundary test passed.');

        // 8. Test statistics filtration for sub-admin
        console.log('8. Testing team statistics...');
        const resStats = await request({
            path: '/api/stats',
            method: 'GET',
            headers: { 'x-user-id': subadminId }
        });
        if (resStats.statusCode !== 200) throw new Error('GET /api/stats failed');
        // Total team employees should be 2 now (teamemp_test and unassigned_test who was pulled)
        console.log(` - Stats total users: ${resStats.body.totalUsers}`);
        if (resStats.body.totalUsers !== 2) throw new Error(`Expected stats totalUsers to be 2, got ${resStats.body.totalUsers}`);
        console.log(' -> Stats partitioning tests passed.');

        console.log('--- ALL TEAM PARTITIONING TESTS PASSED SUCCESSFULLY! ---');
    } catch (e) {
        console.error('❌ Test failed:', e.message);
    } finally {
        // Stop server
        stopServer();
        // Restore db.json
        fs.writeFileSync(dbTestPath, dbBackup, 'utf-8');
        console.log('Database restored.');
    }
}

runTests();
