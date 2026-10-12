/**
 * Test: Health check endpoint
 */

const request = require('supertest');
const db = require('../setup/db');
const createApp = require('../../src/app');

let app;

beforeAll(async () => {
  await db.connect();
  app = createApp();
});

afterAll(async () => {
  await db.disconnect();
});

describe('GET /health', () => {
  it('trả về status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', service: 'auth-service' });
  });
});

describe('Route không tồn tại', () => {
  it('trả về 404', async () => {
    const res = await request(app).get('/api/v1/not-exist');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});
