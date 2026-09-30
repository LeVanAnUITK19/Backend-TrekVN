require('dotenv').config();
const { connectDB } = require('./config/database');
const createApp = require('./app');
const logger = require('./config/logger');

const PORT = process.env.PORT || 3002;

/**
 * Khởi động HTTP server:
 *  1. Kết nối MongoDB
 *  2. Tạo Express app
 *  3. Lắng nghe port
 */
const startServer = async () => {
  await connectDB();

  const app = createApp();

  const server = app.listen(PORT, () => {
    logger.info(`CheckIn Service running on port ${PORT}`);
    logger.info(`Swagger UI: http://localhost:${PORT}/api-docs`);
  });

  // ─── Graceful shutdown ──────────────────────────────────────────────────────
  const shutdown = (signal) => {
    logger.info(`${signal} received — shutting down gracefully`);
    server.close(() => {
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
