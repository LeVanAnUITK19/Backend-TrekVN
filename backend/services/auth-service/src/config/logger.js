const winston = require('winston');

const logger = winston.createLogger({
  // Tắt log hoàn toàn khi chạy test để output Jest sạch hơn
  silent: process.env.NODE_ENV === 'test',
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
  ],
});

module.exports = logger;
