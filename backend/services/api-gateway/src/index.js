'use strict';

const app = require('./app');
const env = require('./config/env');

const PORT = env.PORT;

const server = app.listen(PORT, () => {
  console.log(`[api-gateway] listening on port ${PORT}`);
  console.log(`[api-gateway] proxying /api/v1/* → ${env.AUTH_SERVICE_URL}`);
  console.log(
    `[api-gateway] allowed origins: ${
      env.ALLOWED_ORIGINS.length > 0
        ? env.ALLOWED_ORIGINS.join(', ')
        : '(none — all cross-origin requests blocked)'
    }`
  );
});

const closeCommunityUpgrade = require('./routes/communityUpgrade').attachCommunityUpgrade(server);

// Graceful shutdown
process.on('SIGTERM', () => {
  closeCommunityUpgrade();
  console.log('[api-gateway] SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('[api-gateway] server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  closeCommunityUpgrade();
  console.log('[api-gateway] SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('[api-gateway] server closed');
    process.exit(0);
  });
});

module.exports = server;
