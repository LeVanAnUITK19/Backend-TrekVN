'use strict';

const { Router } = require('express');
const httpProxy = require('http-proxy');
const env = require('../config/env');

// ---------------------------------------------------------------------------
// Helper — tạo proxy middleware hướng tới một upstream service.
//
// Path preservation:
//   Gateway nhận:   /api/v1/auth/login
//   Chuyển tiếp:    /api/v1/auth/login  (giữ nguyên path)
//
// Requirements covered: 1.2, 1.3, 1.7, 1.8
// ---------------------------------------------------------------------------
function createServiceProxy(targetUrl, serviceName, timeoutOverrides = {}) {
  const proxyTimeout = timeoutOverrides.proxyTimeout ?? 30_000;
  const timeout = timeoutOverrides.timeout ?? 30_000;
  const proxy = httpProxy.createProxyServer({
    target: targetUrl,
    changeOrigin: true,
    proxyTimeout,
    timeout,

  });
  // Gắn X-Forwarded-For với IP thực của client (Req 1.8).
  proxy.on('proxyReq', (proxyReq, req) => {
        // Service credentials and identity headers must never cross the public gateway.
        for (const header of ['x-service-token', 'x-user-id', 'x-user-role', 'x-admin-id']) {
          proxyReq.removeHeader(header);
        }
        const clientIp = req.ip || (req.socket && req.socket.remoteAddress) || '';
        proxyReq.setHeader('X-Forwarded-For', clientIp);
  });

      // Upstream không phản hồi → 503 / 502 (Req 1.7)
  proxy.on('error', (err, req, res) => {
        console.error(`[proxy:${serviceName}] error:`, err.message);

        if (res.headersSent) { res.destroy(err); return; }

        const isUnavailable =
          err.code === 'ECONNREFUSED' ||
          err.code === 'ECONNRESET' ||
          err.code === 'ETIMEDOUT' ||
          err.message.includes('timeout');

        if (isUnavailable) {
          res.status(503).json({
            success: false,
            message: 'Dịch vụ tạm thời không khả dụng',
          });
        } else {
          res.status(502).json({
            success: false,
            message: 'Lỗi kết nối đến dịch vụ',
          });
        }
  });
  return (req, res) => {
    // Express strips mount prefixes from req.url; upstream expects the full path.
    req.url = req.originalUrl;
    proxy.web(req, res);
  };
}

// ---------------------------------------------------------------------------
// Auth Service — proxy toàn bộ /api/v1/auth/* đến AUTH_SERVICE_URL
// ---------------------------------------------------------------------------
const authRouter = Router();
authRouter.use('/', createServiceProxy(env.AUTH_SERVICE_URL, 'auth-service'));

// ---------------------------------------------------------------------------
// CheckIn Service — proxy các prefix sau đến CHECKIN_SERVICE_URL:
//   /api/v1/checkins/*
//   /api/v1/visits/*
// ---------------------------------------------------------------------------
const checkinRouter = Router();
checkinRouter.use('/', createServiceProxy(env.CHECKIN_SERVICE_URL, 'checkin-service'));

// ---------------------------------------------------------------------------
// Trekking Service — proxy các prefix sau đến TREKKING_SERVICE_URL:
//   /api/v1/places/*
//   /api/v1/routes/*
//   /api/v1/journeys/*
//   /api/v1/contributions/*
//   /api/v1/badges/*
//   /api/v1/me/contributions, /api/v1/me/badges
//   /api/v1/admin/trekking/*, /api/v1/admin/contributions/*, /api/v1/admin/badges/*
// ---------------------------------------------------------------------------
const trekkingRouter = Router();
const trekkingProxy = createServiceProxy(env.TREKKING_SERVICE_URL, 'trekking-service');
const mapFileProxy = createServiceProxy(env.TREKKING_SERVICE_URL, 'trekking-map-file', {
  proxyTimeout: 120_000,
  timeout: 120_000,
});
trekkingRouter.use('/', (req, res, next) => {
  const isMapFile = (req.method === 'GET' || req.method === 'HEAD') &&
    /^\/api\/v1\/admin\/trekking\/places\/[^/]+\/offline-map\/file(?:\?|$)/.test(req.originalUrl);
  return (isMapFile ? mapFileProxy : trekkingProxy)(req, res, next);
});

// ---------------------------------------------------------------------------
// Agent Service — proxy các prefix sau đến AGENT_SERVICE_URL (Python FastAPI):
//   /api/v1/agent/assistant/*    → AI Assistant (conversations, messages)
//   /api/v1/agent/place-builder/* → Place Builder workflow
//   /api/v1/agent/map-builder/*  → Map Builder workflow
//   /api/v1/agent/tasks/*        → Agent Tasks list/detail
//   /api/v1/llm/*                → LLM providers (proxied via /api/v1/agent/llm/* on FastAPI)
//
// Auth enforcement: /api/v1/agent/* and /api/v1/llm/* are in PROTECTED_PREFIXES.
// Agent Service itself re-validates the token and enforces ADMIN role.
// NOTE: LLM calls can take 60–120s — use extended timeout for agent routes.
// ---------------------------------------------------------------------------
const agentRouter = Router();
agentRouter.use('/', createServiceProxy(env.AGENT_SERVICE_URL, 'agent-service', {
  proxyTimeout: 180_000,  // 3 phút — LLM có thể chậm
  timeout: 180_000,
}));

const communityRouter = Router();
communityRouter.use('/', createServiceProxy(env.COMMUNITY_SERVICE_URL, 'community-service'));

module.exports = { authRouter, checkinRouter, trekkingRouter, agentRouter, communityRouter };
