'use strict';

const http = require('http');
const request = require('supertest');
const originalEnv = { ...process.env };
let upstream, app, verifies;
beforeAll(async () => {
  upstream = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/api/v1/auth/verify') {
      verifies++;
      const token = req.headers.authorization || '';
      const id = token.startsWith('Bearer user-a') ? 'user-a' : token === 'Bearer user-b' ? 'user-b' : null;
      if (!id) { res.statusCode = 401; }
      res.end(JSON.stringify(id ? { success: true, data: { id, role: 'USER' } } : { success: false }));
      return;
    }
    res.end(JSON.stringify({ success: true }));
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
});
beforeEach(() => {
  verifies = 0;
  process.env.NODE_ENV = 'development';
  process.env.DISABLE_RATE_LIMIT = 'false';
  process.env.RATE_LIMIT_MAX_REQUESTS = '2';
  process.env.RATE_LIMIT_WINDOW_MS = '60000';
  process.env.TRUSTED_PROXIES = 'loopback';
  process.env.AUTH_SERVICE_URL = process.env.TREKKING_SERVICE_URL = `http://127.0.0.1:${upstream.address().port}`;
  jest.resetModules();
  app = require('../../src/app');
});
afterAll(async () => {
  upstream.closeAllConnections();
  await new Promise(resolve => upstream.close(resolve));
  process.env = originalEnv;
});
function api(token, path = '/api/v1/journeys', ip = '198.51.100.1') {
  const req = request(app).get(path).set('X-Forwarded-For', ip);
  return token ? req.auth(token, { type: 'bearer' }) : req;
}

test('users behind one proxy have separate quotas; rotating a token or changing IP does not reset a user quota', async () => {
  // Even with unresolved forwarded IPs, verified users must remain independent.
  app.set('trust proxy', false);
  await api('user-a-v1').expect(200);
  await api('user-a-v2').expect(200);
  const limited = await api('user-a-v3', '/api/v1/journeys', '198.51.100.2').expect(429);
  expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
  expect(Number(limited.headers['retry-after'])).toBeLessThanOrEqual(60);
  await api('user-b').expect(200);
  expect(verifies).toBe(4); // One verification per request, shared with authorization.
});

test('signed-in readers of public APIs do not share quota with each other or anonymous readers', async () => {
  const path = '/api/v1/places';
  await api(null, path).expect(200);
  await api(null, path).expect(200);
  await api(null, path).expect(429);
  await api('user-a', path).expect(200);
  await api('user-a', path).expect(200);
  await api('user-a', path).expect(429);
  await api('user-b', path).expect(200);
});

test('forged identity headers and invalid tokens cannot choose a user bucket or bypass the IP quota', async () => {
  await api('invalid-1').set('X-User-Id', 'user-b').expect(401);
  await api('invalid-2').set('X-User-Id', 'user-a').expect(401);
  await api('invalid-3').set('X-User-Id', 'different-user').expect(429);
  await api('user-a').expect(200);
  await api('user-b').expect(200);
  await api(null, '/api/v1/places', '198.51.100.2').expect(200);
});

test('credential endpoints stay IP-limited with independent buckets even with valid or rotating tokens', async () => {
  for (const token of ['user-a', 'user-b']) {
    await request(app).post('/api/v1/auth/login').auth(token, { type: 'bearer' }).expect(200);
  }
  await request(app).post('/API/v1/auth/login/').auth('user-a-v2', { type: 'bearer' }).expect(429);
  await request(app).post('/api/v1/auth/refresh').expect(200);
  await api('user-a').expect(200);
  expect(verifies).toBe(1);
});

test('health, readiness and authorized metrics probes never consume an API quota', async () => {
  for (let i = 0; i < 4; i++) {
    await request(app).get('/health').expect(200);
    await request(app).get('/ready').expect(200);
  }
  await api('user-a').expect(200);
  expect(verifies).toBe(1);
});

test('the user bucket resets when the configured window expires', async () => {
  process.env.RATE_LIMIT_WINDOW_MS = '1000';
  jest.resetModules();
  app = require('../../src/app');
  await api('user-a').expect(200);
  await api('user-a').expect(200);
  await api('user-a').expect(429);
  await new Promise(resolve => setTimeout(resolve, 1100));
  await api('user-a').expect(200);
});

test('malformed successful verification cannot create a user identity', async () => {
  const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
    ok: true, json: async () => ({ success: true, data: { role: 'USER' } }),
  });
  try {
    await api('user-a').expect(503);
  } finally {
    fetchSpy.mockRestore();
  }
});
