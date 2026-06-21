const http = require('http');

function request(url, options = {}) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const reqOpts = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
            path: parsedUrl.pathname + parsedUrl.search,
            method: options.method || 'GET',
            headers: options.headers || {}
        };
        
        const req = http.request(reqOpts, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(parsed);
                    } else {
                        reject(new Error(parsed.error || `HTTP ${res.statusCode}`));
                    }
                } catch (e) {
                    reject(new Error(`Failed to parse response: ${data}`));
                }
            });
        });
        
        req.on('error', reject);
        if (options.body) {
            req.write(JSON.stringify(options.body));
        }
        req.end();
    });
}

async function run() {
    console.log("=== Admin Team & Username Update API Verification ===");
    
    // Step 1: Login
    console.log("1. Logging in as Admin...");
    let loginRes;
    try {
        loginRes = await request('http://127.0.0.1:3456/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: { username: 'admin', password: 'admin' }
        });
        console.log("   Login success!");
    } catch (e) {
        console.error("   Login failed:", e.message);
        process.exit(1);
    }
    
    const token = loginRes.token;
    
    // Step 2: Fetch all users and find the user testemp
    console.log("2. Fetching user list...");
    let usersList;
    try {
        const res = await request('http://127.0.0.1:3456/api/users', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        usersList = res.users;
    } catch (e) {
        console.error("   Failed to fetch users:", e.message);
        process.exit(1);
    }
    
    const testemp = usersList.find(u => u.username === 'testemp');
    if (!testemp) {
        console.error("   Could not find 'testemp' user in database.");
        process.exit(1);
    }
    
    // Step 3: Try to change testemp username to testemp_new
    console.log(`3. Updating username for ${testemp.fullname} (ID: ${testemp.id}) to 'testemp_new'...`);
    try {
        const updateRes = await request(`http://127.0.0.1:3456/api/users/${testemp.id}`, {
            method: 'PUT',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: { 
                fullname: testemp.fullname,
                username: 'testemp_new',
                role: 'employee',
                team: testemp.team 
            }
        });
        console.log("   Update success! New username is:", updateRes.user.username);
    } catch (e) {
        console.error("   Update username failed:", e.message);
        process.exit(1);
    }
    
    // Step 4: Revert username back to 'testemp'
    console.log(`4. Reverting username back to 'testemp'...`);
    try {
        await request(`http://127.0.0.1:3456/api/users/${testemp.id}`, {
            method: 'PUT',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: { 
                fullname: testemp.fullname,
                username: 'testemp',
                role: 'employee',
                team: testemp.team 
            }
        });
        console.log("   Revert success!");
    } catch (e) {
        console.error("   Revert username failed:", e.message);
    }
    
    // Step 5: Test admin role team default assignment
    console.log("5. Testing team default assignment for new Admin user...");
    let createdUserId;
    try {
        const registerRes = await request('http://127.0.0.1:3456/api/auth/register', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: {
                fullname: 'Admin Test Default',
                username: 'admintestdefault',
                password: 'password123',
                role: 'admin'
            }
        });
        createdUserId = registerRes.user.id;
        console.log(`   User created! Role: ${registerRes.user.role}, Assigned Team: ${registerRes.user.team}`);
        if (registerRes.user.team === 'admin') {
            console.log("   Verification SUCCESS: New Admin correctly got default team 'admin'!");
        } else {
            console.error("   Verification FAILED: Admin did not get default team 'admin'.");
        }
    } catch (e) {
        console.error("   Registration failed:", e.message);
    }
    
    // Step 6: Clean up the created test admin
    if (createdUserId) {
        console.log("6. Cleaning up test admin user...");
        try {
            await request(`http://127.0.0.1:3456/api/users/${createdUserId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            console.log("   Cleanup success!");
        } catch (e) {
            console.error("   Cleanup failed:", e.message);
        }
    }
}

run();
