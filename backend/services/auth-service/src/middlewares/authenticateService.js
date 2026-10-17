'use strict';

/**
 * Middleware xác thực service-to-service communication.
 * Kiểm tra X-Service-Token header.
 */

// Đọc từ TREKVIET_INTERNAL_TOKEN để nhất quán với trekking-service và agent-service
const SERVICE_TOKEN = process.env.TREKVIET_INTERNAL_TOKEN || process.env.SERVICE_TOKEN;

const authenticateService = (req, res, next) => {
  const token = req.headers['x-service-token'];

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Service token required',
    });
  }

  if (!SERVICE_TOKEN) {
    console.error('[AuthService] SERVICE_TOKEN not configured in environment');
    return res.status(500).json({
      success: false,
      message: 'Service authentication not configured',
    });
  }

  if (token !== SERVICE_TOKEN) {
    return res.status(403).json({
      success: false,
      message: 'Invalid service token',
    });
  }

  // Token valid - cho phép request đi tiếp
  next();
};

module.exports = { authenticateService };
