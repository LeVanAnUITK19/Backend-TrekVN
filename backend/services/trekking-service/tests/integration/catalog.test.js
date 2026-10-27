'use strict';
const request = require('supertest');
const db = require('../setup/db');
const factory = require('../helpers/factory');
const createApp = require('../../src/app');
let app;
beforeAll(async () => { await db.connect(); app = createApp(); });
afterEach(db.clearDatabase);
afterAll(db.disconnect);

test('place cards are bounded, sorted, region filtered and omit heavy metadata', async () => {
  for (let i = 0; i < 23; i++) {
    await factory.createPlace({ slug: `p-${i}`, mien: 'mien-bac', ratingCount: i,
      images: ['first.jpg', 'second.jpg'], description: 'Not a card field' });
  }
  await factory.createPlace({ slug: 'south', mien: 'mien-nam', ratingCount: 100 });
  const url = '/api/v1/places?summary=true&region=NORTH&sort=popular&limit=20';
  const first = (await request(app).get(`${url}&page=1`).expect(200)).body.data;
  expect(first).toMatchObject({ total: 23, page: 1, limit: 20, hasMore: true });
  expect(first.items).toHaveLength(20);
  expect(first.items[0].ratingCount).toBe(22);
  expect(first.items[0].trekkingPlaceId).toBeDefined();
  expect(first.items[0].images).toEqual(['first.jpg']);
  for (const field of ['location', 'description', 'offlineMap', 'routes']) {
    expect(first.items[0][field]).toBeUndefined();
  }
  const second = (await request(app).get(`${url}&page=2`).expect(200)).body.data;
  expect(second.items).toHaveLength(3);
  expect(second.hasMore).toBe(false);
  expect(first.items.map((p) => p.trekkingPlaceId).filter((id) => second.items.some((p) => p.trekkingPlaceId === id))).toEqual([]);
});

test('route pages apply region and search before pagination and exclude inactive parents', async () => {
  const north = await factory.createPlace({ slug: 'north', name: 'Fansipan', mien: 'mien-bac', ratingCount: 50 });
  const south = await factory.createPlace({ slug: 'south', mien: 'mien-nam' });
  const hidden = await factory.createPlace({ slug: 'hidden', mien: 'mien-bac', status: 'INACTIVE' });
  for (let i = 0; i < 12; i++) {
    await factory.createRoute(north._id, { name: `Trail ${i}`, path: { type: 'LineString', coordinates: [[108, 12], [108.1, 12.1]] } });
  }
  await factory.createRoute(south._id);
  await factory.createRoute(hidden._id);
  await factory.createRoute(north._id, { status: 'INACTIVE' });
  const url = '/api/v1/routes?region=NORTH&q=Fansipan&sort=popular&limit=10';
  const first = (await request(app).get(url).expect(200)).body.data;
  expect(first).toMatchObject({ total: 12, page: 1, hasMore: true });
  expect(first.items).toHaveLength(10);
  expect(first.items[0].trekkingRouteId).toBeDefined();
  expect(first.items[0].placeName).toBe('Fansipan');
  expect(first.items[0].path).toBeUndefined();
  expect(first.items[0].offlineMap).toBeUndefined();
  const second = (await request(app).get(`${url}&page=2`).expect(200)).body.data;
  expect(second.items).toHaveLength(2);
  expect(second.hasMore).toBe(false);
});

test('invalid page and filter input fail without querying MongoDB', async () => {
  for (const path of ['/places?summary=true&page=-1', '/routes?limit=0', '/routes?region=invalid', '/places?summary=true&q[$ne]=x']) {
    await request(app).get(`/api/v1${path}`).expect(400);
  }
});

test('place and route writes invalidate the catalog namespace', async () => {
  const cache = require('../../src/services/catalogCache').getCatalogCache();
  const invalidation = jest.spyOn(cache, 'invalidate');
  try {
    const place = await factory.createPlace({ slug: 'invalidation' });
    const route = await factory.createRoute(place._id);
    await require('../../src/models/TrekkingPlace').findByIdAndUpdate(place._id, { ratingCount: 10 });
    await require('../../src/models/TrekkingRoute').findByIdAndUpdate(route._id, { status: 'INACTIVE' });
    expect(invalidation).toHaveBeenCalledTimes(4);
  } finally { invalidation.mockRestore(); }
});
