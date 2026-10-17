const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const Profile = require('../../src/models/UserRankProfile');
const Rank = require('../../src/models/RankDefinition');
const History = require('../../src/models/RankHistory');
const Transaction = require('../../src/models/XpTransaction');
const Receipt = require('../../src/models/ProcessedEvent');
const { handleEvent } = require('../../src/services/gamificationEvent.service');
const rankRepo = require('../../src/repositories/rankDefinition.repository');
const User = require('../../src/models/User');
const { getDashboard } = require('../../src/services/dashboard.service');

let replSet;
let userId;
beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(replSet.getUri());
  await Promise.all([Profile.init(), Rank.init(), History.init(), Transaction.init(), Receipt.init()]);
}, 120000);
afterAll(async () => {
  await mongoose.disconnect();
  if (replSet) {await replSet.stop();}
});
beforeEach(async () => {
  for (const model of [Profile, Rank, History, Transaction, Receipt, User]) {await model.deleteMany({});}
  userId = String(new mongoose.Types.ObjectId());
  await Rank.create({ code: 'NEWBIE', name: 'Newbie', level: 1, minXp: 0 });
});

const send = (eventType, payload, eventId = String(new mongoose.Types.ObjectId())) =>
  handleEvent({ eventId, eventType, payload: { userId, ...payload } });

test.each([
  ['CHECKIN_VERIFIED', { checkinId: 'check', milestoneType: 'SUMMIT' }, 50, 'verifiedCheckinCount'],
  ['PROVINCE_FIRST_VISITED', { provinceId: 'province' }, 100, 'visitedProvinceCount'],
  ['PLACE_FIRST_VISITED', { trekkingPlaceId: 'place' }, 50, 'visitedPlaceCount'],
  ['TREKKING_BADGE_EARNED', { badgeId: 'badge', rarity: 'LEGENDARY' }, 1000, 'badgeCount'],
  ['TREKKING_CONTRIBUTION_APPROVED', { contributionId: 'contribution', type: 'PLACE_SUGGESTION' }, 200, 'approvedContributionCount'],
  ['TREKKING_CONTRIBUTION_APPROVED', { contributionId: 'contribution', contributionType: 'ROUTE_SUBMISSION' }, 300, 'approvedContributionCount'],
])('%s awards correct XP and ignores duplicate source with another event ID', async (type, payload, xp, counter) => {
  await send(type, payload, 'same-event');
  await send(type, payload, 'same-event');
  await send(type, payload, 'another-event');
  const profile = await Profile.findOne({ userId });
  expect(profile.totalXp).toBe(xp);
  expect(profile[counter]).toBe(1);
  expect(await Transaction.countDocuments()).toBe(1);
});

test('journey distance/elevation XP are floored but statistics keep partial units', async () => {
  await send('TREKKING_JOURNEY_COMPLETED', { journeyId: 'long', distanceMeters: 2450, elevationGain: 250 });
  await send('TREKKING_JOURNEY_COMPLETED', { journeyId: 'short', distanceMeters: 450, elevationGain: 50 });
  const profile = await Profile.findOne({ userId });
  expect(profile.totalXp).toBe(330);
  expect(profile.totalDistanceMeters).toBe(2900);
  expect(profile.totalElevationGain).toBe(300);
  expect(profile.completedJourneyCount).toBe(2);
});

test('internal HTTP delivery requires a service token and replays without duplicate XP', async () => {
  process.env.TREKVIET_INTERNAL_TOKEN = 'test-events-token';
  const request = require('supertest');
  const app = require('../../src/app')();
  const event = { eventId: 'http-event', eventType: 'CHECKIN_VERIFIED', payload: { userId, checkinId: 'http-check', milestoneType: 'SUMMIT' } };
  const unauthorized = await request(app).post('/internal/v1/gamification/events').send(event);
  expect([401, 403]).toContain(unauthorized.status);
  for (let i = 0; i < 2; i++) {
    const response = await request(app).post('/internal/v1/gamification/events').set('X-Service-Token', 'test-events-token').send(event);
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  }
  expect((await Profile.findOne({ userId })).totalXp).toBe(50);
  expect(await Transaction.countDocuments()).toBe(1);
});

test('admin totals come from source services independently of completed-journey XP counters', async () => {
  const user = await User.create({ displayName: 'Stats user', email: 'stats@example.com', passwordHash: 'test-hash', authProvider: 'LOCAL' });
  const original = global.fetch;
  global.fetch = jest.fn(async (url) => ({ ok: true, json: async () => ({ success: true, data:
    url.includes('3003') ? { totalJourneys: 6, totalContributions: 2 } : { totalCheckins: 3 } }) }));
  try {
    const data = await require('../../src/services/admin.service').getUserById(String(user._id));
    expect(data).toMatchObject({ totalJourneys: 6, totalCheckins: 3, totalContributions: 2 });
    global.fetch = jest.fn().mockRejectedValue(new Error('offline'));
    const unavailable = await require('../../src/services/admin.service').getUserById(String(user._id));
    expect(unavailable.totalJourneys).toBeNull();
  } finally { global.fetch = original; }
});

