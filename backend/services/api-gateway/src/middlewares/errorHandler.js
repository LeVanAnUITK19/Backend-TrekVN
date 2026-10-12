'use strict';

// ---------------------------------------------------------------------------
// Centralized error handler for the API Gateway.
//
// Must be registered AFTER all routes in app.js so Express recognises it as
// a 4-argument (err, req, res, next) error-handling middleware.
//
// Error mapping (Requirement 1.7):
//   • ECONNREFUSED            → the upstream service is not running
//   • ECONNRESET              → the upstream service closed the connection
//   • message includes 'timeout' → the proxy timed out waiting for a response
//   • AbortError              → the request was aborted (proxy timeout > 30 s)
//   Any of the above          → HTTP 503  {"success":false,"message":"Dịch vụ tạm thời không khả dụng"}
//
//   All other proxy / unexpected errors
//                             → HTTP 502  {"success":false,"message":"Lỗi kết nối đến dịch vụ"}
// ---------------------------------------------------------------------------

/**
 * Determine whether an error indicates that the upstream service is
 * unavailable (connection refused, reset, or timed out).
 *
 * @param {Error} err
 * @returns {boolean}
 */
function isServiceUnavailable(err) {
  if (err.code === 'ECONNREFUSED') return true;
  if (err.code === 'ECONNRESET') return true;
  if (err.name === 'AbortError') return true;
  if (typeof err.message === 'string' && err.message.toLowerCase().includes('timeout')) return true;
  return false;
}

/**
 * Express centralized error-handling middleware.
 *
 * @param {Error}                       err
 * @param {import('express').Request}   req
 * @param {import('express').Response}  res
 * @param {import('express').NextFunction} next  - Required 4th param so Express
 *                                                 treats this as an error handler.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (isServiceUnavailable(err)) {
    return res.status(503).json({
      success: false,
      message: 'Dịch vụ tạm thời không khả dụng',
    });
  }

  return res.status(502).json({
    success: false,
    message: 'Lỗi kết nối đến dịch vụ',
  });
}

module.exports = { errorHandler, isServiceUnavailable };
