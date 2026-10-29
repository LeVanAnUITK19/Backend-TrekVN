'use strict';

// Credential operations stay IP-limited even if a client supplies a valid JWT.
const CREDENTIAL_OPERATIONS = new Set([
  'login', 'register', 'google', 'refresh', 'forgot-password', 'verify-email',
  'verify-reset-otp', 'reset-password', 'resend-verification-otp',
]);

function isCredentialRequest(req) {
  const path = req.path.toLowerCase().replace(/\/+$/, '');
  const match = path.match(/^\/api\/v1\/(?:admin\/)?auth\/([^/]+)$/);
  return Boolean(match && CREDENTIAL_OPERATIONS.has(match[1]));
}

function quotaKey(req) {
  if (isCredentialRequest(req)) {
    return `credential:${req.path.toLowerCase().replace(/\/+$/, '')}:ip:${req.ip}`;
  }
  if (req.rateLimitUserId) {
    return `user:${req.rateLimitUserId}`;
  }
  const scope = req.path.startsWith('/internal/') ? 'internal' : 'public';
  return `${scope}:ip:${req.ip}`;
}

const jwt = require('jsonwebtoken');

// This identity is ONLY for quota partitioning. Route authentication still
// checks account state, permissions and service credentials independently.
function identifyQuotaUser(req, _res, next) {
  if (!isCredentialRequest(req) && req.headers.authorization?.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(req.headers.authorization.slice(7), process.env.JWT_SECRET, {
        algorithms: ['HS256'],
      });
      const id = payload.id || payload.sub || payload.userId;
      if (typeof id === 'string' && id && Number.isFinite(payload.exp)) {
        req.rateLimitUserId = id;
      }
    } catch {
      // Forged/expired tokens use the anonymous IP bucket, never a claimed user ID.
    }
  }
  next();
}

module.exports = { identifyQuotaUser, quotaKey };
