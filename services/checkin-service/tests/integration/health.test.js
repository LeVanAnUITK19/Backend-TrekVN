const request = require('supertest');
const createApp = require('../../src/app');
const db = require('../setup/db');

let app;

beforeAll(async () => {
  await db.connect();
  app = createApp();
}, 60000); // mongodb-memory-server cần download binary lần đầu

afterAll(async () => {
  await db.disconnect();
}, 30000);

describe('GET /health', () => {
  it('should return 200 with service name', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', service: 'checkin-service' });
  });
});
