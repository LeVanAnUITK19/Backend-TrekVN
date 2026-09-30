const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');

const routes = require('./routes');
const { errorHandler } = require('./middlewares/errorHandler');
const { notFound } = require('./middlewares/notFound');

// ─── Factory function — trả về Express app đã được cấu hình ──────────────────
const createApp = () => {
  const app = express();

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
    apis: ['./src/routes/*.js'],
  };

  const swaggerSpec = swaggerJsdoc(swaggerOptions);

  // ─── Middlewares ─────────────────────────────────────────────────────────────
  app.use(helmet());
  app.use(cors());

  // Rate limiting chỉ áp dụng ở production để test không bị chặn
  if (process.env.NODE_ENV !== 'test') {
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 100,
      standardHeaders: true,
      legacyHeaders: false,
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

  app.use('/api/v1', routes);

  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

  app.use(notFound);
  app.use(errorHandler);

  return app;
};

module.exports = createApp;
