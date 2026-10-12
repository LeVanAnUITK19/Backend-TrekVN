require('dotenv').config();
const { connectDB } = require('./config/database');
const createApp = require('./app');
const logger = require('./config/logger');
const gamificationConsumer = require('./events/consumers/gamification.consumer');

const PORT = process.env.PORT || 3001;

const startServer = async () => {
  await connectDB();

  const app = createApp();

  // Start gamification event consumer
  gamificationConsumer.start().catch((err) =>
    logger.error(`[GamificationConsumer] Failed to start: ${err.message}`)
  );

  const server = app.listen(PORT, () => {
    logger.info(`Auth Service running on port ${PORT}`);
    logger.info(`Swagger UI: http://localhost:${PORT}/api-docs`);
  });

  // ─── Graceful shutdown ──────────────────────────────────────────────────────
  const shutdown = async (signal) => {
    logger.info(`${signal} received — shutting down gracefully`);
    server.close(async () => {
      await gamificationConsumer.close();
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
