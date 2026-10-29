'use strict';
const { AppError } = require('../utils/errors');

// Services may be publicly reachable on Render. Re-check the current account
// instead of trusting a previously issued ADMIN role in the JWT alone.
async function requireAdmin(req, _res, next) {
  try {
    const response = await fetch(`${process.env.AUTH_SERVICE_URL || 'http://localhost:3001'}/api/v1/auth/verify`, {
      headers: { authorization: req.get('authorization') }, signal: AbortSignal.timeout(5000),
    });
    if (response.status === 401 || response.status === 403) throw new AppError(401, 'UNAUTHORIZED', 'Phiên đăng nhập không còn hiệu lực');
    if (!response.ok) throw new AppError(503, 'AUTH_UNAVAILABLE', 'Không thể xác minh quyền quản trị');
    const body = await response.json();
    if (body.success !== true || String(body.data?.id) !== req.user.userId) throw new AppError(401, 'UNAUTHORIZED', 'Phiên đăng nhập không hợp lệ');
    if (body.data.role !== 'ADMIN') throw new AppError(403, 'ADMIN_REQUIRED', 'Chỉ quản trị viên được thực hiện thao tác này');
    next();
  } catch (err) {
    next(err instanceof AppError ? err : new AppError(503, 'AUTH_UNAVAILABLE', 'Không thể xác minh quyền quản trị'));
  }
}
module.exports = { requireAdmin };
