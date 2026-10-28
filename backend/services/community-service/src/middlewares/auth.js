'use strict';
const jwt = require('jsonwebtoken');
const { AppError } = require('../utils/errors');

function verifyToken(token) {
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    const userId = payload.sub || payload.id || payload.userId;
    if (typeof userId !== 'string' || !userId || !Number.isFinite(payload.exp)) throw new Error('Invalid claims');
    return { userId, role: payload.role || 'USER', exp: payload.exp };
  } catch {
    throw new AppError(401, 'UNAUTHORIZED', 'Token không hợp lệ hoặc đã hết hạn');
  }
}
function authenticate(req, _res, next) {
  try {
    const header = req.get('authorization') || '';
    if (!header.startsWith('Bearer ')) throw new AppError(401, 'UNAUTHORIZED', 'Vui lòng đăng nhập');
    req.user = verifyToken(header.slice(7));
    next();
  } catch (err) { next(err); }
}
module.exports = { authenticate, verifyToken };
