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
        winston.format.printf(({ level, message, timestamp, stack, ...meta }) => {
          // Stringify objects and errors properly
          let output = `${level}: ${message}`;
          
          // Add stack trace if present
          if (stack) {
            output += `\n${stack}`;
          }
          
          // Add metadata if present
          const metaKeys = Object.keys(meta).filter(key => key !== 'timestamp');
          if (metaKeys.length > 0) {
            output += ` ${JSON.stringify(meta)}`;
          }
          
          output += ` {"timestamp":"${timestamp}"}`;
          return output;
        })
      ),
    }),
  ],
});

module.exports = logger;
