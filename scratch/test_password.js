const crypto = require('crypto');

const stored = "pbkdf2$100000$baaa2d0089956d31a179480bf11dda7a$789e70022bc7c03cf2c19bde682566441407a839f45fdce6b23d4ed4879c512b170d14ea6a9368a0199eac1a0f06341b3fba345703a14df94121e42802a45b25";

const parts = stored.split('$');
const iterations = parseInt(parts[1], 10);
const salt = parts[2];
const storedHash = parts[3];

const candidates = ["admin", "admin123", "password123", "123456", "password"];

for (const candidate of candidates) {
    const hash = crypto.pbkdf2Sync(candidate, salt, iterations, 64, 'sha512').toString('hex');
    if (hash === storedHash) {
        console.log(`FOUND! The password is: ${candidate}`);
        process.exit(0);
    }
}

console.log("None of the common candidates matched.");
