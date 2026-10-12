'use strict';

const request = require('supertest');
const mongoose = require('mongoose');
const db = require('../setup/db');
const createApp = require('../../src/app');
const factory = require('../helpers/factory');

let app;
const completed = async (userId, place) => {
  const route = await factory.createRoute(place._id);
  await factory.createCompletedJourney(userId, place._id, route._id);
};

beforeAll(async () => {
  await db.connect();
  app = createApp();
});
afterEach(async () => { await db.clearDatabase(); });
afterAll(async () => { await db.disconnect(); });

describe('Anonymous reviews', () => {
  it('keeps ownership private, hides identity in public lists and supports turning anonymity off', async () => {
    const userId = new mongoose.Types.ObjectId().toString();
    const token = factory.generateToken({ id: userId });
    const place = await factory.createPlace();
    await completed(userId, place);
    const url = `/api/v1/places/${place._id}/reviews`;
    const created = await request(app).post(url).set('Authorization', `Bearer ${token}`)
      .send({ point: 5, content: 'Một chuyến đi đáng nhớ', isAnonymous: true });
    expect(created.status).toBe(201);
    expect(created.body.data.isAnonymous).toBe(true);
    const own = await request(app).get(`${url}/me`).set('Authorization', `Bearer ${token}`);
    expect(own.body.data.userId).toBe(userId);
    const list = await request(app).get(url);
    expect(list.body.data.items[0].isAnonymous).toBe(true);
    expect(list.body.data.items[0].userId).toBeUndefined();
    expect(list.body.data.items[0].displayName).toBe('Trekker ẩn danh');
    const updated = await request(app).put(`${url}/${created.body.data.detailEvaluateId}`)
      .set('Authorization', `Bearer ${token}`).send({ isAnonymous: false });
    expect(updated.status).toBe(200);
    expect((await request(app).get(url)).body.data.items[0].userId).toBe(userId);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 18. Review rating 1..5
// ═══════════════════════════════════════════════════════════════════════════════
describe('Review — Rating validation', () => {
  it('201 — rating 1 hợp lệ', async () => {
    const userId = new mongoose.Types.ObjectId().toString();
    const token = factory.generateToken({ id: userId });
    const place = await factory.createPlace();
    await completed(userId, place);

    const res = await request(app)
      .post(`/api/v1/places/${place._id}/reviews`)
      .set('Authorization', `Bearer ${token}`)
      .send({ point: 1, content: 'Tạm ổn' });
    expect(res.status).toBe(201);
    expect(res.body.data.point).toBe(1);
  });

  it('201 — rating 5 hợp lệ', async () => {
    const userId = new mongoose.Types.ObjectId().toString();
    const token = factory.generateToken({ id: userId });
    const place = await factory.createPlace();
    await completed(userId, place);

    const res = await request(app)
      .post(`/api/v1/places/${place._id}/reviews`)
      .set('Authorization', `Bearer ${token}`)
      .send({ point: 5, content: 'Tuyệt vời' });
    expect(res.status).toBe(201);
    expect(res.body.data.point).toBe(5);
  });

  it('400 — rating 0 bị từ chối', async () => {
    const userId = new mongoose.Types.ObjectId().toString();
    const token = factory.generateToken({ id: userId });
    const place = await factory.createPlace();
    await completed(userId, place);

    const res = await request(app)
      .post(`/api/v1/places/${place._id}/reviews`)
      .set('Authorization', `Bearer ${token}`)
      .send({ point: 0 });
    expect(res.status).toBe(400);
  });

  it('400 — rating 6 bị từ chối', async () => {
    const userId = new mongoose.Types.ObjectId().toString();
    const token = factory.generateToken({ id: userId });
    const place = await factory.createPlace();
    await completed(userId, place);

    const res = await request(app)
      .post(`/api/v1/places/${place._id}/reviews`)
      .set('Authorization', `Bearer ${token}`)
      .send({ point: 6 });
    expect(res.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 19. Rating average/count update chính xác
// ═══════════════════════════════════════════════════════════════════════════════
describe('Review — ratingAverage và ratingCount update', () => {
  it('ratingAverage và ratingCount cập nhật sau mỗi review', async () => {
    const user1Id = new mongoose.Types.ObjectId().toString();
    const user2Id = new mongoose.Types.ObjectId().toString();
    const token1 = factory.generateToken({ id: user1Id });
    const token2 = factory.generateToken({ id: user2Id });
    const place = await factory.createPlace();
    await completed(user1Id, place);
    await completed(user2Id, place);

    await request(app)
      .post(`/api/v1/places/${place._id}/reviews`)
      .set('Authorization', `Bearer ${token1}`)
      .send({ point: 4, content: 'Khá tốt' });

    await request(app)
      .post(`/api/v1/places/${place._id}/reviews`)
      .set('Authorization', `Bearer ${token2}`)
      .send({ point: 2, content: 'Bình thường' });

    const TrekkingPlace = require('../../src/models/TrekkingPlace');
    const updatedPlace = await TrekkingPlace.findById(place._id);
    expect(updatedPlace.ratingCount).toBe(2);
    // (4+2)/2 = 3.0
    expect(updatedPlace.ratingAverage).toBe(3);
  });

  it('ratingCount giảm sau khi xóa review', async () => {
    const userId = new mongoose.Types.ObjectId().toString();
    const token = factory.generateToken({ id: userId });
    const place = await factory.createPlace();
    await completed(userId, place);

    const createRes = await request(app)
      .post(`/api/v1/places/${place._id}/reviews`)
      .set('Authorization', `Bearer ${token}`)
      .send({ point: 5 });
    expect(createRes.status).toBe(201);
    const reviewId = createRes.body.data.detailEvaluateId;

    await request(app)
      .delete(`/api/v1/places/${place._id}/reviews/${reviewId}`)
      .set('Authorization', `Bearer ${token}`);

    const TrekkingPlace = require('../../src/models/TrekkingPlace');
    const updatedPlace = await TrekkingPlace.findById(place._id);
    expect(updatedPlace.ratingCount).toBe(0);
    expect(updatedPlace.ratingAverage).toBe(0);
  });
});


describe('Review eligibility and limits', () => {
  it('requires completion at the same place by the same user', async () => {
    const place = await factory.createPlace();
    const userId = new mongoose.Types.ObjectId().toString();
    const token = factory.generateToken({ id: userId });
    const url = `/api/v1/places/${place._id}/reviews`;
    const route = await factory.createRoute(place._id);
    await factory.createJourney(userId, place._id, route._id, { status: 'ACTIVE' });
    await factory.createCompletedJourney('other-user', place._id, route._id);
    const other = await factory.createPlace({ slug: 'other-place' });
    await completed(userId, other);
    expect((await request(app).post(url).set('Authorization', `Bearer ${token}`).send({ point: 5 })).status).toBe(403);
    expect((await request(app).get(`${url}/eligibility`).set('Authorization', `Bearer ${token}`)).body.data.canCreate).toBe(false);
  });

  it('allows one creation and one atomic edit, and blocks recreation after admin removal', async () => {
    const place = await factory.createPlace();
    const userId = new mongoose.Types.ObjectId().toString();
    await completed(userId, place);
    const token = factory.generateToken({ id: userId });
    const url = `/api/v1/places/${place._id}/reviews`;
    const created = await Promise.all([1, 2].map(() => request(app).post(url).set('Authorization', `Bearer ${token}`).send({ point: 5 })));
    expect(created.map(r => r.status).sort()).toEqual([201, 409]);
    const id = created.find(r => r.status === 201).body.data.detailEvaluateId;
    const edits = await Promise.all([2, 3].map(point => request(app).put(`${url}/${id}`).set('Authorization', `Bearer ${token}`).send({ point })));
    expect(edits.map(r => r.status).sort()).toEqual([200, 409]);
    expect((await request(app).get(`${url}/eligibility`).set('Authorization', `Bearer ${token}`)).body.data.canEdit).toBe(false);
    const adminUrl = `/api/v1/admin/trekking/places/${place._id}/reviews`;
    expect((await request(app).delete(`${adminUrl}/${id}`).set('Authorization', `Bearer ${token}`)).status).toBe(403);
    const adminToken = factory.generateAdminToken();
    expect((await request(app).get(adminUrl).set('Authorization', `Bearer ${adminToken}`)).body.data.total).toBe(1);
    expect((await request(app).delete(`${adminUrl}/${id}`).set('Authorization', `Bearer ${adminToken}`)).status).toBe(204);
    expect((await request(app).get(url)).body.data.total).toBe(0);
    expect((await request(app).post(url).set('Authorization', `Bearer ${token}`).send({ point: 4 })).status).toBe(409);
    const updated = await require('../../src/models/TrekkingPlace').findById(place._id);
    expect(updated.ratingCount).toBe(0);
    expect(updated.ratingAverage).toBe(0);
  });
});
