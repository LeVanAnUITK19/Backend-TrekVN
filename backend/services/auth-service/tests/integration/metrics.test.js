'use strict';

const request = require('supertest');

const originalEnv = { ...process.env };
afterAll(() => { process.env = originalEnv; });

test('auth-service exposes metrics outside API quotas with an independent registry per app', async () => {
  process.env.NODE_ENV = 'development';
  process.env.METRICS_TOKEN = 'scrape-test-token';
  process.env.RATE_LIMIT_MAX = '1';
  process.env.DISABLE_RATE_LIMIT = 'false';
  const createApp = require('../../src/app');
  for (let instance = 0; instance < 2; instance++) {
    const app = createApp();
    await request(app).get('/metrics').expect(401);
    await request(app).get('/metrics').set('Authorization', 'Bearer user-jwt').expect(401);
    await request(app).get('/health').expect(200);
    await request(app).get('/not-a-route-one').expect(404);
    await request(app).get('/not-a-route-two').expect(429);
    for (let scrape = 0; scrape < 3; scrape++) {
      const response = await request(app).get('/metrics')
        .set('Authorization', 'Bearer scrape-test-token')
        .expect(200).expect('Content-Type', /text\/plain/);
      expect(response.text).toContain('service="auth-service"');
      expect(response.text).toContain('process_cpu_seconds_total');
      expect(response.text).toMatch(/trekvn_http_requests_total\{[^\n]*route="\/health"[^\n]*\} 1/);
      expect(response.text).toMatch(/trekvn_http_requests_active\{[^\n]+\} 0/);
      expect(response.text).not.toContain('route="/metrics"');
      expect(response.text).not.toContain('not-a-route-one');
    }
  }
});
