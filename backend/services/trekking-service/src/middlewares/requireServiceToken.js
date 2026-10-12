'use strict';

const { UnauthorizedError } = require('../utils/errors');

/**
 * Middleware xác thực service-to-service token.
 *
 * Dùng cho các endpoint mà Agent Service gọi nội bộ sau khi Admin approve:
 *   - POST   /api/v1/admin/trekking/places          (create place)
 *   - PUT    /api/v1/admin/trekking/places/:id       (update place)
 *   - PUT    /api/v1/admin/trekking/places/:id/offline-map
 *   - PUT    /api/v1/admin/trekking/routes/:id/offline-map
 *
 * Cơ chế: check header X-Service-Token khớp với TREKVIET_INTERNAL_TOKEN trong env.
 *
 * Quan trọng:
 *   - Token KHÔNG bao giờ được expose ra frontend/Flutter.
 *   - Token phải là string ngẫu nhiên >= 48 bytes hex (không phải JWT).
 *   - Agent Service truyền token qua header, KHÔNG qua query string.
 *   - Nếu TREKVIET_INTERNAL_TOKEN không được set trong env thì tất cả
 *     service token request bị reject (fail-secure).
 */
const requireServiceToken = (req, _res, next) => {
  const internalToken = process.env.TREKVIET_INTERNAL_TOKEN;

  // Fail-secure: nếu server chưa config token thì không cho qua
  if (!internalToken) {
    return next(new UnauthorizedError('Service token not configured on server'));
  }

  const providedToken = req.headers['x-service-token'];

  if (!providedToken) {
    return next(new UnauthorizedError('Missing X-Service-Token header'));
  }

  // Constant-time comparison để tránh timing attack
  // Node.js crypto.timingSafeEqual yêu cầu cùng length nên dùng hash comparison
  const crypto = require('crypto');
  const expected = crypto
    .createHmac('sha256', internalToken)
    .update('trekviet-internal-v1')
    .digest('hex');
  const actual = crypto
    .createHmac('sha256', providedToken)
    .update('trekviet-internal-v1')
    .digest('hex');

  // timingSafeEqual so sánh Buffer cùng length
  const expectedBuf = Buffer.from(expected, 'hex');
  const actualBuf = Buffer.from(actual, 'hex');

  const valid =
    expectedBuf.length === actualBuf.length &&
    crypto.timingSafeEqual(expectedBuf, actualBuf);

  if (!valid) {
    return next(new UnauthorizedError('Invalid service token'));
  }

  // Inject synthetic req.user để các controller downstream hoạt động bình thường
  // (các controller expect req.user.userId)
  req.user = {
    userId: 'agent-service',
    role: 'ADMIN',
    email: 'agent-service@internal',
    isServiceCall: true,
  };

  next();
};

module.exports = { requireServiceToken };
