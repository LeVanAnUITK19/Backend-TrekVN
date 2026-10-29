'use strict';

const { createMetrics } = require('./metrics');

// Gateway proxies use Router.use(), so Express has no leaf route template.
// Only label by a bounded mount prefix; never include IDs or query strings.
const prefixes = [
  '/api/v1/admin/users', '/api/v1/admin/ranks', '/api/v1/admin/dashboard',
  '/api/v1/admin/statistics', '/api/v1/admin/audit-logs', '/api/v1/admin/trekking',
  '/api/v1/admin/contributions', '/api/v1/admin/badges',
  '/api/v1/admin/offline-maps', '/api/v1/admin/journeys',
  '/api/v1/auth', '/api/v1/users', '/api/v1/gamification', '/api/v1/checkins',
  '/api/v1/visits', '/api/v1/places', '/api/v1/routes', '/api/v1/journeys',
  '/api/v1/contributions', '/api/v1/badges', '/api/v1/me', '/api/v1/uploads',
  '/api/v1/agent', '/api/v1/llm',
  '/api/v1/posts', '/api/v1/comments',
  '/api/v1/community',
  '/api/v1/admin/community',
];

const monitoring = createMetrics('api-gateway', (req) => {
  const path = req.originalUrl.split('?')[0];
  const prefix = prefixes.find((value) => path === value || path.startsWith(value + '/'));
  return prefix ? prefix + '/*' : (req.route?.path || '__unmatched__');
});

module.exports = {
  prometheusMiddleware: monitoring.middleware,
  metricsHandler: monitoring.handler,
  register: monitoring.register,
};
