'use strict';

require('dotenv').config();
const { connectDB } = require('./config/database');
const createApp = require('./app');
const logger = require('./config/logger');
const publisher = require('./events/publishers/trekking.publisher');
const outboxWorker = require('./events/publishers/outbox.worker');
const trekkingConsumer = require('./events/consumers/trekking.consumer');

const PORT = process.env.PORT || 3003;

const startServer = async () => {
  await connectDB();

  const app = createApp();

  // Start outbox worker + consumer after DB is connected
  if (process.env.RABBITMQ_ENABLED === 'true' || process.env.GAMIFICATION_HTTP_ENABLED === 'true') {
    outboxWorker.start();
    trekkingConsumer.start().catch((err) =>
      logger.error(`[TrekkingConsumer] Failed to start: ${err.message}`)
    );
  }

  const server = app.listen(PORT, () => {
    logger.info(`Trekking Service running on port ${PORT}`);
    logger.info(`Swagger UI: http://localhost:${PORT}/api-docs`);
  });

  // ─── Graceful shutdown ────────────────────────────────────────────────────
  const shutdown = async (signal) => {
    logger.info(`${signal} received — shutting down gracefully`);
    outboxWorker.stop();
    server.close(async () => {
      await trekkingConsumer.close();
      await publisher.close();
      logger.info('HTTP server closed');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  return server;
};

startServer().catch((err) => {
  logger.error('Failed to start server:', err);
  process.exit(1);
});
