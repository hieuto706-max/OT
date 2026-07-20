const ipRequestCounts = new Map();

/**
 * Kiểm tra giới hạn tần suất yêu cầu của một IP.
 * @param {string} ip Địa chỉ IP của client
 * @param {string} keyPrefix Tiền tố định danh loại API (vd: "login", "otp")
 * @param {number} limit Số lượng request tối đa trong khoảng thời gian
 * @param {number} windowMs Khoảng thời gian giới hạn (tính bằng mili giây)
 * @returns {boolean} true nếu hợp lệ, false nếu vượt quá giới hạn
 */
function checkLimit(ip, keyPrefix, limit, windowMs) {
    const now = Date.now();
    const fullKey = `${keyPrefix}:${ip}`;
    
    if (!ipRequestCounts.has(fullKey)) {
        ipRequestCounts.set(fullKey, { count: 1, resetTime: now + windowMs });
        return true;
    }
    
    const data = ipRequestCounts.get(fullKey);
    if (now > data.resetTime) {
        data.count = 1;
        data.resetTime = now + windowMs;
        return true;
    }
    
    data.count++;
    return data.count <= limit;
}

module.exports = { checkLimit };
