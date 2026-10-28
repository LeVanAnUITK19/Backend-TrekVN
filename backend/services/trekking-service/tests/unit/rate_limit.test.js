'use strict';

const request = require('supertest');
const originalEnv = { ...process.env };
afterAll(() => { process.env = originalEnv; });

test('trekking-service excludes health probes and separates client quotas', async () => {
  process.env.NODE_ENV = 'development';
  process.env.DISABLE_RATE_LIMIT = 'false';
  process.env.RATE_LIMIT_MAX = '2';
  process.env.TRUSTED_PROXIES = 'loopback';
  const app = require('../../src/app')();
  for (let i = 0; i < 4; i++) {
    await request(app).get('/health').set('X-Forwarded-For', '198.51.100.1').expect(200);
  }
  for (let i = 0; i < 2; i++) {
    await request(app).get('/unknown').set('X-Forwarded-For', '198.51.100.1').expect(404);
  }
  const limited = await request(app).get('/unknown').set('X-Forwarded-For', '198.51.100.1').expect(429);
  expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
  await request(app).get('/unknown').set('X-Forwarded-For', '198.51.100.2').expect(404);
});
