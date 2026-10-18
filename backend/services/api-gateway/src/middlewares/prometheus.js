'use strict';

const promClient = require('prom-client');

// ─── Prometheus Registry ──────────────────────────────────────────────────────
const register = new promClient.Registry();

// Default metrics (CPU, memory, event loop lag, etc.)
promClient.collectDefaultMetrics({
  register,
  prefix: 'trekvn_gateway_',
  gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5],
});

// ─── Custom Metrics ───────────────────────────────────────────────────────────

// HTTP request duration histogram
const httpRequestDuration = new promClient.Histogram({
  name: 'trekvn_gateway_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.001, 0.005, 0.015, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 1, 2, 5],
  registers: [register],
});

// HTTP request counter
const httpRequestTotal = new promClient.Counter({
  name: 'trekvn_gateway_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

// HTTP request size
const httpRequestSize = new promClient.Summary({
  name: 'trekvn_gateway_http_request_size_bytes',
  help: 'Size of HTTP requests in bytes',
  labelNames: ['method', 'route'],
  registers: [register],
});

// HTTP response size
const httpResponseSize = new promClient.Summary({
  name: 'trekvn_gateway_http_response_size_bytes',
  help: 'Size of HTTP responses in bytes',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

// Active requests gauge
const httpRequestsActive = new promClient.Gauge({
  name: 'trekvn_gateway_http_requests_active',
  help: 'Number of active HTTP requests',
  registers: [register],
});

// Rate limit counter
const rateLimitHits = new promClient.Counter({
  name: 'trekvn_gateway_rate_limit_hits_total',
  help: 'Total number of rate limit hits (429 responses)',
  labelNames: ['path'],
  registers: [register],
});

// Proxy errors counter
const proxyErrors = new promClient.Counter({
  name: 'trekvn_gateway_proxy_errors_total',
  help: 'Total number of proxy errors',
  labelNames: ['service', 'error_type'],
  registers: [register],
});

// Upstream response time
const upstreamResponseTime = new promClient.Histogram({
  name: 'trekvn_gateway_upstream_response_time_seconds',
  help: 'Response time from upstream services',
  labelNames: ['service'],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5, 10],
  registers: [register],
});

// ─── Middleware ───────────────────────────────────────────────────────────────

/**
 * Express middleware to track HTTP metrics.
 */
function prometheusMiddleware(req, res, next) {
  // Skip metrics endpoint itself
  if (req.path === '/metrics') {
    return next();
  }

  const start = Date.now();
  httpRequestsActive.inc();

  // Track request size
  const requestSize = parseInt(req.get('content-length'), 10) || 0;
  if (requestSize > 0) {
    httpRequestSize.observe({ method: req.method, route: req.route?.path || req.path }, requestSize);
  }

  // Track response
  const originalSend = res.send;
  res.send = function (data) {
    res.send = originalSend;
    const responseSize = Buffer.byteLength(data || '', 'utf8');
    
    const duration = (Date.now() - start) / 1000;
    const route = req.route?.path || req.path;
    const labels = {
      method: req.method,
      route,
      status_code: res.statusCode,
    };

    httpRequestDuration.observe(labels, duration);
    httpRequestTotal.inc(labels);
    httpResponseSize.observe(labels, responseSize);
    httpRequestsActive.dec();

    // Track rate limit hits
    if (res.statusCode === 429) {
      rateLimitHits.inc({ path: route });
    }

    return res.send(data);
  };

  next();
}

/**
 * Metrics endpoint handler
 */
async function metricsHandler(_req, res) {
  try {
    res.set('Content-Type', register.contentType);
    const metrics = await register.metrics();
    res.send(metrics);
  } catch (err) {
    res.status(500).send(err.message);
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  prometheusMiddleware,
  metricsHandler,
  metrics: {
    httpRequestDuration,
    httpRequestTotal,
    httpRequestSize,
    httpResponseSize,
    httpRequestsActive,
    rateLimitHits,
    proxyErrors,
    upstreamResponseTime,
  },
  register,
};