test('failure rolls back ledger, counters and receipt; retry awards exactly once', async () => {
  const original = Profile.prototype.save;
  const spy = jest.spyOn(Profile.prototype, 'save').mockRejectedValueOnce(new Error('temporary database failure'));
  await expect(send('CHECKIN_VERIFIED', { checkinId: 'check', milestoneType: 'SUMMIT' }, 'retry')).rejects.toThrow('temporary');
  expect(await Transaction.countDocuments()).toBe(0);
  expect(await Receipt.countDocuments()).toBe(0);
  spy.mockImplementation(original);
  await send('CHECKIN_VERIFIED', { checkinId: 'check', milestoneType: 'SUMMIT' }, 'retry');
  expect((await Profile.findOne({ userId })).totalXp).toBe(50);
  spy.mockRestore();
});

test('concurrent activities retain both rewards and create only one promotion', async () => {
  await Rank.create({ code: 'HIKER', name: 'Hiker', level: 2, minXp: 200 });
  await send('PROVINCE_FIRST_VISITED', { provinceId: 'initial' });
  await Promise.all([
    send('PROVINCE_FIRST_VISITED', { provinceId: 'second' }),
    send('PLACE_FIRST_VISITED', { trekkingPlaceId: 'place' }),
  ]);
  const profile = await Profile.findOne({ userId }).populate('currentRankId');
  expect(profile.totalXp).toBe(250);
  expect(profile.currentRankId.code).toBe('HIKER');
  expect(await History.countDocuments({ changeType: 'PROMOTION' })).toBe(1);
});

test('completed journeys and XP need a badge before promotion, and replay does not add extra badge XP', async () => {
  await Rank.create({ code: 'HIKER', name: 'Hiker', level: 2, minXp: 500,
    minCompletedJourneys: 2, minVisitedProvinces: 1, minBadgeCount: 1 });
  await send('TREKKING_JOURNEY_COMPLETED', { journeyId: 'j1' });
  await send('TREKKING_JOURNEY_COMPLETED', { journeyId: 'j2' });
  await send('PROVINCE_FIRST_VISITED', { provinceId: 'p1' });
  await send('CHECKIN_VERIFIED', { checkinId: 's1', milestoneType: 'SUMMIT' });
  await send('CHECKIN_VERIFIED', { checkinId: 's2', milestoneType: 'SUMMIT' });
  expect((await Profile.findOne({ userId }).populate('currentRankId')).currentRankId.code).toBe('NEWBIE');
  await send('TREKKING_BADGE_EARNED', { badgeId: 'b1', rarity: 'COMMON' }, 'badge-original');
  await send('TREKKING_BADGE_EARNED', { badgeId: 'b1', rarity: 'COMMON' }, 'badge-replay');
  const profile = await Profile.findOne({ userId }).populate('currentRankId');
  expect(profile.currentRankId.code).toBe('HIKER');
  expect(profile.badgeCount).toBe(1);
  expect(profile.totalXp).toBe(550);
  expect(await History.countDocuments({ userId })).toBe(1);
});

test('inactive intermediate rank does not hide the next active target', async () => {
  await Rank.create({ code: 'HIKER', name: 'Hiker', level: 2, minXp: 100, status: 'INACTIVE' });
  await Rank.create({ code: 'EXPLORER', name: 'Explorer', level: 3, minXp: 200 });
  expect((await rankRepo.findNextRank(1)).code).toBe('EXPLORER');
});

test('dashboard uses remote totals, enriches names and preserves unavailable data as null', async () => {
  await User.create({ _id: userId, email: 'dashboard@test.invalid', displayName: 'Trekker', status: 'ACTIVE', lastLoginAt: new Date() });
  const fakeFetch = jest.spyOn(global, 'fetch').mockImplementation(async (url) => ({
    ok: true,
    json: async () => ({ success: true, data: url.includes('3003') ? {
      stats: { totalJourneys: 9, totalPlaces: 8, totalBadgeTypes: 7, pendingContributions: 6 },
      contributionRatio: { approved: 1, pending: 6, rejected: 2, needsRevision: 3 },
      recentBadges: [{ badgeId: 'badge', userId }], recentContributions: [{ id: 'contribution', userId }],
    } : { stats: { totalCheckins: 5 } } }),
  }));
  try {
    const data = await getDashboard('7d', 'Bearer fixture');
    expect(data.stats).toMatchObject({ totalUsers: 1, totalRanks: 1, totalJourneys: 9, totalPlaces: 8, totalBadgeTypes: 7, pendingContributions: 6, totalCheckins: 5, totalPosts: null });
    expect(data.recentBadges[0].userName).toBe('Trekker');
    expect(data.recentContributions[0].contributor).toBe('Trekker');
    expect(data.activeUsers).toHaveLength(1);
    expect(fakeFetch.mock.calls[0][1].headers.Authorization).toBe('Bearer fixture');
    fakeFetch.mockRejectedValue(new Error('offline'));
    const offline = await getDashboard('7d', 'Bearer fixture');
    expect(offline.stats.totalPlaces).toBeNull();
    expect(offline.stats.totalBadgeTypes).toBeNull();
    expect(offline.contributionRatio).toBeNull();
    expect(offline.unavailableServices).toEqual(expect.arrayContaining(['trekking', 'checkin']));
  } finally { fakeFetch.mockRestore(); }
});
