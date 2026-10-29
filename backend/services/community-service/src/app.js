'use strict';
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { identifyQuotaUser, quotaKey } = require('./middlewares/requestQuota');
const mongoose = require('mongoose');
const { createRoutes } = require('./routes');
const { createAdminRoutes } = require('./routes/admin.routes');
const { createAdminService } = require('./services/admin.service');
const { createCommunityService } = require('./services/community.service');
const { createEventBus } = require('./realtime/eventBus');
const { createMetrics } = require('./middlewares/metrics');
const { errorHandler } = require('./middlewares/errorHandler');

function createApp({ events = createEventBus() } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', process.env.TRUSTED_PROXIES
    ? process.env.TRUSTED_PROXIES.split(',').map((s) => s.trim()).filter(Boolean) : false);
  const metrics = createMetrics('community-service');
  app.use(metrics.middleware);
  app.get('/metrics', metrics.handler);
  app.use(helmet());
  app.use(cors({ origin: (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',').map((s) => s.trim()) }));
  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'community-service' }));
  app.get('/ready', (_req, res) => {
    const ready = mongoose.connection.readyState === 1;
    res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not_ready' });
  });
  app.use(identifyQuotaUser);
  app.use(rateLimit({ windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    max: Number(process.env.RATE_LIMIT_MAX) || 600, keyGenerator: quotaKey,
    standardHeaders: true, legacyHeaders: false,
    skip: () => process.env.NODE_ENV === 'test' || process.env.DISABLE_RATE_LIMIT === 'true',
    message: { success: false, error: { code: 'RATE_LIMITED', message: 'Vui lòng thử lại sau' } },
  }));
  app.use(express.json({ limit: '128kb' }));
  const swaggerUi = require('swagger-ui-express');
  const spec = require('./config/openapi.definition');
  app.get('/api-docs.json', (_req, res) => res.json(spec));
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(spec));
  // Feed and viewer-specific reactions can contain private account data.
  app.use('/api/v1', (_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
  app.use('/api/v1/admin/community', createAdminRoutes(createAdminService(events)));
  const social = require('./services/social.service').createSocialService(events);
  const { createSocialRoutes } = require('./routes/social.routes');
  const { createSocialAdminRoutes } = require('./routes/social.admin.routes');
  app.use('/api/v1/admin/community', createSocialAdminRoutes(social));
  app.use('/api/v1/community', createSocialRoutes(social));
  app.use('/api/v1', createRoutes(createCommunityService(events)));
  app.use((_req, res) => res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Endpoint not found' } }));
  app.use(errorHandler);
  return app;
}
module.exports = createApp;
