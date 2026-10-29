'use strict';
const { AppError } = require('../utils/errors');
async function currentSession(req, _res, next) {
  try {
    const r = await fetch(`${process.env.AUTH_SERVICE_URL || 'http://localhost:3001'}/api/v1/auth/verify`, {
      headers: { authorization: req.get('authorization') }, signal: AbortSignal.timeout(5000),
    });
    if (r.status === 401 || r.status === 403) throw new AppError(401, 'UNAUTHORIZED', 'Phiên đăng nhập không còn hiệu lực');
    if (!r.ok) throw new Error('Auth unavailable');
    const body = await r.json();
    if (body.success !== true || String(body.data?.id) !== req.user.userId) throw new AppError(401, 'UNAUTHORIZED', 'Phiên đăng nhập không hợp lệ');
    next();
  } catch (err) { next(err instanceof AppError ? err : new AppError(503, 'AUTH_UNAVAILABLE', 'Không thể xác minh phiên')); }
}
module.exports = { currentSession };
