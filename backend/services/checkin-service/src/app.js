const express = require('express');
const { createMetrics } = require('./middlewares/metrics');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { identifyQuotaUser, quotaKey } = require('./middlewares/requestQuota');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');

const routes = require('./routes');
const internalRoutes = require('./routes/internal.routes');
const { errorHandler } = require('./middlewares/errorHandler');
const { notFound } = require('./middlewares/notFound');

// ─── Factory function — trả về Express app đã được cấu hình ──────────────────
const createApp = () => {
  const app = express();
  const monitoring = createMetrics('checkin-service');
  app.use(monitoring.middleware);
  // Register before API auth, rate limiting and body parsing.
  app.get('/metrics', monitoring.handler);
  if (process.env.TRUSTED_PROXIES) {
    app.set('trust proxy', process.env.TRUSTED_PROXIES.split(',').map((ip) => ip.trim()).filter(Boolean));
  } else if (process.env.NODE_ENV !== 'test') {
    app.set('trust proxy', 'loopback');
  }

  // ─── Swagger ────────────────────────────────────────────────────────────────
  const swaggerOptions = {
    definition: {
      openapi: '3.0.0',
      info: {
        title: 'CheckIn Service API',
        version: '1.0.0',
        description:
          'API tài liệu cho CheckIn Service của TrekVN — xử lý check-in địa điểm trekking, lịch sử ghé thăm',
      },
      servers: [{ url: 'http://localhost:3002', description: 'Development server' }],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'Nhập accessToken nhận được từ auth-service',
          },
        },
      },
    },
    apis: [require('path').join(__dirname, 'routes/*.js').replaceAll('\\', '/')],
  };

  const swaggerSpec = swaggerJsdoc(swaggerOptions);
  const exportedSpec = require('./config/openapi.json');
  swaggerSpec.paths = exportedSpec.paths;
  swaggerSpec.components = exportedSpec.components;

  // ─── Middlewares ─────────────────────────────────────────────────────────────
  app.use(helmet());
  // CORS được xử lý ở api-gateway. Service này chỉ nhận request từ gateway.
  app.use(cors({
    origin: process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
      : ['http://localhost:3000'],
    credentials: true,
  }));

  // Rate limiting chỉ áp dụng ở production để test không bị chặn
  if (process.env.NODE_ENV !== 'test' && process.env.DISABLE_RATE_LIMIT !== 'true') {
    app.use(identifyQuotaUser);
    const limiter = rateLimit({
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
      max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 600,
      keyGenerator: quotaKey,
      standardHeaders: true,
      legacyHeaders: false,
      skip: (req) => req.path === '/health' || req.path === '/ready',
    });
    app.use(limiter);
  }

  app.use(morgan(process.env.NODE_ENV === 'test' ? 'silent' : 'combined'));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // ─── Routes ──────────────────────────────────────────────────────────────────
  app.get('/health', (_req, res) =>
    res.json({ status: 'ok', service: 'checkin-service' })
  );

  // ─── Internal routes (service-to-service, không qua API Gateway) ─────────
  app.use('/internal/v1', internalRoutes);

  app.use('/api/v1', routes);

  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

  app.use(notFound);
  app.use(errorHandler);

  return app;
};

module.exports = createApp;
