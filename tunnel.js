const { spawn } = require('child_process');
const https = require('https');
const os = require('os');

const EDIT_CODE = 'otmanager3456';
const RENTRY_URL = 'otmanager-hieutm-3456';

function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return '127.0.0.1';
}

function updateRentry(url) {
    const data = new URLSearchParams({
        text: url,
        edit_code: EDIT_CODE
    }).toString();

    const options = {
        hostname: 'rentry.co',
        port: 443,
        path: `/api/edit/${RENTRY_URL}`,
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(data),
            'User-Agent': 'Mozilla/5.0'
        }
    };

    const req = https.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
            console.log(`[Tunnel] Rentry registry updated successfully to: ${url}`);
        });
    });

    req.on('error', (e) => {
        console.error('[Tunnel] Error updating Rentry:', e.message);
    });

    req.write(data);
    req.end();
}

function startTunnel() {
    console.log(`[Tunnel] Starting localhost.run tunnel in background for 127.0.0.1:3456...`);
    const ssh = spawn('ssh', [
        '-o', 'StrictHostKeyChecking=no',
        '-R', '80:127.0.0.1:3456',
        'localhost.run'
    ]);

    let resolved = false;

    ssh.stdout.on('data', (data) => {
        const str = data.toString();
        // Log clean output
        const lines = str.trim().split('\n');
        for (const line of lines) {
            if (line.includes('tunneled')) {
                const match = line.match(/(https:\/\/[a-zA-Z0-9.-]+\.[a-zA-Z]+)/);
                if (match && !resolved) {
                    const url = match[1];
                    resolved = true;
                    console.log(`[Tunnel] Public URL established: ${url}`);
                    updateRentry(url);
                }
            }
        }
    });

    ssh.stderr.on('data', (data) => {
        // Silent fail unless needed for debugging
    });

    ssh.on('error', (err) => {
        console.error('[Tunnel] Lỗi khởi chạy tiến trình SSH (lệnh ssh có thể chưa được cài đặt):', err.message);
    });

    ssh.on('close', (code) => {
        console.log(`[Tunnel] SSH process exited with code ${code}. Restarting in 5s...`);
        resolved = false;
        setTimeout(startTunnel, 5000);
    });
}

module.exports = { startTunnel, updateRentry };
