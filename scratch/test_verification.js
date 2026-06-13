const http = require('http');
const fs = require('fs');
const path = require('path');

// Set custom database path for testing
const dbTestPath = path.join(__dirname, '..', 'db.json');
process.env.DB_PATH = dbTestPath;
process.env.PORT = '9999';

// Import server
const { startServer, stopServer, PORT } = require('../server/server');

async function runTests() {
    console.log('--- Starting verification tests ---');
    
    // Start local server
    const { ip, port } = await startServer();
    console.log(`Test server running at http://${ip}:${port}`);

    // Read users from db.json to use real test IDs
    const db = JSON.parse(fs.readFileSync(dbTestPath, 'utf-8'));
    
    // Let's find an employee user. If not exists, create one in the db.
    let employee = db.users.find(u => u.role === 'employee');
    if (!employee) {
        employee = {
            id: 'test_emp_id_123',
            username: 'testemp',
            fullname: 'Test Employee',
            role: 'employee',
            deviceId: 'test_device_id_abc'
        };
        db.users.push(employee);
        fs.writeFileSync(dbTestPath, JSON.stringify(db, null, 2), 'utf-8');
    } else {
        // Ensure it has a device ID
        employee.deviceId = 'test_device_id_abc';
        fs.writeFileSync(dbTestPath, JSON.stringify(db, null, 2), 'utf-8');
    }

    const userId = employee.id;
    const deviceId = employee.deviceId;

    // Helper to make request
    const makeRequest = (headers) => {
        return new Promise((resolve, reject) => {
            const req = http.request({
                hostname: '127.0.0.1',
                port: PORT,
                path: `/api/records?userId=${userId}`,
                method: 'GET',
                headers: headers
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    resolve({ statusCode: res.statusCode, body: JSON.parse(data) });
                });
            });
            req.on('error', reject);
            req.end();
        });
    };

    try {
        // Test Case 1: Valid headers
        console.log('Test Case 1: Valid x-user-id and x-device-id');
        const res1 = await makeRequest({
            'x-user-id': userId,
            'x-device-id': deviceId
        });
        console.log(`Result: Status ${res1.statusCode}`);
        if (res1.statusCode !== 200) throw new Error('Test Case 1 failed: Expected 200 OK');

        // Test Case 2: Mismatched device ID
        console.log('Test Case 2: Mismatched x-device-id');
        const res2 = await makeRequest({
            'x-user-id': userId,
            'x-device-id': 'wrong_device_id'
        });
        console.log(`Result: Status ${res2.statusCode}, Error: ${res2.body.error}`);
        if (res2.statusCode !== 403 || !res2.body.error.includes('hủy liên kết')) {
            throw new Error('Test Case 2 failed: Expected 403 Forbidden with device unlinked error');
        }

        // Test Case 3: Empty device ID in database
        console.log('Test Case 3: Empty deviceId in database');
        
        // Helper to update user deviceId via PUT /api/users/:id
        const updateUserDeviceId = (uId, newDeviceId) => {
            return new Promise((resolve, reject) => {
                const req = http.request({
                    hostname: '127.0.0.1',
                    port: PORT,
                    path: `/api/users/${uId}`,
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' }
                }, (res) => {
                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', () => {
                        resolve({ statusCode: res.statusCode });
                    });
                });
                req.on('error', reject);
                req.write(JSON.stringify({ deviceId: newDeviceId }));
                req.end();
            });
        };

        // Clear device link
        await updateUserDeviceId(userId, null);

        const res3 = await makeRequest({
            'x-user-id': userId,
            'x-device-id': deviceId
        });
        console.log(`Result: Status ${res3.statusCode}, Error: ${res3.body ? res3.body.error : 'none'}`);
        if (res3.statusCode !== 403 || !res3.body.error.includes('hủy liên kết')) {
            throw new Error('Test Case 3 failed: Expected 403 Forbidden with device unlinked error');
        }

        // Restore user device ID
        await updateUserDeviceId(userId, deviceId);

        // Test Case 4: Non-existent user
        console.log('Test Case 4: Non-existent user');
        const res4 = await makeRequest({
            'x-user-id': 'non_existent_id',
            'x-device-id': deviceId
        });
        console.log(`Result: Status ${res4.statusCode}, Error: ${res4.body.error}`);
        if (res4.statusCode !== 401 || !res4.body.error.includes('xóa khỏi hệ thống')) {
            throw new Error('Test Case 4 failed: Expected 401 Unauthorized with account deleted error');
        }

        console.log('--- All Verification Tests Passed Successfully! ---');
    } catch (e) {
        console.error('Test execution failed:', e.message);
    } finally {
        stopServer();
    }
}

runTests();
