const express = require('express');
const request = require('supertest');

let upstream;
let app;
const originalEnv = { ...process.env };
beforeAll(async () => {
  const stub = express();
  stub.use(express.json());
  stub.get('/api/v1/auth/verify', (req, res) => res.json({
    success: true, data: { id: 'u', role: req.headers.authorization === 'Bearer current-admin' ? 'ADMIN' : 'USER' },
  }));
  stub.get('/api/v1/admin/trekking/places/p/offline-map/file', (_req, res) =>
    res.type('application/zip').send(Buffer.from('test-map-binary')));
  stub.use((req, res) => res.json({
    url: req.originalUrl, method: req.method, body: req.body,
    serviceToken: req.headers['x-service-token'] || null,
    userId: req.headers['x-user-id'] || null,
    forwarded: req.headers['x-forwarded-for'],
  }));
  upstream = await new Promise((resolve) => {
    const server = stub.listen(0, '127.0.0.1', () => resolve(server));
  });
  const url = `http://127.0.0.1:${upstream.address().port}`;
  for (const name of ['AUTH_SERVICE_URL', 'CHECKIN_SERVICE_URL', 'TREKKING_SERVICE_URL', 'AGENT_SERVICE_URL']) {
    process.env[name] = url;
  }
  process.env.NODE_ENV = 'test';
  jest.resetModules();
  app = require('../../src/app');
});
afterAll(async () => {
  process.env = originalEnv;
  upstream.closeAllConnections();
  await new Promise((resolve) => upstream.close(resolve));
});

test('proxy preserves path/query/body and strips external service credentials and forged identity', async () => {
  const response = await request(app).post('/api/v1/auth/register?source=mobile')
    .set('X-Service-Token', 'fake-external-secret').set('X-User-Id', 'forged-admin')
    .set('X-Forwarded-For', '192.0.2.88').send({ displayName: 'TrekVN' });
  expect(response.status).toBe(200);
  expect(response.body).toMatchObject({ url: '/api/v1/auth/register?source=mobile', method: 'POST', body: { displayName: 'TrekVN' }, serviceToken: null, userId: null });
  expect(response.body.forwarded).not.toBe('192.0.2.88');
});

test('current USER role cannot proxy an admin request even with a valid old token', async () => {
  expect((await request(app).get('/api/v1/admin/users').auth('demoted-admin', { type: 'bearer' })).status).toBe(403);
});

test('authenticated map file response streams intact through the proxy', async () => {
  const response = await request(app).get('/api/v1/admin/trekking/places/p/offline-map/file').auth('current-admin', { type: 'bearer' })
    .buffer(true).parse((res, callback) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => callback(null, Buffer.concat(chunks)));
    });
  expect(response.status).toBe(200);
  expect(response.body.toString()).toBe('test-map-binary');
});
