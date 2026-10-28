'use strict';
const logger = require('../config/logger');
function errorHandler(err, _req, res, _next) {
  let status = err.statusCode || err.status || 500;
  let code = err.code || 'INTERNAL_ERROR';
  let message = err.message;
  if (err.name === 'ValidationError' || err.name === 'CastError') {
    status = 400; code = 'VALIDATION_ERROR'; message = 'Dữ liệu không hợp lệ';
  }
  if (err.code === 11000) { status = 409; code = 'CONFLICT'; message = 'Dữ liệu bị trùng'; }
  if (status >= 500) { logger.error({ message: err.message }); message = 'Dịch vụ tạm thời không khả dụng'; }
  res.status(status).json({ success: false, error: { code, message } });
}
module.exports = { errorHandler };
