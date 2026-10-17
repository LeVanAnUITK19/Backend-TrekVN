'use strict';

require('dotenv').config();

const env = {
  PORT: parseInt(process.env.PORT, 10) || 3000,
  AUTH_SERVICE_URL: process.env.AUTH_SERVICE_URL || 'http://localhost:3001',
  CHECKIN_SERVICE_URL: process.env.CHECKIN_SERVICE_URL || 'http://localhost:3002',
  TREKKING_SERVICE_URL: process.env.TREKKING_SERVICE_URL || 'http://localhost:3003',
  AGENT_SERVICE_URL: process.env.AGENT_SERVICE_URL || 'http://localhost:8000',
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
    : [],
  // Rate limit — configurable per SRS NFR-SYNC-01
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
  RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 200,
};

module.exports = env;
