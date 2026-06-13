function isSessionExpired(loginTimeMs, currentTimeMs = Date.now()) {
    if (!loginTimeMs) return true;
    const loginDate = new Date(parseInt(loginTimeMs, 10));
    // Tạo mốc 5:00 AM ngày tiếp theo
    const cutoff = new Date(loginDate.getFullYear(), loginDate.getMonth(), loginDate.getDate() + 1, 5, 0, 0, 0);
    return currentTimeMs >= cutoff.getTime();
}

// Unit Tests
console.log('--- Running session expiration unit tests ---');

// Test Case 1: Logged in today at 10:00 AM, checking 1 hour later (today 11:00 AM)
const loginTime1 = new Date(2026, 5, 13, 10, 0, 0).getTime(); // June 13, 10:00 AM
const checkTime1 = new Date(2026, 5, 13, 11, 0, 0).getTime(); // June 13, 11:00 AM
console.log('Test 1:', !isSessionExpired(loginTime1, checkTime1) ? 'PASS' : 'FAIL');

// Test Case 2: Logged in today at 10:00 AM, checking tomorrow at 4:59 AM
const checkTime2 = new Date(2026, 5, 14, 4, 59, 0).getTime(); // June 14, 4:59 AM
console.log('Test 2:', !isSessionExpired(loginTime1, checkTime2) ? 'PASS' : 'FAIL');

// Test Case 3: Logged in today at 10:00 AM, checking tomorrow at 5:00 AM
const checkTime3 = new Date(2026, 5, 14, 5, 0, 0).getTime(); // June 14, 5:00 AM
console.log('Test 3:', isSessionExpired(loginTime1, checkTime3) ? 'PASS' : 'FAIL');

// Test Case 4: Logged in today at 10:00 AM, checking tomorrow at 10:00 AM
const checkTime4 = new Date(2026, 5, 14, 10, 0, 0).getTime(); // June 14, 10:00 AM
console.log('Test 4:', isSessionExpired(loginTime1, checkTime4) ? 'PASS' : 'FAIL');

console.log('--- Session unit tests completed ---');
