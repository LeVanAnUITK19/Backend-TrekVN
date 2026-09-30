const jwt = require('jsonwebtoken');
const { UnauthorizedError } = require('../utils/errors');

/**
 * Middleware xác thực JWT từ auth-service.
 * Header: Authorization: Bearer <accessToken>
 *
 * JWT từ auth-service chứa: { id, email, role }
 * Middleware normalize thành req.user = { userId, role }
 * để các handler dùng req.user.userId nhất quán.
 */
const authenticate = (req, _res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Authorization token required'));
  }

  const token = authHeader.split(' ')[1];

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    // auth-service dùng field "id" trong payload, spec yêu cầu userId.
    // Support cả "sub", "id" để tương thích nếu format thay đổi.
    const userId = payload.sub || payload.id || payload.userId;
    if (!userId) {
      return next(new UnauthorizedError('Invalid token payload'));
    }

    req.user = {
      userId: String(userId),
      role: payload.role || 'USER',
      email: payload.email,
    };
    next();
  } catch {
    next(new UnauthorizedError('Invalid or expired token'));
  }
};

module.exports = { authenticate };
