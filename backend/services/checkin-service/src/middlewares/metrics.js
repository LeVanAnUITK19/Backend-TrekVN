'use strict';

const crypto = require('crypto');
const promClient = require('prom-client');

// Kept inside each service because Render/Docker build each service independently.
function createMetrics(service, resolveRoute) {
  const register = new promClient.Registry();
  register.setDefaultLabels({ service });
  promClient.collectDefaultMetrics({ register });

  const labelNames = ['method', 'route', 'status_code'];
  const total = new promClient.Counter({
    name: 'trekvn_http_requests_total',
    help: 'Completed HTTP requests (excluding metrics scrapes)',
    labelNames,
    registers: [register],
  });
  const duration = new promClient.Histogram({
    name: 'trekvn_http_request_duration_seconds',
    help: 'HTTP response duration including streamed and proxied responses',
    labelNames,
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 180],
    registers: [register],
  });
  const active = new promClient.Gauge({
    name: 'trekvn_http_requests_active',
    help: 'In-flight HTTP requests (excluding metrics scrapes)',
    registers: [register],
  });

  function middleware(req, res, next) {
    if (/^\/metrics\/?$/.test(req.path)) {
      return next();
    }
    const start = process.hrtime.bigint();
    // Use the registered route template, never a user-provided URL/ID/query.
    const method = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].includes(req.method)
      ? req.method : 'OTHER';
    active.inc();
    let recorded = false;
    function complete() {
      if (recorded) {
        return;
      }
      recorded = true;
      const route = resolveRoute
        ? resolveRoute(req)
        : (typeof req.route?.path === 'string'
          ? (req.baseUrl || '') + req.route.path : '__unmatched__');
      const labels = {
        method,
        route,
        status_code: String(res.writableFinished ? res.statusCode : 499),
      };
      total.inc(labels);
      duration.observe(labels, Number(process.hrtime.bigint() - start) / 1e9);
      active.dec();
    }
    // finish works for res.json, res.end, streams, sendFile and http-proxy.
    // close also releases the gauge when the client aborts.
    res.once('finish', complete);
    res.once('close', complete);
    next();
  }

  async function handler(req, res) {
    const token = process.env.METRICS_TOKEN;
    if (token) {
      const expected = Buffer.from('Bearer ' + token);
      const actual = Buffer.from(req.get('authorization') || '');
      if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
        res.set('WWW-Authenticate', 'Bearer');
        return res.status(401).send('Unauthorized');
      }
    }
    try {
      res.set('Content-Type', register.contentType);
      res.set('Cache-Control', 'no-store');
      return res.send(await register.metrics());
    } catch (_err) {
      return res.status(500).send('Unable to collect metrics');
    }
  }

  return { middleware, handler, register };
}

module.exports = { createMetrics };
