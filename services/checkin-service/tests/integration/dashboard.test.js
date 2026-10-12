const express = require('express');
const request = require('supertest');
const db = require('../setup/db');
const { generateToken } = require('../helpers/factory');
const Checkin = require('../../src/models/MilestoneCheckin');

let app;
beforeAll(async () => {
  await db.connect();
  app = express();
  app.use('/internal/v1', require('../../src/routes/internal.routes'));
  app.use((err, _req, res, _next) => res.status(err.statusCode || 500).json({ message: err.message }));
});
afterEach(db.clearDatabase);
afterAll(db.disconnect);

test('counts database checkins independently of gamification projections', async () => {
  const now = new Date();
  await Checkin.collection.insertMany([
    { journeyId: 'one', milestoneId: 'first', userId: 'user', createdAt: now },
    { journeyId: 'two', milestoneId: 'second', userId: 'user', createdAt: now },
  ]);
  const result = await request(app).get('/internal/v1/dashboard').set('Authorization', `Bearer ${generateToken({ role: 'ADMIN' })}`);
  expect(result.status).toBe(200);
  expect(result.body.data.stats.totalCheckins).toBe(2);
  expect(result.body.data.activityChart[0].checkins).toBe(2);
});

test('rejects unauthenticated and ordinary user requests', async () => {
  expect((await request(app).get('/internal/v1/dashboard')).status).toBe(401);
  expect((await request(app).get('/internal/v1/dashboard').set('Authorization', `Bearer ${generateToken()}`)).status).toBe(403);
});
