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
// Dùng factory thay vì singleton để mỗi test có thể tạo app riêng biệt,
// tránh chia sẻ state giữa các test suite.

const createApp = () => {
  const app = express();

  // ─── Swagger ────────────────────────────────────────────────────────────────

  const swaggerOptions = {
    definition: {
      openapi: '3.0.0',
      info: {
        title: 'Auth Service API',
        version: '1.0.0',
        description:
          'API tài liệu cho Auth Service của TrekVN — xử lý đăng ký, đăng nhập, JWT và quản lý người dùng',
      },
      servers: [{ url: 'http://localhost:3001', description: 'Development server' }],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'Nhập accessToken nhận được sau khi đăng nhập',
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

  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'auth-service' }));

  app.use('/api/v1', routes);

  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

  app.use(notFound);
  app.use(errorHandler);

  return app;
};

module.exports = createApp;
