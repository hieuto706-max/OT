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
    console.log("=== API Verification ===");
    
    // Step 1: Login as Admin
    console.log("1. Logging in as Admin...");
    let loginRes;
    try {
        loginRes = await request('http://127.0.0.1:3456/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: { username: 'admin', password: 'admin' }
        });
        console.log("   Login success! Token retrieved.");
    } catch (e) {
        console.error("   Login failed:", e.message);
        process.exit(1);
    }
    
    const token = loginRes.token;
    const adminUser = loginRes.user;
    
    // Step 2: Update Admin's fullname & password
    console.log(`2. Updating Admin profile (ID: ${adminUser.id})...`);
    try {
        const updateRes = await request(`http://127.0.0.1:3456/api/users/${adminUser.id}`, {
            method: 'PUT',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: { 
                fullname: 'Quản trị viên Cấp cao', 
                password: 'admin', 
                role: 'admin', 
                team: '' 
            }
        });
        console.log("   Update success! User updated:", updateRes.user.fullname);
    } catch (e) {
        console.error("   Update failed:", e.message);
        process.exit(1);
    }

    // Step 3: Verify the updated fullname
    console.log("3. Fetching user list to verify changes...");
    try {
        const listRes = await request('http://127.0.0.1:3456/api/users', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const adminFromList = listRes.users.find(u => u.username === 'admin');
        console.log("   Admin fullname in DB:", adminFromList.fullname);
        if (adminFromList.fullname === 'Quản trị viên Cấp cao') {
            console.log("   Verification SUCCESS: Profile correctly updated!");
        } else {
            console.error("   Verification FAILED: Name not updated in DB.");
        }
    } catch (e) {
        console.error("   Verification failed:", e.message);
        process.exit(1);
    }
    
    // Step 4: Revert Admin name back to default to leave DB clean
    console.log("4. Restoring original name...");
    try {
        await request(`http://127.0.0.1:3456/api/users/${adminUser.id}`, {
            method: 'PUT',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: { 
                fullname: 'Quản trị viên', 
                role: 'admin', 
                team: '' 
            }
        });
        console.log("   Restore completed!");
    } catch (e) {
        console.error("   Restore failed:", e.message);
    }
}

run();
