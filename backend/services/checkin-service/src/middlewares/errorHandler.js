const logger = require('../config/logger');
const { AppError } = require('../utils/errors');

/**
 * Error handler trả về format chuẩn:
 * { success: false, error: { code, message, details } }
 */
const errorHandler = (err, req, res, _next) => {
  logger.error(err);

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details || {},
      },
    });
  }

  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      details: {},
    },
  });
};

module.exports = { errorHandler };
