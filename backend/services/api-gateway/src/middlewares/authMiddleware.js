'use strict';

const env = require('../config/env');

// ---------------------------------------------------------------------------
// Protected endpoints — require a valid Bearer token.
// Each entry is a "METHOD /full/path" string matched against the incoming
// request's method and path (which already includes the /api/v1 prefix
// because the middleware is applied before the proxy router).
//
// Requirements covered: 1.4, 1.5
// ---------------------------------------------------------------------------
const PROTECTED_PATHS = [
  'POST /api/v1/auth/logout',
  'GET /api/v1/auth/verify',
  'GET /api/v1/auth/me',
  'GET /api/v1/users/me',
  'PATCH /api/v1/users/me',
  'PATCH /api/v1/users/me/password',
  'PATCH /api/v1/users/me/bio',
  'POST /api/v1/users/me/avatar',
  'GET /api/v1/users/me/settings',
  'PATCH /api/v1/users/me/settings',
];

// Protected path PREFIXES — any request starting with these requires Bearer token.
const PROTECTED_PREFIXES = [
  '/api/v1/posts',
  '/api/v1/comments',
  '/api/v1/journeys',
  '/api/v1/contributions',
  '/api/v1/me',
  '/api/v1/admin',
  '/api/v1/badges/me',
  '/api/v1/gamification/me',         // gamification profile — auth required
  '/api/v1/gamification/users',      // public profile lookup — no auth needed (handled below)
  '/api/v1/uploads',                  // presigned upload — auth required
  '/api/v1/checkins',                 // all checkin endpoints require auth
  '/api/v1/visits',                   // visit endpoints require auth
  '/api/v1/agent',                    // Agent Service — Admin only (enforced by agent-service)
  '/api/v1/llm',                      // LLM providers — Admin only (proxied to agent-service)
];

/**
 * Determine whether the given request targets a protected endpoint.
 *
 * @param {string} method  - HTTP method in uppercase (e.g. 'GET')
 * @param {string} path    - Request path including /api/v1 prefix
 * @returns {boolean}
 */
function isProtectedPath(method, path) {
  if (path.startsWith('/api/v1/places/')) {
    if (!['GET', 'HEAD'].includes(method.toUpperCase())) { return true; }
    if (/\/reviews\/(me|eligibility)\/?$/.test(path)) { return true; }
  }
  const key = `${method.toUpperCase()} ${path}`;
  if (PROTECTED_PATHS.includes(key)) { return true; }

  // Explicit public paths within protected prefixes
  const PUBLIC_EXCEPTIONS = [
    // gamification public endpoints
    '/api/v1/gamification/ranks',
    // auth public
    '/api/v1/auth/register',
    '/api/v1/auth/login',
    '/api/v1/auth/google',
    '/api/v1/auth/refresh',
    '/api/v1/auth/forgot-password',
    '/api/v1/auth/verify-email',
    '/api/v1/auth/verify-reset-otp',
    '/api/v1/auth/reset-password',
    '/api/v1/auth/resend-verification-otp',
    // admin public — login & refresh không cần Bearer (đang login nên chưa có token)
    '/api/v1/admin/auth/login',
    '/api/v1/admin/auth/refresh',
  ];
  if (PUBLIC_EXCEPTIONS.some((p) => path === p || path.startsWith(p + '/'))) {
    return false;
  }

  return PROTECTED_PREFIXES.some((prefix) => path.startsWith(prefix));
}

/**
 * Auth middleware — validates the Bearer token on protected endpoints by
 * calling GET /auth/verify on the Auth Service with a 5-second timeout.
 *
 * Flow (Req 1.4, 1.5, 1.6):
 *   1. If the path is not protected → skip (call next())
 *   2. If no Authorization header → 401 "Thiếu token xác thực"
 *   3. Call GET /auth/verify with the token; timeout = 5 s
 *      a. 2xx response → call next()
 *      b. 4xx response → 401 "Token không hợp lệ hoặc đã hết hạn"
 *      c. Network / timeout error → propagate to the centralized error handler
 *
 * @type {import('express').RequestHandler}
 */
async function authMiddleware(req, res, next) {
  // Step 1: only enforce auth on protected paths
  if (!isProtectedPath(req.method, req.path)) {
    return next();
  }

  // Step 2: require Authorization header
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Thiếu token xác thực',
    });
  }

  // Step 3: verify the token with the Auth Service (5 s timeout)
  const verifyUrl = `${env.AUTH_SERVICE_URL}/api/v1/auth/verify`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const verifyRes = await fetch(verifyUrl, {
      method: 'GET',
      headers: {
        authorization: authHeader,
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // 2xx → token is valid, proceed to proxy
    if (verifyRes.ok) {
      if (/^\/api\/v1\/(admin|agent|llm)(\/|$)/.test(req.path)) {
        const verified = await verifyRes.json();
        if (verified.data?.role !== 'ADMIN') {
          return res.status(403).json({ success: false, message: 'Chỉ Admin mới có quyền truy cập' });
        }
      }
      return next();
    }

    // 4xx → token invalid or expired (Req 1.6)
    if (verifyRes.status >= 400 && verifyRes.status < 500) {
      return res.status(401).json({
        success: false,
        message: 'Token không hợp lệ hoặc đã hết hạn',
      });
    }

    // 5xx or unexpected status → treat as service unavailable, let
    // the error handler deal with it by propagating a structured error.
    return res.status(503).json({
      success: false,
      message: 'Dịch vụ tạm thời không khả dụng',
    });
  } catch (err) {
    clearTimeout(timeoutId);

    // AbortError means the 5-second verify timeout fired
    if (err.name === 'AbortError') {
      return res.status(503).json({
        success: false,
        message: 'Dịch vụ tạm thời không khả dụng',
      });
    }

    // Network / connection error — forward to Express error handler
    return next(err);
  }
}

module.exports = { authMiddleware, isProtectedPath, PROTECTED_PATHS };
