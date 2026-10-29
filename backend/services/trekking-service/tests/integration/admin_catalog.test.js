'use strict';
const request = require('supertest');
const db = require('../setup/db');
const factory = require('../helpers/factory');
const createApp = require('../../src/app');
const Review = require('../../src/models/DetailEvaluate');
const Place = require('../../src/models/TrekkingPlace');
let app;
const auth = () => `Bearer ${factory.generateAdminToken()}`;
beforeAll(async () => { await db.connect(); app = createApp(); });
afterEach(async () => { await db.clearDatabase(); });
afterAll(async () => { await db.disconnect(); });

test('map filters include disabled and unconfigured places; partial updates preserve file and metadata', async () => {
  const a = await factory.createPlace({ slug: 'map-a', offlineMap: { available: true, version: 3, objectKey: 'maps/a.zip', sizeBytes: 512, checksum: 'abc' } });
  await factory.createPlace({ slug: 'map-b' });
  const url = '/api/v1/admin/trekking/places-offline-maps';
  const available = await request(app).get(url).set('Authorization', auth());
  expect(available.body.data.total).toBe(1);
  const all = await request(app).get(`${url}?available=all&limit=1`).set('Authorization', auth());
  expect(all.body.data.total).toBe(2); expect(all.body.data.totalPages).toBe(2);
  const updated = await request(app).put(`/api/v1/admin/trekking/places/${a.id}/offline-map`).set('Authorization', auth()).send({ available: false, version: 3 });
  expect(updated.status).toBe(200);
  const stored = await Place.findById(a.id);
  expect(stored.offlineMap.objectKey).toBe('maps/a.zip'); expect(stored.offlineMap.sizeBytes).toBe(512);
  expect((await request(app).get(`${url}?available=false`).set('Authorization', auth())).body.data.total).toBe(2);
  const enabled = await request(app).put(`/api/v1/admin/trekking/places/${a.id}/offline-map`).set('Authorization', auth()).send({ available: true, version: 3 });
  expect(enabled.status).toBe(200);
});

test('map validation rejects enabling without file, reversed bounds and zoom ranges', async () => {
  const place = await factory.createPlace();
  const url = `/api/v1/admin/trekking/places/${place.id}/offline-map`;
  for (const body of [{ available: true, version: 1 }, { available: false, version: 1, minZoom: 14, maxZoom: 10 }, { available: false, version: 1, bounds: { minLat: 11, maxLat: 10, minLon: 100, maxLon: 101 } }]) {
    expect((await request(app).put(url).set('Authorization', auth()).send(body)).status).toBe(400);
  }
});

test('global reviews filter by place, stars, status and literal search; removal recalculates rating', async () => {
  const a = await factory.createPlace({ name: 'Núi (A)', slug: 'a' });
  const b = await factory.createPlace({ name: 'Núi B', slug: 'b' });
  const first = await Review.create({ trekkingPlaceId: a.id, userId: 'one', point: 5, content: 'Đẹp' });
  await Review.create({ trekkingPlaceId: a.id, userId: 'two', point: 1, content: 'Trơn' });
  await Review.create({ trekkingPlaceId: b.id, userId: 'three', point: 4, content: 'Tốt' });
  const url = '/api/v1/admin/trekking/reviews';
  const list = await request(app).get(`${url}?search=(A)&point=5`).set('Authorization', auth());
  expect(list.status).toBe(200); expect(list.body.data.total).toBe(1);
  expect(list.body.data.items[0].placeName).toBe('Núi (A)');
  expect(list.body.data.items[0].trekkingPlaceId).toBe(a.id);
  expect((await request(app).get(`${url}?placeId=${a.id}&limit=1`).set('Authorization', auth())).body.data.totalPages).toBe(2);
  expect((await request(app).delete(`/api/v1/admin/trekking/places/${a.id}/reviews/${first.id}`).set('Authorization', auth())).status).toBe(204);
  const place = await Place.findById(a.id); expect(place.ratingAverage).toBe(1); expect(place.ratingCount).toBe(1);
  const removed = await request(app).get(`${url}?status=DELETED`).set('Authorization', auth());
  expect(removed.body.data.total).toBe(1); expect(removed.body.data.items[0].removedBy).toBeTruthy();
});

test('catalog administration denies normal users and validates filters', async () => {
  for (const url of ['/api/v1/admin/trekking/reviews', '/api/v1/admin/trekking/places-offline-maps']) {
    expect((await request(app).get(url)).status).toBe(401);
    expect((await request(app).get(url).set('Authorization', `Bearer ${factory.generateToken()}`)).status).toBe(403);
  }
  for (const query of ['point=6', 'placeId=bad', 'status=bad', 'search[x]=value']) {
    expect((await request(app).get(`/api/v1/admin/trekking/reviews?${query}`).set('Authorization', auth())).status).toBe(400);
  }
});
