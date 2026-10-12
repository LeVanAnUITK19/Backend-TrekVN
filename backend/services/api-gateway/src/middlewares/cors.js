'use strict';

const cors = require('cors');
const env = require('../config/env');

/**
 * CORS middleware — Requirement 1.9
 *
 * Cho phép cross-origin request từ các origin được liệt kê trong ALLOWED_ORIGINS.
 * Nếu ALLOWED_ORIGINS rỗng hoặc không được cấu hình, tất cả cross-origin request
 * đều bị từ chối (origin callback trả về lỗi).
 *
 * Same-origin / non-browser requests (origin === undefined) luôn được cho qua.
 */
const corsOptions = {
  origin: (origin, callback) => {
    // Cho phép same-origin hoặc non-browser requests (origin là undefined)
    if (!origin) return callback(null, true);

    if (env.ALLOWED_ORIGINS.length === 0) {
      return callback(new Error('CORS: no allowed origins configured'), false);
    }

    if (env.ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error(`CORS: origin ${origin} is not allowed`), false);
  },
  credentials: true,
};

module.exports = cors(corsOptions);
