'use strict';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const originalEnv = { ...process.env };
let app;
const secret = 'user-quota-test-only-secret';
const token = (id, options = {}) => jwt.sign({ id }, secret, { expiresIn: '5m', ...options });
beforeEach(() => {
  process.env.NODE_ENV = 'development';
  process.env.JWT_SECRET = secret;
  process.env.RATE_LIMIT_MAX = '2';
  process.env.RATE_LIMIT_WINDOW_MS = '60000';
  process.env.DISABLE_RATE_LIMIT = 'false';
  // Deliberately do not trust forwarded addresses: identity quotas must work
  // even when every request reaches the service from the same gateway address.
  delete process.env.TRUSTED_PROXIES;
  app = require('../../src/app')();
});
afterAll(() => { process.env = originalEnv; });
const hit = (bearer) => {
  const req = request(app).get('/unknown');
  return bearer ? req.auth(bearer, { type: 'bearer' }) : req;
};

test('separates signed users behind one gateway and preserves quota across token rotation', async () => {
  await hit(token('user-a')).expect(404);
  await hit(token('user-a', { jwtid: 'rotated-token' })).expect(404);
  const limited = await hit(token('user-a')).expect(429);
  expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
  await hit(token('user-b')).expect(404);
});

test('forged, expired and unsigned identities use the IP bucket without consuming a valid user quota', async () => {
  const forged = jwt.sign({ id: 'user-b' }, 'wrong-secret', { expiresIn: '5m' });
  await hit(forged).set('X-User-Id', 'user-a').expect(404);
  await hit(token('user-b', { expiresIn: -1 })).expect(404);
  await hit(jwt.sign({ id: 'invented' }, secret)).expect(429); // Missing expiration.
  await hit(token('user-a')).expect(404);
  await hit(token('user-b')).expect(404);
});

test('credential quotas cannot be bypassed by a signed token or by case/trailing slash variations', () => {
  const { identifyQuotaUser, quotaKey } = require('../../src/middlewares/requestQuota');
  const req = { path: '/API/v1/auth/login/', ip: '198.51.100.1',
    headers: { authorization: 'Bearer ' + token('user-a') } };
  identifyQuotaUser(req, {}, () => {});
  expect(req.rateLimitUserId).toBeUndefined();
  expect(quotaKey(req)).toBe('credential:/api/v1/auth/login:ip:198.51.100.1');
  req.path = '/api/v1/auth/refresh';
  expect(quotaKey(req)).toBe('credential:/api/v1/auth/refresh:ip:198.51.100.1');
});

test('API quotas do not grant route authentication', () => {
  // A correctly signed quota identity must not be copied into req.user.
  const { identifyQuotaUser } = require('../../src/middlewares/requestQuota');
  const req = { path: '/api/v1/users/me', headers: { authorization: 'Bearer ' + token('user-a') } };
  identifyQuotaUser(req, {}, () => {});
  expect(req.rateLimitUserId).toBe('user-a');
  expect(req.user).toBeUndefined();
});
