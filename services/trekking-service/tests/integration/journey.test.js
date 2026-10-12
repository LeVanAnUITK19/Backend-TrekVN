'use strict';

const request = require('supertest');
const mongoose = require('mongoose');
const db = require('../setup/db');
const createApp = require('../../src/app');
const factory = require('../helpers/factory');

let app;

beforeAll(async () => {
  await db.connect();
  app = createApp();
});
afterEach(async () => { await db.clearDatabase(); });
afterAll(async () => { await db.disconnect(); });

// ─── Helpers ──────────────────────────────────────────────────────────────────

const makeUserAndData = async () => {
  const userId = new mongoose.Types.ObjectId().toString();
  const token = factory.generateToken({ id: userId });
  const place = await factory.createPlace();
  const route = await factory.createRoute(place._id);
  return { userId, token, place, route };
};

describe('Journey catalog history and admin visibility', () => {
  it('lists and opens journeys on disabled routes without changing reference IDs', async () => {
    const { userId, token, place, route } = await makeUserAndData();
    const journey = await factory.createJourney(userId, place._id, route._id);
    await require('../../src/models/TrekkingRoute').findByIdAndUpdate(route._id, { status: 'DISABLED' });
    const catalog = await request(app).get(`/api/v1/routes/${route._id}`).set('Authorization', `Bearer ${token}`);
    expect(catalog.status).toBe(404);
    for (const path of ['/api/v1/journeys', `/api/v1/journeys/${journey._id}`]) {
      const res = await request(app).get(path).set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      const item = res.body.data.items?.[0] ?? res.body.data;
      expect(item.trekkingRouteId).toBe(String(route._id));
      expect(item.trekkingPlaceId).toBe(String(place._id));
      expect(item.route).toMatchObject({ name: route.name, status: 'DISABLED' });
      expect(item.place.name).toBe(place.name);
    }
    const other = factory.generateToken();
    const res = await request(app).get(`/api/v1/journeys/${journey._id}`).set('Authorization', `Bearer ${other}`);
    expect(res.status).toBe(404);
  });

  it('admin list and detail reflect owner updates with catalog, planned dates and notes', async () => {
    const { userId, token, place, route } = await makeUserAndData();
    const adminToken = factory.generateAdminToken();
    const journey = await factory.createJourney(userId, place._id, route._id, {
      plannedStartAt: new Date('2026-10-10T00:00:00Z'),
      plannedEndAt: new Date('2026-10-11T00:00:00Z'), note: 'Test note', participantCount: 3,
      status: 'ACTIVE', startedAt: new Date(),
    });
    const paused = await request(app).post(`/api/v1/journeys/${journey._id}/pause`).set('Authorization', `Bearer ${token}`);
    expect(paused.status).toBe(200);
    for (const path of [`/api/v1/admin/trekking/journeys?userId=${userId}&status=PAUSED`, `/api/v1/admin/trekking/journeys/${journey._id}`]) {
      const res = await request(app).get(path).set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      const item = res.body.data.data?.[0] ?? res.body.data;
      expect(item).toMatchObject({
        id: String(journey._id), status: 'PAUSED', trekkingPlaceId: String(place._id),
        trekkingRouteId: String(route._id), placeName: place.name, routeName: route.name,
        note: 'Test note', participantCount: 3, plannedStartAt: '2026-10-10T00:00:00.000Z',
      });
    }
  });

  it('retains journeys even if their catalog records were deleted', async () => {
    const { userId, token, place, route } = await makeUserAndData();
    await factory.createJourney(userId, place._id, route._id);
    await require('../../src/models/TrekkingRoute').findByIdAndDelete(route._id);
    const res = await request(app).get('/api/v1/journeys').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.items[0].trekkingRouteId).toBe(String(route._id));
    expect(res.body.data.items[0].route).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 1. Create Journey
// ═══════════════════════════════════════════════════════════════════════════════
describe('POST /api/v1/journeys — Create Journey', () => {
  it('201 — tạo journey thành công', async () => {
    const { token, place, route } = await makeUserAndData();
    const res = await request(app)
      .post('/api/v1/journeys')
      .set('Authorization', `Bearer ${token}`)
      .send(factory.journeyPayload(place._id, route._id));
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('PLANNED');
  });

  it('400 — thiếu trekkingPlaceId bị từ chối', async () => {
    const { token, route } = await makeUserAndData();
    const res = await request(app)
      .post('/api/v1/journeys')
      .set('Authorization', `Bearer ${token}`)
      .send({ trekkingRouteId: String(route._id), name: 'Test' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('401 — không có token bị từ chối', async () => {
    const { place, route } = await makeUserAndData();
    const res = await request(app)
      .post('/api/v1/journeys')
      .send(factory.journeyPayload(place._id, route._id));
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. Retry Create Journey không duplicate (idempotency via clientJourneyId)
// ═══════════════════════════════════════════════════════════════════════════════
describe('POST /api/v1/journeys — Idempotency', () => {
  it('retry với cùng clientJourneyId không tạo duplicate', async () => {
    const { token, place, route } = await makeUserAndData();
    const payload = factory.journeyPayload(place._id, route._id, {
      clientJourneyId: `client_${Date.now()}`,
    });

    const res1 = await request(app)
      .post('/api/v1/journeys')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);
    expect(res1.status).toBe(201);

    const res2 = await request(app)
      .post('/api/v1/journeys')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);
    // Trả về journey đã tạo, không duplicate
    expect(res2.status).toBe(201);
    expect(res2.body.data.journeyId).toBe(res1.body.data.journeyId);

    // Kiểm tra DB: chỉ có 1 record
    const Journey = require('../../src/models/Journey');
    const count = await Journey.countDocuments({ clientJourneyId: payload.clientJourneyId });
    expect(count).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. Invalid Journey state transition
// ═══════════════════════════════════════════════════════════════════════════════
describe('Journey State Machine', () => {
  it('422 — không thể pause một journey ở trạng thái PLANNED', async () => {
    const { userId, token, place, route } = await makeUserAndData();
    const journey = await factory.createJourney(userId, place._id, route._id, { status: 'PLANNED' });

    const res = await request(app)
      .post(`/api/v1/journeys/${journey._id}/pause`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('JOURNEY_INVALID_STATE');
  });

  it('422 — không thể resume một journey ở trạng thái PLANNED', async () => {
    const { userId, token, place, route } = await makeUserAndData();
    const journey = await factory.createJourney(userId, place._id, route._id, { status: 'PLANNED' });

    const res = await request(app)
      .post(`/api/v1/journeys/${journey._id}/resume`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('JOURNEY_INVALID_STATE');
  });

  it('409 — không thể cancel journey đã COMPLETED', async () => {
    const { userId, token, place, route } = await makeUserAndData();
    const journey = await factory.createCompletedJourney(userId, place._id, route._id);

    const res = await request(app)
      .post(`/api/v1/journeys/${journey._id}/cancel`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('JOURNEY_ALREADY_COMPLETED');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. Pause / Resume
// ═══════════════════════════════════════════════════════════════════════════════
describe('Journey Pause/Resume', () => {
  it('ACTIVE → PAUSED → ACTIVE thành công', async () => {
    const { userId, token, place, route } = await makeUserAndData();
    const journey = await factory.createJourney(userId, place._id, route._id, { status: 'ACTIVE', startedAt: new Date() });

    const pauseRes = await request(app)
      .post(`/api/v1/journeys/${journey._id}/pause`)
      .set('Authorization', `Bearer ${token}`);
    expect(pauseRes.status).toBe(200);
    expect(pauseRes.body.data.status).toBe('PAUSED');

    const resumeRes = await request(app)
      .post(`/api/v1/journeys/${journey._id}/resume`)
      .set('Authorization', `Bearer ${token}`);
    expect(resumeRes.status).toBe(200);
    expect(resumeRes.body.data.status).toBe('ACTIVE');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. Complete Journey
// ═══════════════════════════════════════════════════════════════════════════════
describe('POST /api/v1/journeys/:id/complete', () => {
  it('200 — hoàn thành journey với statistics và track', async () => {
    const { userId, token, place, route } = await makeUserAndData();
    const journey = await factory.createJourney(userId, place._id, route._id, { status: 'ACTIVE', startedAt: new Date() });

    const res = await request(app)
      .post(`/api/v1/journeys/${journey._id}/complete`)
      .set('Authorization', `Bearer ${token}`)
      .send(factory.completePayload());

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('COMPLETED');
    expect(res.body.data.statistics.distanceMeters).toBe(12000);
    expect(res.body.data.track.encodedPolyline).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. Complete retry không emit business effect duplicate
// ═══════════════════════════════════════════════════════════════════════════════
describe('Complete Journey Idempotency', () => {
  it('retry complete với Idempotency-Key trả về cùng kết quả, không tạo duplicate', async () => {
    const { userId, token, place, route } = await makeUserAndData();
    const journey = await factory.createJourney(userId, place._id, route._id, { status: 'ACTIVE', startedAt: new Date() });
    const idemKey = `complete_${journey._id}_test`;

    const res1 = await request(app)
      .post(`/api/v1/journeys/${journey._id}/complete`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', idemKey)
      .send(factory.completePayload());
    expect(res1.status).toBe(200);
    expect(res1.body.data.status).toBe('COMPLETED');

    const res2 = await request(app)
      .post(`/api/v1/journeys/${journey._id}/complete`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', idemKey)
      .send(factory.completePayload());
    expect(res2.status).toBe(200);
    // Cùng journeyId, không tạo journey mới
    expect(res2.body.data.journeyId).toBe(res1.body.data.journeyId);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. User A không xem/sửa Journey của User B
// ═══════════════════════════════════════════════════════════════════════════════
describe('Journey Authorization', () => {
  it('404 — user A không thể xem journey của user B', async () => {
    const userAId = new mongoose.Types.ObjectId().toString();
    const userBId = new mongoose.Types.ObjectId().toString();
    const tokenA = factory.generateToken({ id: userAId });

    const { place, route } = await makeUserAndData();
    const journeyB = await factory.createJourney(userBId, place._id, route._id);

    const res = await request(app)
      .get(`/api/v1/journeys/${journeyB._id}`)
      .set('Authorization', `Bearer ${tokenA}`);
    // Journey không tìm thấy vì không thuộc userA
    expect(res.status).toBe(404);
  });

  it('404 — user A không thể complete journey của user B', async () => {
    const userAId = new mongoose.Types.ObjectId().toString();
    const userBId = new mongoose.Types.ObjectId().toString();
    const tokenA = factory.generateToken({ id: userAId });

    const { place, route } = await makeUserAndData();
    const journeyB = await factory.createJourney(userBId, place._id, route._id, { status: 'ACTIVE', startedAt: new Date() });

    const res = await request(app)
      .post(`/api/v1/journeys/${journeyB._id}/complete`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send(factory.completePayload());
    expect(res.status).toBe(404);
  });
});
