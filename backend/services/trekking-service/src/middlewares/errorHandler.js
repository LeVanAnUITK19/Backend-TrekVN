'use strict';

const logger = require('../config/logger');
const { AppError } = require('../utils/errors');

/**
 * Error handler tập trung.
 * Format chuẩn: { success: false, error: { code, message, details }, requestId }
 */
const errorHandler = (err, req, res, _next) => {
  // Tạo requestId từ header nếu có (API Gateway thường inject)
  const requestId = req.headers['x-request-id'] || req.headers['x-correlation-id'];

  if (err instanceof AppError) {
    // Log ở level warn cho client errors, error cho server errors
    const logLevel = err.statusCode >= 500 ? 'error' : 'warn';
    logger[logLevel]({
      msg: err.message,
      code: err.code,
      statusCode: err.statusCode,
      details: err.details,
      requestId,
      path: req.path,
      method: req.method,
      userId: req.user?.userId,
    });

    return res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details || {},
      },
      requestId: requestId || undefined,
    });
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    if (err.keyValue?.trekkingRouteId !== undefined && err.keyValue?.sequence !== undefined) {
      const details = { field: 'sequence', sequence: err.keyValue.sequence, routeId: String(err.keyValue.trekkingRouteId) };
      const message = `Thứ tự ${details.sequence} đã có cột mốc trong cung đường này. Hãy chọn thứ tự khác.`;
      logger.warn(message, { code: 'MILESTONE_SEQUENCE_CONFLICT', details, path: req.path, requestId });
      return res.status(409).json({
        success: false,
        error: { code: 'MILESTONE_SEQUENCE_CONFLICT', message, details },
        requestId: requestId || undefined,
      });
    }
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    logger.warn({ msg: 'Duplicate key error', field, requestId });
    return res.status(409).json({
      success: false,
      error: {
        code: 'CONFLICT',
        message: `Giá trị trùng lặp cho trường: ${field}`,
        details: { field },
      },
      requestId: requestId || undefined,
    });
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const details = {};
    Object.keys(err.errors).forEach((key) => {
      details[key] = err.errors[key].message;
    });
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Dữ liệu không hợp lệ',
        details,
      },
      requestId: requestId || undefined,
    });
  }

  // Mongoose CastError (invalid ObjectId)
  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: `ID không hợp lệ: ${err.value}`,
        details: { field: err.path },
      },
      requestId: requestId || undefined,
    });
  }

  // Unhandled server error — không log stack trace nhạy cảm ra response
  logger.error({
    msg: 'Unhandled server error',
    err: err.message,
    stack: err.stack,
    requestId,
    path: req.path,
    method: req.method,
  });

  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      details: {},
    },
    requestId: requestId || undefined,
  });
};

module.exports = { errorHandler };
