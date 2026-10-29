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
// Dùng factory thay vì singleton để mỗi test có thể tạo app riêng biệt,
// tránh chia sẻ state giữa các test suite.

const createApp = () => {
  const app = express();
  const monitoring = createMetrics('auth-service');
  app.use(monitoring.middleware);
  // Register before API auth, rate limiting and body parsing.
  app.get('/metrics', monitoring.handler);
  
  // Accept forwarded IPs only from configured proxies, or local loopback.
  if (process.env.TRUSTED_PROXIES) {
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

  // Signed users have independent quotas even behind the same gateway/NAT.
  // Credential operations remain IP-limited; verification probes are exempt.
  if (process.env.NODE_ENV !== 'test' && process.env.DISABLE_RATE_LIMIT !== 'true') {
    app.use(identifyQuotaUser);
    const limiter = rateLimit({
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
      max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 300,
      keyGenerator: quotaKey,
      standardHeaders: true,
      legacyHeaders: false,
      // Gateway calls this verification endpoint for every signed-in request.
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
        message: 'Quá nhiều yêu cầu. Vui lòng thử lại sau.',
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
