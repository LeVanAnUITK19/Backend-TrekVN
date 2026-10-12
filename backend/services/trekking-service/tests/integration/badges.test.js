'use strict';

const request = require('supertest');
const mongoose = require('mongoose');
const db = require('../setup/db');
const factory = require('../helpers/factory');
const Badge = require('../../src/models/Badge');
const UserBadge = require('../../src/models/UserBadge');
const Outbox = require('../../src/models/EventOutbox');
const { evaluateBadges } = require('../../src/services/badgeEvaluator.service');
const { isConditionMet } = require('../../src/services/badgeCondition');
let app;
let auditSpy;
beforeAll(async () => {
  auditSpy = jest.spyOn(require('axios'), 'post').mockResolvedValue({ data: { success: true } });
  await db.connect();
  await UserBadge.init();
  await Outbox.init();
  app = require('../../src/app')();
});
afterEach(async () => { await db.clearDatabase(); });
afterAll(async () => { auditSpy.mockRestore(); await db.disconnect(); });

test.each([
  ['CHECKIN_COUNT', 'totalCheckins'], ['JOURNEY_COUNT', 'completedJourneys'],
  ['JOURNEY_COMPLETED_COUNT', 'completedJourneys'], ['PROVINCE_COUNT', 'visitedProvinces'],
  ['PROVINCE_VISITED_COUNT', 'visitedProvinces'], ['ELEVATION_TOTAL', 'totalElevationGain'],
  ['CONTRIBUTION_APPROVED', 'approvedContributions'], ['SUMMIT_CHECKIN_COUNT', 'summitCheckins'],
  ['PLACE_VISITED_COUNT', 'visitedPlaces'], ['ALTITUDE_REACHED', 'maxAltitude'], ['FIRST_JOURNEY', 'completedJourneys'],
])('%s matches the admin rule and requires reaching its threshold', async (type, field) => {
  const badge = await Badge.create({ code: type, name: type, condition: { type, value: 2 } });
  expect(await evaluateBadges('user', { [field]: 1 })).toHaveLength(0);
  expect(await evaluateBadges('user', { [field]: 2 })).toHaveLength(1);
  await evaluateBadges('user', { [field]: 10 });
  expect(await UserBadge.countDocuments({ badgeId: badge._id })).toBe(1);
  expect(await Outbox.countDocuments({ eventType: 'TREKKING_BADGE_EARNED' })).toBe(1);
});

test('distance is kilometres by default, explicit metres remain supported, invalid rules do not award', () => {
  expect(isConditionMet({ type: 'DISTANCE_TOTAL', value: 5 }, { totalDistanceMeters: 4999 })).toBe(false);
  expect(isConditionMet({ type: 'DISTANCE_TOTAL', value: 5 }, { totalDistanceMeters: 5000 })).toBe(true);
  expect(isConditionMet({ type: 'DISTANCE_TOTAL', value: 5000, unit: 'METERS' }, { totalDistanceMeters: 5000 })).toBe(true);
  expect(isConditionMet({ type: 'TYPO', value: 1 }, { totalCheckins: 20 })).toBe(false);
  expect(isConditionMet({ type: 'CHECKIN_COUNT', value: -1 }, { totalCheckins: 20 })).toBe(false);
  expect(isConditionMet({ type: 'FIRST_JOURNEY' }, { completedJourneys: 1 })).toBe(true);
});

test('specific-place badge requires that place, and inactive rules do not award', async () => {
  const placeId = new mongoose.Types.ObjectId().toString();
  await Badge.create({ code: 'PLACE', name: 'Place', condition: { type: 'SPECIFIC_PLACE', placeId } });
  await Badge.create({ code: 'DISABLED', name: 'Disabled', status: 'INACTIVE', condition: { type: 'CHECKIN_COUNT', value: 1 } });
  expect(await evaluateBadges('user', { visitedPlaceIds: ['other'], totalCheckins: 1 })).toHaveLength(0);
  expect(await evaluateBadges('user', { visitedPlaceIds: [placeId], totalCheckins: 1 })).toHaveLength(1);
});

test('admin lists active and inactive badges with real award counts; validation rejects unsupported rules', async () => {
  const token = factory.generateAdminToken();
  const endpoint = '/api/v1/admin/badges';
  const create = await request(app).post(endpoint).set('Authorization', `Bearer ${token}`)
    .send({ code: 'FIRST_CHECK', name: 'First Check', condition: { type: 'CHECKIN_COUNT', value: 1 } });
  expect(create.status).toBe(201);
  const id = create.body.data.id;
  await evaluateBadges('user', { totalCheckins: 1 });
  const toggle = await request(app).patch(`${endpoint}/${id}/status`).set('Authorization', `Bearer ${token}`).send({ status: 'INACTIVE' });
  expect(toggle.status).toBe(200);
  const list = await request(app).get(endpoint).set('Authorization', `Bearer ${token}`);
  expect(list.body.data).toEqual(expect.arrayContaining([expect.objectContaining({ id, status: 'INACTIVE', totalAwarded: 1 })]));
  const own = await request(app).get('/api/v1/badges/me').set('Authorization', `Bearer ${factory.generateToken({ id: 'user' })}`);
  expect(own.body.data[0].badgeId.id).toBe(id);
  for (const condition of [{ type: 'UNKNOWN', value: 1 }, { type: 'CHECKIN_COUNT', value: -1 }, { type: 'SPECIFIC_PLACE', value: 1 }]) {
    expect((await request(app).post(endpoint).set('Authorization', `Bearer ${token}`).send({ code: 'BAD', name: 'Bad rule', condition })).status).toBe(400);
  }
  expect((await request(app).get(endpoint).set('Authorization', `Bearer ${factory.generateToken()}`)).status).toBe(403);
});
