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

module.exports = { isCredentialRequest, quotaKey };
