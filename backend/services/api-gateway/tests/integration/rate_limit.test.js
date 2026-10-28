'use strict';

const request = require('supertest');

describe('gateway rate limiting behind a trusted proxy', () => {
  let app;
  const originalEnv = { ...process.env };
  beforeAll(() => {
    process.env.NODE_ENV = 'development';
    process.env.DISABLE_RATE_LIMIT = 'false';
    process.env.RATE_LIMIT_MAX_REQUESTS = '2';
    process.env.RATE_LIMIT_WINDOW_MS = '60000';
    process.env.TRUSTED_PROXIES = 'loopback';
    jest.resetModules();
    app = require('../../src/app');
  });
  afterAll(() => { process.env = originalEnv; });

  test('health probes do not consume quota; different clients have separate quotas', async () => {
    for (let i = 0; i < 4; i++) {
      await request(app).get('/health').set('X-Forwarded-For', '198.51.100.1').expect(200);
    }
    // Missing bearer token rejects before calling any upstream service.
    for (let i = 0; i < 2; i++) {
      await request(app).get('/api/v1/auth/verify').set('X-Forwarded-For', '198.51.100.1').expect(401);
    }
    const limited = await request(app).get('/api/v1/auth/verify').set('X-Forwarded-For', '198.51.100.1').expect(429);
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    expect(Number(limited.headers['retry-after'])).toBeLessThanOrEqual(60);
    await request(app).get('/api/v1/auth/verify').set('X-Forwarded-For', '198.51.100.2').expect(401);
  });
});
