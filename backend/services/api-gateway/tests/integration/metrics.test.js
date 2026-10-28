'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const request = require('supertest');
const { createMetrics } = require('../../src/middlewares/metrics');

const originalEnv = { ...process.env };
beforeAll(() => {
  process.env.NODE_ENV = 'development';
  process.env.JWT_SECRET = 'metrics-test-secret';
  process.env.JWT_RESET_SECRET = 'metrics-test-reset-secret';
  process.env.RABBITMQ_ENABLED = 'false';
  process.env.METRICS_TOKEN = 'scrape-test-token';
  process.env.RATE_LIMIT_MAX = '1';
  process.env.RATE_LIMIT_MAX_REQUESTS = '1';
  process.env.DISABLE_RATE_LIMIT = 'false';
});
afterAll(() => { process.env = originalEnv; });

const services = ['api-gateway', 'auth-service', 'checkin-service', 'trekking-service'];
test.each(['api-gateway'])('%s exposes protected metrics outside API quotas', async (service) => {
  const modulePath = path.resolve(__dirname, '../../..', service, 'src/app.js');
  const exported = require(modulePath);
  const app = service === 'api-gateway' ? exported : exported();
  const scrape = () => request(app).get('/metrics').set('Authorization', 'Bearer scrape-test-token');
  await request(app).get('/metrics').expect(401);
  await request(app).get('/metrics').set('Authorization', 'Bearer user-jwt').expect(401);
  await request(app).get('/health').expect(200);
  await request(app).get('/not-a-route-one');
  await request(app).get('/not-a-route-two').expect(429);
  for (let i = 0; i < 3; i++) {
    const response = await scrape().expect(200).expect('Content-Type', /text\/plain/);
    expect(response.text).toContain('trekvn_http_requests_total');
    expect(response.text).toContain('service="' + service + '"');
    expect(response.text).toContain('process_cpu_seconds_total');
    expect(response.text).toMatch(/trekvn_http_requests_active\{[^\n]+\} 0/);
    expect(response.text).not.toContain('route="/metrics"');
    expect(response.text).not.toContain('not-a-route-one');
  }
});

test('independent service builds keep equivalent instrumentation', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../src/middlewares/metrics.js'), 'utf8');
  for (const service of services.slice(1)) {
    const copy = fs.readFileSync(
      path.resolve(__dirname, '../../..', service, 'src/middlewares/metrics.js'), 'utf8'
    );
    expect(copy.replace(/\r\n/g, '\n')).toBe(source.replace(/\r\n/g, '\n'));
  }
});

test('counts streamed/proxied responses, templates IDs and ignores scrape traffic', async () => {
  const app = express();
  const monitoring = createMetrics('test-service');
  app.use(monitoring.middleware);
  app.get('/metrics', monitoring.handler);
  app.get('/items/:id', (req, res) => {
    res.write('first chunk');
    res.end(req.params.id);
  });
  await request(app).get('/items/123?secret=one').expect(200);
  await request(app).get('/items/456').expect(200);
  const text = await monitoring.register.metrics();
  expect(text).toMatch(/trekvn_http_requests_total\{[^\n]*route="\/items\/:id"[^\n]*\} 2/);
  expect(text).not.toContain('route="/items/123"');
  expect(text).not.toContain('secret=one');
  expect(text).toMatch(/trekvn_http_requests_active\{[^\n]+\} 0/);
});

test('gateway counts a real upstream proxy response', async () => {
  const upstream = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"ok":true}');
  });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  try {
    jest.resetModules();
    process.env.AUTH_SERVICE_URL = 'http://127.0.0.1:' + upstream.address().port;
    process.env.DISABLE_RATE_LIMIT = 'true';
    const gateway = require('../../src/app');
    await request(gateway).post('/api/v1/auth/login').expect(200);
    const response = await request(gateway).get('/metrics')
      .set('Authorization', 'Bearer scrape-test-token').expect(200);
    expect(response.text).toMatch(/trekvn_http_requests_total\{[^\n]*route="\/api\/v1\/auth\/\*"[^\n]*status_code="200"[^\n]*\} 1/);
  } finally {
    await new Promise((resolve) => upstream.close(resolve));
  }
});

test('client abort releases active gauge and records once', async () => {
  const app = express();
  const monitoring = createMetrics('abort-test');
  app.use(monitoring.middleware);
  let responseClosed;
  const closed = new Promise((resolve) => { responseClosed = resolve; });
  app.get('/stream', (_req, res) => {
    res.once('close', responseClosed);
    res.write('chunk');
  });
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise((resolve) => server.once('listening', resolve));
    await new Promise((resolve, reject) => {
      http.get('http://127.0.0.1:' + server.address().port + '/stream', (res) => {
        res.once('data', () => {
          res.destroy();
          resolve();
        });
      }).on('error', reject);
    });
    await closed;
    await new Promise((resolve) => server.close(resolve));
    const text = await monitoring.register.metrics();
    expect(text).toMatch(/status_code="499"[^\n]*\} 1/);
    expect(text).toMatch(/trekvn_http_requests_active\{[^\n]+\} 0/);
  } finally {
    server.close();
  }
});
