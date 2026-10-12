require('dotenv').config();
const { connectDB } = require('./config/database');
const createApp = require('./app');
const logger = require('./config/logger');
const publisher = require('./events/publishers/checkin.publisher');
const outboxWorker = require('./events/publishers/outbox.worker');

const PORT = process.env.PORT || 3002;

const startServer = async () => {
  await connectDB();

  const app = createApp();
  outboxWorker.start();

  const server = app.listen(PORT, () => {
    logger.info(`CheckIn Service running on port ${PORT}`);
    logger.info(`Swagger UI: http://localhost:${PORT}/api-docs`);
  });

  // ─── Graceful shutdown ──────────────────────────────────────────────────────
  const shutdown = async (signal) => {
    logger.info(`${signal} received — shutting down gracefully`);
    server.close(async () => {
      outboxWorker.stop();
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
