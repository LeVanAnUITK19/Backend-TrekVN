'use strict';

const { authenticate } = require('./auth');
const { requireServiceToken } = require('./requireServiceToken');

/**
 * Combined middleware: cho phép request đi qua nếu:
 *   1. Có X-Service-Token hợp lệ (Agent Service call)
 *   OR
 *   2. Có Bearer JWT hợp lệ với role=ADMIN (Admin Web call)
 *
 * Dùng để các agent-service endpoint hoạt động với cả 2 luồng:
 *   - Admin Web dùng Bearer token như bình thường
 *   - Agent Service dùng X-Service-Token
 *
 * Không cần requireAdmin sau middleware này vì:
 *   - Service token route: req.user.role = 'ADMIN' được inject
 *   - Admin JWT route: requireAdmin check như thường
 */
const authenticateOrService = (req, res, next) => {
  // Ưu tiên kiểm tra service token trước (không overlap với user JWT)
  const serviceToken = req.headers['x-service-token'];

  if (serviceToken) {
    // Có service token header → dùng service auth
    return requireServiceToken(req, res, next);
  }

  // Không có service token → thử authenticate JWT như bình thường
  return authenticate(req, res, next);
};

module.exports = { authenticateOrService };
