const logger = require('../config/logger');
const { AppError } = require('../utils/errors');

const errorHandler = (err, req, res, _next) => {
  logger.error(err);
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ success: false, message: err.message });
  }
  res.status(500).json({ success: false, message: 'Internal server error' });
};

module.exports = { errorHandler };
