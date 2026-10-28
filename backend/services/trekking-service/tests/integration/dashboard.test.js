const mongoose = require('mongoose');
const request = require('supertest');
const express = require('express');
const db = require('../setup/db');
const { getDashboard } = require('../../src/services/dashboard.service');
const Place = require('../../src/models/TrekkingPlace');
const Badge = require('../../src/models/Badge');
const UserBadge = require('../../src/models/UserBadge');
const Journey = require('../../src/models/Journey');
const RouteSubmission = require('../../src/models/RouteSubmission');
const PlaceSuggestion = require('../../src/models/PlaceSuggestion');

beforeAll(db.connect);
afterAll(db.disconnect);
afterEach(db.clearDatabase);

test('totals track database rows, including inactive definitions and planned journeys', async () => {
  const now = new Date();
  const badgeId = new mongoose.Types.ObjectId();
  await Place.collection.insertMany([{ slug: 'one', status: 'ACTIVE', createdAt: now }, { slug: 'two', status: 'DISABLED', createdAt: now }]);
  await Badge.collection.insertMany([{ _id: badgeId, code: 'ONE', name: 'Badge', status: 'ACTIVE', rarity: 'RARE', createdAt: now }, { code: 'TWO', status: 'INACTIVE', createdAt: now }]);
  await Journey.collection.insertMany([{ status: 'COMPLETED', createdAt: now }, { status: 'PLANNED', createdAt: now }, { status: 'IN_PROGRESS', createdAt: now }]);
  await RouteSubmission.collection.insertMany([{ status: 'PENDING_REVIEW', proposedName: 'Route', userId: 'user', createdAt: now }, { status: 'DRAFT', createdAt: now }]);
  await PlaceSuggestion.collection.insertMany([{ status: 'APPROVED', createdAt: now }, { status: 'PENDING_REVIEW', createdAt: now }, { status: 'NEEDS_REVISION', createdAt: now }]);
  await UserBadge.create({ userId: 'user', badgeId });
  const data = await getDashboard('7d');
  expect(data.stats).toMatchObject({ totalPlaces: 2, totalBadgeTypes: 2, totalJourneys: 3, pendingContributions: 2 });
  expect(data.contributionRatio).toEqual({ approved: 1, pending: 2, rejected: 0, needsRevision: 1 });
  expect(data.recentContributions).toHaveLength(4);
  expect(data.recentBadges[0]).toMatchObject({ name: 'Badge', rarity: 'RARE', userId: 'user' });
  await Place.collection.insertOne({ slug: 'third', createdAt: now });
  expect((await getDashboard()).stats.totalPlaces).toBe(3);
});

test('internal dashboard requires service token', async () => {
  const originalServiceToken = process.env.TREKVIET_INTERNAL_TOKEN;
  process.env.TREKVIET_INTERNAL_TOKEN = 'dashboard-test-token';
  const app = express();
  app.use('/internal/v1', require('../../src/routes/internal.routes'));
  app.use((err, _req, res, _next) => res.status(err.statusCode || 500).json({ message: err.message }));
  
  try {
    expect((await request(app).get('/internal/v1/dashboard')).status).toBe(403);

    const result = await request(app)
      .get('/internal/v1/dashboard')
      .set('X-Service-Token', 'dashboard-test-token');
    expect(result.status).toBe(200);
    expect(result.body.data.stats.totalPlaces).toBe(0);
  } finally {
    if (originalServiceToken === undefined) {
      delete process.env.TREKVIET_INTERNAL_TOKEN;
    } else {
      process.env.TREKVIET_INTERNAL_TOKEN = originalServiceToken;
    }
  }
});
