const express = require('express');
const request = require('supertest');
const db = require('../setup/db');
const Checkin = require('../../src/models/MilestoneCheckin');

const serviceToken = 'dashboard-test-token';
const originalServiceToken = process.env.TREKVIET_INTERNAL_TOKEN;
let app;
beforeAll(async () => {
  process.env.TREKVIET_INTERNAL_TOKEN = serviceToken;
  await db.connect();
  app = express();
  app.use('/internal/v1', require('../../src/routes/internal.routes'));
  app.use((err, _req, res, _next) => res.status(err.statusCode || 500).json({ message: err.message }));
});
afterEach(db.clearDatabase);
afterAll(async () => {
  if (originalServiceToken === undefined) {
    delete process.env.TREKVIET_INTERNAL_TOKEN;
  } else {
    process.env.TREKVIET_INTERNAL_TOKEN = originalServiceToken;
  }
  await db.disconnect();
});

test('counts database checkins independently of gamification projections', async () => {
  const now = new Date();
  await Checkin.collection.insertMany([
    { journeyId: 'one', milestoneId: 'first', userId: 'user', createdAt: now },
    { journeyId: 'two', milestoneId: 'second', userId: 'user', createdAt: now },
  ]);
  const result = await request(app)
    .get('/internal/v1/dashboard')
    .set('X-Service-Token', serviceToken);
  expect(result.status).toBe(200);
  expect(result.body.data.stats.totalCheckins).toBe(2);
  expect(result.body.data.activityChart[0].checkins).toBe(2);
});

test('rejects unauthenticated requests', async () => {
  expect((await request(app).get('/internal/v1/dashboard')).status).toBe(403);
});
