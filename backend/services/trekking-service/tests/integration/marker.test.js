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

const makeActiveJourney = async () => {
  const userId = new mongoose.Types.ObjectId().toString();
  const token = factory.generateToken({ id: userId });
  const place = await factory.createPlace();
  const route = await factory.createRoute(place._id);
  const journey = await factory.createJourney(userId, place._id, route._id, {
    status: 'ACTIVE',
    startedAt: new Date(),
  });
  return { userId, token, place, route, journey };
};

it('replays an acknowledged marker after journey completion without creating another marker', async () => {
  const { token, journey } = await makeActiveJourney();
  const payload = factory.markerPayload({ clientMarkerId: 'lost-marker-ack' });
  const post = () => request(app).post(`/api/v1/journeys/${journey._id}/markers`).set('Authorization', `Bearer ${token}`).send(payload);
  const first = await post();
  expect(first.status).toBe(201);
  await require('../../src/models/Journey').findByIdAndUpdate(journey._id, { status: 'COMPLETED' });
  const replay = await post();
  expect(replay.status).toBe(201);
  expect(replay.body.data.journeyMarkerId).toBe(first.body.data.journeyMarkerId);
  expect(await require('../../src/models/JourneyMarker').countDocuments()).toBe(1);
});

// ═══════════════════════════════════════════════════════════════════════════════
// 8. Create Marker
// ═══════════════════════════════════════════════════════════════════════════════
describe('POST /api/v1/journeys/:journeyId/markers — Create Marker', () => {
  it('201 — tạo marker thành công', async () => {
    const { token, journey } = await makeActiveJourney();
    const res = await request(app)
      .post(`/api/v1/journeys/${journey._id}/markers`)
      .set('Authorization', `Bearer ${token}`)
      .send(factory.markerPayload());

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.type).toBe('VIEWPOINT');
    expect(res.body.data.location.type).toBe('Point');
  });

  it('400 — GeoJSON không hợp lệ (longitude > 180) bị từ chối', async () => {
    const { token, journey } = await makeActiveJourney();
    const res = await request(app)
      .post(`/api/v1/journeys/${journey._id}/markers`)
      .set('Authorization', `Bearer ${token}`)
      .send(factory.markerPayload({
        location: { type: 'Point', coordinates: [200, 12.05] }, // invalid lng
      }));
    expect(res.status).toBe(400);
  });

  it('markerCount tăng sau khi tạo marker', async () => {
    const { token, journey } = await makeActiveJourney();
    await request(app)
      .post(`/api/v1/journeys/${journey._id}/markers`)
      .set('Authorization', `Bearer ${token}`)
      .send(factory.markerPayload());

    const Journey = require('../../src/models/Journey');
    const updated = await Journey.findById(journey._id);
    expect(updated.markerCount).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 9. Retry marker bằng clientMarkerId không duplicate
// ═══════════════════════════════════════════════════════════════════════════════
describe('Marker Idempotency (clientMarkerId)', () => {
  it('retry với cùng clientMarkerId không tạo duplicate', async () => {
    const { token, journey } = await makeActiveJourney();
    const payload = factory.markerPayload({ clientMarkerId: `client_marker_${Date.now()}` });

    const res1 = await request(app)
      .post(`/api/v1/journeys/${journey._id}/markers`)
      .set('Authorization', `Bearer ${token}`)
      .send(payload);
    expect(res1.status).toBe(201);

    const res2 = await request(app)
      .post(`/api/v1/journeys/${journey._id}/markers`)
      .set('Authorization', `Bearer ${token}`)
      .send(payload);
    expect(res2.status).toBe(201);
    // Cùng markerId
    expect(res2.body.data.journeyMarkerId).toBe(res1.body.data.journeyMarkerId);

    // DB chỉ có 1 marker
    const JourneyMarker = require('../../src/models/JourneyMarker');
    const count = await JourneyMarker.countDocuments({ clientMarkerId: payload.clientMarkerId });
    expect(count).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 10. Marker CRUD Authorization
// ═══════════════════════════════════════════════════════════════════════════════
describe('Marker Authorization', () => {
  it('404 — user B không thể xem markers của journey user A', async () => {
    const { journey } = await makeActiveJourney();
    const userBId = new mongoose.Types.ObjectId().toString();
    const tokenB = factory.generateToken({ id: userBId });

    const res = await request(app)
      .get(`/api/v1/journeys/${journey._id}/markers`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(res.status).toBe(404);
  });

  it('403 — user B không thể xóa marker của user A', async () => {
    const { token, journey } = await makeActiveJourney();
    // Tạo marker cho user A
    const markerRes = await request(app)
      .post(`/api/v1/journeys/${journey._id}/markers`)
      .set('Authorization', `Bearer ${token}`)
      .send(factory.markerPayload());
    expect(markerRes.status).toBe(201);
    const markerId = markerRes.body.data.journeyMarkerId;

    // User B cố xóa — journey không thuộc B → 404
    const userBId = new mongoose.Types.ObjectId().toString();
    const tokenB = factory.generateToken({ id: userBId });
    const res = await request(app)
      .delete(`/api/v1/journeys/${journey._id}/markers/${markerId}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect([403, 404]).toContain(res.status);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 11. Delete marker update markerCount
// ═══════════════════════════════════════════════════════════════════════════════
describe('Delete Marker — markerCount update', () => {
  it('markerCount giảm sau khi xóa marker', async () => {
    const { token, journey } = await makeActiveJourney();

    const createRes = await request(app)
      .post(`/api/v1/journeys/${journey._id}/markers`)
      .set('Authorization', `Bearer ${token}`)
      .send(factory.markerPayload());
    expect(createRes.status).toBe(201);
    const markerId = createRes.body.data.journeyMarkerId;

    const deleteRes = await request(app)
      .delete(`/api/v1/journeys/${journey._id}/markers/${markerId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(deleteRes.status).toBe(204);

    const Journey = require('../../src/models/Journey');
    const updated = await Journey.findById(journey._id);
    expect(updated.markerCount).toBe(0);
  });
});
