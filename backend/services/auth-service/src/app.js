const express = require('express');
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

// ─── Factory function — trả về Express app đã được cấu hình ──────────────────
// Dùng factory thay vì singleton để mỗi test có thể tạo app riêng biệt,
// tránh chia sẻ state giữa các test suite.

const createApp = () => {
  const app = express();
  
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
    apis: [require('path').join(__dirname, 'routes/*.js').replaceAll('\\', '/')],
  };

  const swaggerSpec = swaggerJsdoc(swaggerOptions);
  const exportedSpec = require('./config/openapi.json');
  swaggerSpec.paths = exportedSpec.paths;
  swaggerSpec.components = exportedSpec.components;

  // ─── Middlewares ─────────────────────────────────────────────────────────────

  app.use(helmet());
  // CORS được xử lý ở api-gateway. Auth-service chỉ nhận request nội bộ từ gateway,
  // nên chỉ allow localhost (gateway). Không dùng cors() wildcard vì sẽ conflict
  // với Access-Control-Allow-Origin header của gateway khi proxy trả về browser.
  app.use(cors({
    origin: process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
      : ['http://localhost:3000'],
    credentials: true,
  }));

  // Rate limiting chỉ áp dụng ở production/development để test không bị chặn.
  // QUAN TRỌNG: auth-service nhận request qua api-gateway nên req.ip luôn là 127.0.0.1.
  // Phải dùng X-Forwarded-For (IP thật của client) làm key, và skip /auth/verify
  // vì gateway gọi endpoint đó cho mọi request protected.
  if (process.env.NODE_ENV !== 'test') {
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000,  // 15 phút
      max: parseInt(process.env.RATE_LIMIT_MAX) || 300,  // 300 req/IP/15 phút
      standardHeaders: true,
      legacyHeaders: false,
      // Dùng real client IP từ X-Forwarded-For (gateway set header này)
      // Skip các internal endpoints mà gateway gọi liên tục
      skip: (req) => {
        const path = req.path;
        return (
          path === '/health' ||
          path === '/api/v1/auth/verify' ||
          path.startsWith('/api-docs')
        );
      },
      // Message lỗi tiếng Việt
      message: {
        success: false,
        message: 'Quá nhiều yêu cầu. Vui lòng thử lại sau 15 phút.',
        statusCode: 429,
      },
    });
    app.use(limiter);
  }

  app.use(morgan(process.env.NODE_ENV === 'test' ? 'silent' : 'combined'));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // ─── Routes ──────────────────────────────────────────────────────────────────

  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'auth-service' }));

  // Internal routes (service-to-service) - không qua gateway
  app.use('/internal/v1', internalRoutes);

  app.use('/api/v1', routes);

  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

  app.use(notFound);
  app.use(errorHandler);

  return app;
};

module.exports = createApp;
