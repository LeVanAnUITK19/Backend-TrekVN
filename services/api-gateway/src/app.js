'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const corsMiddleware = require('./middlewares/cors');
const { authMiddleware } = require('./middlewares/authMiddleware');
const { authRouter, checkinRouter, trekkingRouter, agentRouter } = require('./routes/proxy');
const { errorHandler } = require('./middlewares/errorHandler');
const env = require('./config/env');

const app = express();
app.disable('x-powered-by');

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------
app.use(corsMiddleware);

// ---------------------------------------------------------------------------
// Rate limiting — configurable via env vars.
// Returns HTTP 429 + Retry-After header for client sync policy (NFR-SYNC-01, BR-22).
// Health endpoints are excluded.
// ---------------------------------------------------------------------------
if (process.env.NODE_ENV !== 'test') {
  const limiter = rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_MAX_REQUESTS,
    standardHeaders: true,    // RateLimit-* headers
    legacyHeaders: false,
    // Send Retry-After header so offline client can defer bulk sync (SRS FR-SYNC-09)
    message: (req, res) => {
      const retryAfterSeconds = Math.ceil(env.RATE_LIMIT_WINDOW_MS / 1000);
      res.setHeader('Retry-After', retryAfterSeconds);
      return {
        success: false,
        message: 'Too many requests. Vui lòng thử lại sau.',
        retryAfter: retryAfterSeconds,
      };
    },
    skip: (req) =>
      req.path === '/health' || req.path === '/ready',
  });
  app.use(limiter);
}

// ---------------------------------------------------------------------------
// Health check endpoint (not proxied, not rate-limited)
// ---------------------------------------------------------------------------
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'api-gateway' });
});

app.get('/ready', (_req, res) => {
  res.json({ status: 'ready', service: 'api-gateway' });
});

// ---------------------------------------------------------------------------
// Auth middleware — verifies Bearer token on protected endpoints.
// ---------------------------------------------------------------------------
app.use(authMiddleware);

// ---------------------------------------------------------------------------
// Proxy routes
//
//   /api/v1/auth/*                    → Auth Service      (AUTH_SERVICE_URL)
//   /api/v1/users/*                   → Auth Service
//   /api/v1/gamification/*            → Auth Service
//   /api/v1/admin/users/*             → Auth Service      (user management)
//   /api/v1/admin/ranks/*             → Auth Service      (rank definitions)
//   /api/v1/admin/dashboard           → Auth Service      (stats)
//   /api/v1/admin/audit-logs          → Auth Service
//   /api/v1/checkins/*                → CheckIn Service   (CHECKIN_SERVICE_URL)
//   /api/v1/visits/*                  → CheckIn Service
//   /api/v1/places/*                  → Trekking Service  (TREKKING_SERVICE_URL)
//   /api/v1/routes/*                  → Trekking Service
//   /api/v1/journeys/*                → Trekking Service
//   /api/v1/contributions/*           → Trekking Service
//   /api/v1/badges/*                  → Trekking Service
//   /api/v1/me/*                      → Trekking Service
//   /api/v1/uploads/*                 → Trekking Service
//   /api/v1/admin/trekking/*          → Trekking Service  (places/routes/milestones)
//   /api/v1/admin/contributions/*     → Trekking Service
//   /api/v1/admin/badges/*            → Trekking Service
//   /api/v1/admin/offline-maps/*      → Trekking Service
//   /api/v1/admin/journeys/*          → Trekking Service
//   /api/v1/agent/*                   → Agent Service (Python FastAPI, port 8000)
//   /api/v1/llm/*                     → Agent Service
//
// NOTE: Internal routes (/internal/v1/*) are NOT exposed via Gateway.
// IMPORTANT: More-specific /admin/* prefixes MUST be registered BEFORE the
//            catch-all /admin → trekking fallback (if any).
// ---------------------------------------------------------------------------

// Auth-service — base routes
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/users', authRouter);
app.use('/api/v1/gamification', authRouter);

// Auth-service — admin routes (user mgmt, ranks, dashboard, audit logs)
// These MUST come before the trekking /admin catch-all below.
app.use('/api/v1/admin/users', authRouter);
app.use('/api/v1/admin/ranks', authRouter);
app.use('/api/v1/admin/dashboard', authRouter);
app.use('/api/v1/admin/statistics', authRouter);
app.use('/api/v1/admin/audit-logs', authRouter);

// CheckIn-service
app.use('/api/v1/checkins', checkinRouter);
app.use('/api/v1/visits', checkinRouter);

// Trekking-service — public routes
app.use('/api/v1/places', trekkingRouter);
app.use('/api/v1/routes', trekkingRouter);
app.use('/api/v1/journeys', trekkingRouter);
app.use('/api/v1/contributions', trekkingRouter);
app.use('/api/v1/badges', trekkingRouter);
app.use('/api/v1/me', trekkingRouter);
app.use('/api/v1/uploads', trekkingRouter);

// Trekking-service — admin routes (must be specific prefixes to avoid
// intercepting auth-service admin routes registered above)
app.use('/api/v1/admin/trekking', trekkingRouter);
app.use('/api/v1/admin/contributions', trekkingRouter);
app.use('/api/v1/admin/badges', trekkingRouter);
app.use('/api/v1/admin/offline-maps', trekkingRouter);
app.use('/api/v1/admin/journeys', trekkingRouter);

// Agent-service (Python FastAPI) — Admin only, enforced by agent-service itself
// All /api/v1/agent/* and /api/v1/llm/* are in PROTECTED_PREFIXES → Bearer token validated first
app.use('/api/v1/agent', agentRouter);
app.use('/api/v1/llm', agentRouter);

// ---------------------------------------------------------------------------
// Centralized error handler
// ---------------------------------------------------------------------------
app.use(errorHandler);

module.exports = app;
