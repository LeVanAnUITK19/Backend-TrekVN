'use strict';
const winston = require('winston');
module.exports = winston.createLogger({
  level: process.env.NODE_ENV === 'test' ? 'error' : 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  defaultMeta: { service: 'community-service' },
  transports: [new winston.transports.Console()],
});
