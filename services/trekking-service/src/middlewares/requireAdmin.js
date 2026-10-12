'use strict';

const { ForbiddenError } = require('../utils/errors');

/**
 * Middleware kiểm tra role ADMIN.
 * Phải dùng sau authenticate middleware.
 * FR-ADM-01: Chỉ role ADMIN truy cập API quản trị.
 */
const requireAdmin = (req, _res, next) => {
  if (!req.user || req.user.role !== 'ADMIN') {
    return next(new ForbiddenError('Chỉ Admin mới có quyền thực hiện thao tác này', 'FORBIDDEN'));
  }
  next();
};

module.exports = { requireAdmin };
