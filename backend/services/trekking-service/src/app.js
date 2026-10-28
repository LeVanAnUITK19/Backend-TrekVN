'use strict';

const express = require('express');
const { createMetrics } = require('./middlewares/metrics');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');

const routes = require('./routes');
const internalRoutes = require('./routes/internal.routes');
const { errorHandler } = require('./middlewares/errorHandler');
const { notFound } = require('./middlewares/notFound');

const createApp = () => {
  const app = express();
  const monitoring = createMetrics('trekking-service');
  app.use(monitoring.middleware);
  // Register before API auth, rate limiting and body parsing.
  app.get('/metrics', monitoring.handler);
  
  // Trust proxy: trong development (localhost), trust tất cả; production dùng TRUSTED_PROXIES
  if (process.env.NODE_ENV === 'production' && process.env.TRUSTED_PROXIES) {
    app.set('trust proxy', process.env.TRUSTED_PROXIES.split(',').map((ip) => ip.trim()).filter(Boolean));
  } else if (process.env.NODE_ENV !== 'test') {
    // Development: trust localhost/loopback
    app.set('trust proxy', 'loopback');
  }

  // ─── Swagger ────────────────────────────────────────────────────────────────
  const swaggerOptions = {
    definition: {
      openapi: '3.0.0',
      info: {
        title: 'Trekking Service API',
        version: '1.0.0',
        description: 'API tài liệu cho Trekking Service của TrekVN — quản lý địa điểm, cung đường, hành trình, đóng góp và huy hiệu',
      },
      servers: [{ url: 'http://localhost:3003', description: 'Development server' }],
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
      tags: [
        { name: 'Places', description: 'Địa điểm trekking' },
        { name: 'Routes', description: 'Tuyến đường trekking' },
        { name: 'Offline', description: 'Gói dữ liệu offline' },
        { name: 'Journeys', description: 'Hành trình trekking' },
        { name: 'Journey Markers', description: 'Cột mốc do người dùng đánh dấu' },
        { name: 'Reviews', description: 'Đánh giá địa điểm' },
        { name: 'Contributions', description: 'Đóng góp dữ liệu' },
        { name: 'Badges', description: 'Huy hiệu thành tích' },
        { name: 'Admin Trekking', description: 'Quản trị dữ liệu trekking' },
        { name: 'Admin Contributions', description: 'Quản trị đóng góp' },
      ],
    },
    apis: [require('path').join(__dirname, 'routes/*.js').replaceAll('\\', '/')],
  };

  const swaggerSpec = swaggerJsdoc(swaggerOptions);
  const exportedSpec = require('./config/openapi.json');
  swaggerSpec.paths = exportedSpec.paths;
  swaggerSpec.components = exportedSpec.components;

  // ─── Security middlewares ─────────────────────────────────────────────────
  app.use(helmet());
  // CORS được xử lý ở api-gateway. Service này chỉ nhận request từ gateway.
  app.use(cors({
    origin: process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
      : ['http://localhost:3000'],
    credentials: true,
  }));

  // Rate limiting chỉ áp dụng ở production
  if (process.env.NODE_ENV !== 'test' && process.env.DISABLE_RATE_LIMIT !== 'true') {
    const limiter = rateLimit({
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
      max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 600,
      standardHeaders: true,
      legacyHeaders: false,
      skip: (req) => req.path === '/health' || req.path === '/ready',
    });
    app.use(limiter);
  }

  app.use(morgan(process.env.NODE_ENV === 'test' ? 'silent' : 'combined'));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // ─── Health / Ready ───────────────────────────────────────────────────────
  app.get('/health', (_req, res) =>
    res.json({ status: 'ok', service: 'trekking-service' })
  );
  app.get('/ready', (_req, res) => {
    const mongoose = require('mongoose');
    const isReady = mongoose.connection.readyState === 1;
    res.status(isReady ? 200 : 503).json({
      status: isReady ? 'ready' : 'not_ready',
      db: isReady ? 'connected' : 'disconnected',
    });
  });

  // ─── Internal routes (service-to-service, không qua API Gateway) ─────────
  app.use('/internal/v1', internalRoutes);

  // ─── Public / User / Admin API routes ────────────────────────────────────
  app.use('/api/v1', routes);

  // ─── Swagger UI ───────────────────────────────────────────────────────────
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

  // ─── Error handling ───────────────────────────────────────────────────────
  app.use(notFound);
  app.use(errorHandler);

  return app;
};

module.exports = createApp;
