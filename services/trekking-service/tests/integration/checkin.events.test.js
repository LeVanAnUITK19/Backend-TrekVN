const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const Journey = require('../../src/models/Journey');
const Receipt = require('../../src/models/ProcessedEvent');
const badges = require('../../src/services/badgeEvaluator.service');
const { handleEvent } = require('../../src/events/consumers/trekking.consumer');
let replSet, journey, badgeSpy;
const originalFetch = global.fetch;
beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(replSet.getUri());
  await Receipt.init();
}, 120000);
afterAll(async () => { await mongoose.disconnect(); await replSet.stop(); });
beforeEach(async () => {
  await Journey.deleteMany({}); await Receipt.deleteMany({});
  journey = await Journey.create({ userId: 'user', name: 'Journey',
    trekkingPlaceId: new mongoose.Types.ObjectId(), trekkingRouteId: new mongoose.Types.ObjectId() });
  badgeSpy = jest.spyOn(badges, 'evaluateBadges').mockResolvedValue([]);
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ data: {
    visitedProvinces: 3, visitedPlaces: 4, summitCheckins: 2, maxAltitude: 2200,
  } }) });
});
afterEach(() => { global.fetch = originalFetch; jest.restoreAllMocks(); });
const send = (eventId, overrides = {}) => handleEvent({ eventId, eventType: 'CHECKIN_VERIFIED',
  payload: { userId: 'user', journeyId: String(journey._id), checkinId: 'checkin', ...overrides } });
test('count increments once per source even with different event receipts; badges receive real visit statistics', async () => {
  await send('event-1'); await send('event-1'); await send('event-2');
  expect((await Journey.findById(journey._id)).checkinCount).toBe(1);
  expect(await Receipt.countDocuments()).toBe(1);
  expect(badgeSpy).toHaveBeenCalledWith('user', expect.objectContaining({
    visitedProvinces: 3, visitedPlaces: 4, summitCheckins: 2, maxAltitude: 2200,
  }), String(journey._id));
});
test('failure after count update retries badge delivery without incrementing the count again', async () => {
  badgeSpy.mockRejectedValueOnce(new Error('temporary badge failure'));
  await expect(send('event-1')).rejects.toThrow('temporary');
  await send('event-1');
  expect((await Journey.findById(journey._id)).checkinCount).toBe(1);
  expect(badgeSpy).toHaveBeenCalledTimes(2);
});
test('wrong journey owner does not persist a receipt or increment a count', async () => {
  await expect(send('event-1', { userId: 'other-user' })).rejects.toThrow('not found');
  expect(await Receipt.countDocuments()).toBe(0);
  expect((await Journey.findById(journey._id)).checkinCount).toBe(0);
});

test('concurrent deliveries of one check-in retain a single increment', async () => {
  await Promise.all([send('event-1'), send('event-2')]);
  expect((await Journey.findById(journey._id)).checkinCount).toBe(1);
});
