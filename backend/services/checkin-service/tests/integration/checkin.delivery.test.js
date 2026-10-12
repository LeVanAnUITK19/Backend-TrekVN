const db = require('../setup/db');
const service = require('../../src/services/checkin.service');
const Province = require('../../src/models/Province');
const Checkin = require('../../src/models/MilestoneCheckin');
const PlaceVisit = require('../../src/models/PlaceVisit');
const ProvinceVisit = require('../../src/models/ProvinceVisit');
const Outbox = require('../../src/models/EventOutbox');
const { getTrekkingProviderInstance } = require('../../src/providers/trekking');

beforeAll(async () => { await db.connect(); await Promise.all([Outbox.init(), Checkin.init()]); });
afterAll(async () => { await db.disconnect(); });
beforeEach(() => {
  process.env.GAMIFICATION_HTTP_ENABLED = 'true';
  jest.spyOn(getTrekkingProviderInstance(), 'getMilestoneCheckinContext').mockResolvedValue({
    provinceId: 'ho_chi_minh', trekkingPlaceId: 'place', trekkingRouteId: 'route',
    location: { coordinates: [106.8, 10.8] }, checkinRadiusMeters: 500,
    type: 'SUMMIT', qualifiesPlaceVisit: true, altitudeMeters: 1000,
  });
});
afterEach(async () => { jest.restoreAllMocks(); delete process.env.GAMIFICATION_HTTP_ENABLED; await db.clearDatabase(); });
const body = () => ({ clientCheckinId: 'client-1', journeyId: 'journey', milestoneId: 'milestone',
  latitude: 10.8, longitude: 106.8, accuracyMeters: 30, checkedAt: new Date().toISOString() });

test('badge statistics count verified check-ins, distinct summit milestones and real places', async () => {
  await Province.create({ code: 'tp_ho_chi_minh', name: 'TP Hồ Chí Minh', region: 'SOUTH' });
  await service.createCheckin('user', body());
  await service.createCheckin('user', { ...body(), clientCheckinId: 'client-2', journeyId: 'journey-2' });
  process.env.TREKVIET_INTERNAL_TOKEN = 'stats-test-token';
  try {
    const app = require('../../src/app')();
    const stats = await require('supertest')(app).get('/internal/v1/users/user/stats').set('X-Service-Token', 'stats-test-token');
    expect(stats.status).toBe(200);
    expect(stats.body.data).toMatchObject({ totalCheckins: 2, summitCheckins: 1, visitedPlaces: 1, visitedPlaceIds: ['place'], maxAltitude: 1000 });
    const denied = await require('supertest')(app).get('/internal/v1/users/user/stats');
    expect([401, 403]).toContain(denied.status);
  } finally { delete process.env.TREKVIET_INTERNAL_TOKEN; }
});

test('province code resolves to ObjectId; retry saves one check-in, one visit and three durable events', async () => {
  const province = await Province.create({ code: 'tp_ho_chi_minh', name: 'TP Hồ Chí Minh', region: 'SOUTH' });
  const first = await service.createCheckin('user', body());
  const retry = await service.createCheckin('user', body());
  expect(String(first._id)).toBe(String(retry._id));
  expect(String(first.provinceId)).toBe(String(province._id));
  expect(first.altitudeMeters).toBe(1000);
  expect(await Checkin.countDocuments()).toBe(1);
  expect((await PlaceVisit.findOne()).visitCount).toBe(1);
  expect((await ProvinceVisit.findOne()).visitCount).toBe(1);
  expect(await Outbox.countDocuments({ status: 'PENDING' })).toBe(3);
});

test('unknown province returns a retryable service error without saving a check-in', async () => {
  await expect(service.createCheckin('user', body())).rejects.toMatchObject({ statusCode: 503 });
  expect(await Checkin.countDocuments()).toBe(0);
});

test('failure writing events can be recovered by replaying the same local receipt', async () => {
  await Province.create({ code: 'tp_ho_chi_minh', name: 'TP Hồ Chí Minh', region: 'SOUTH' });
  const failed = jest.spyOn(Outbox, 'create').mockRejectedValueOnce(new Error('temporary write failure'));
  await expect(service.createCheckin('user', body())).rejects.toThrow('temporary write failure');
  failed.mockRestore();
  await service.createCheckin('user', body());
  expect(await Checkin.countDocuments()).toBe(1);
  expect(await Outbox.countDocuments()).toBe(3);
  expect((await PlaceVisit.findOne()).visitCount).toBe(1);
});
