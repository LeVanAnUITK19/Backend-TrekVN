'use strict';

const request = require('supertest');
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

// ═══════════════════════════════════════════════════════════════════════════════
// 20. Offline package trả version/checksum/downloadUrl
// ═══════════════════════════════════════════════════════════════════════════════
describe('GET /api/v1/routes/:routeId/offline-package', () => {
  it('200 — trả về place + route + milestones + mapManifest', async () => {
    const place = await factory.createPlace({
      offlineMap: {
        available: true, version: 3, sizeBytes: 48000000,
        objectKey: 'maps/place/v3/offline.zip', checksum: 'abc123def456', minZoom: 10, maxZoom: 16,
      },
    });
    const TrekkingRoute = require('../../src/models/TrekkingRoute');
    const route = await TrekkingRoute.create({
      trekkingPlaceId: place._id,
      name: 'Test Route',
      status: 'ACTIVE',
      imageUrl: 'https://cdn.example.com/route.jpg',
      path: { type: 'LineString', coordinates: [[106.165, 11.387], [106.17, 11.39]] },
    });
    await factory.createMilestone(route._id, { sequence: 1 });
    await factory.createMilestone(route._id, { type: 'FINISH', sequence: 2 });

    const res = await request(app).get(`/api/v1/routes/${route._id}/offline-package`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.place).toBeTruthy();
    expect(res.body.data.route).toBeTruthy();
    expect(res.body.data.milestones).toHaveLength(2);
    expect(res.body.data.mapManifest.available).toBe(true);
    expect(res.body.data.mapManifest.version).toBe(3);
    expect(res.body.data.mapManifest.checksum).toBe('abc123def456');
    expect(res.body.data.mapManifest.scope).toBe('PLACE');
    expect(res.body.data.mapManifest.entityId).toBe(String(place._id));
    expect(res.body.data.route.imageUrl).toBe('https://cdn.example.com/route.jpg');
    expect(res.body.data.route.path.coordinates).toEqual([[106.165, 11.387], [106.17, 11.39]]);
    // downloadUrl is null in test env (R2_PUBLIC_BASE_URL not set) — verify field exists
    expect(res.body.data.mapManifest).toHaveProperty('downloadUrl');
  });

  it('200 — check version package mới hơn trả hasUpdate=true', async () => {
    const place = await factory.createPlace({ offlineMap: { available: true, version: 5 } });
    const TrekkingRoute = require('../../src/models/TrekkingRoute');
    const route = await TrekkingRoute.create({
      trekkingPlaceId: place._id,
      name: 'Route Check Version',
      status: 'ACTIVE',
    });

    const res = await request(app).get(`/api/v1/routes/${route._id}/offline-package/check?version=3`);
    expect(res.status).toBe(200);
    expect(res.body.data.hasUpdate).toBe(true);
    expect(res.body.data.serverVersion).toBe(5);
  });

  it('200 — check version không có update trả hasUpdate=false', async () => {
    const place = await factory.createPlace({ offlineMap: { available: true, version: 2 } });
    const TrekkingRoute = require('../../src/models/TrekkingRoute');
    const route = await TrekkingRoute.create({
      trekkingPlaceId: place._id,
      name: 'Route Up To Date',
      status: 'ACTIVE',
    });

    const res = await request(app).get(`/api/v1/routes/${route._id}/offline-package/check?version=2`);
    expect(res.status).toBe(200);
    expect(res.body.data.hasUpdate).toBe(false);
  });

  it('two routes share the current place ZIP and keep independent paths and photos', async () => {
    const place = await factory.createPlace({ offlineMap: { available: true, version: 7, objectKey: 'maps/place/v7/map.zip', checksum: 'shared' } });
    const a = await factory.createRoute(place._id, { imageUrl: 'https://cdn.example/a.jpg', path: { type: 'LineString', coordinates: [[106.16, 11.38], [106.17, 11.39]] } });
    const b = await factory.createRoute(place._id, { imageUrl: 'https://cdn.example/b.jpg', path: { type: 'LineString', coordinates: [[106.18, 11.37], [106.19, 11.39]] }, offlineMap: { available: true, version: 1, objectKey: 'legacy/route.zip' } });
    const first = await request(app).get(`/api/v1/routes/${a._id}/offline-package`);
    const second = await request(app).get(`/api/v1/routes/${b._id}/offline-package`);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.body.data.mapManifest).toEqual(second.body.data.mapManifest);
    expect(second.body.data.mapManifest).toMatchObject({ scope: 'PLACE', entityId: String(place._id), version: 7 });
    expect(first.body.data.route.path).not.toEqual(second.body.data.route.path);
    expect(second.body.data.route.imageUrl).toBe('https://cdn.example/b.jpg');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 23. Public endpoint không trả INACTIVE place/route
// ═══════════════════════════════════════════════════════════════════════════════
describe('Public endpoints — INACTIVE filtering', () => {
  it('404 — GET /places/:id không trả INACTIVE place', async () => {
    const place = await factory.createPlace({ status: 'INACTIVE' });
    const res = await request(app).get(`/api/v1/places/${place._id}`);
    expect(res.status).toBe(404);
  });

  it('404 — GET /routes/:id không trả INACTIVE route', async () => {
    const place = await factory.createPlace();
    const route = await factory.createRoute(place._id, { status: 'INACTIVE' });
    const res = await request(app).get(`/api/v1/routes/${route._id}`);
    expect(res.status).toBe(404);
  });

  it('GET /places — danh sách không bao gồm INACTIVE place', async () => {
    await factory.createPlace({ status: 'ACTIVE', name: 'Place Active' });
    await factory.createPlace({ status: 'INACTIVE', name: 'Place Inactive' });

    const res = await request(app).get('/api/v1/places');
    expect(res.status).toBe(200);
    const names = res.body.data.items.map((p) => p.name);
    expect(names).toContain('Place Active');
    expect(names).not.toContain('Place Inactive');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Place Offline Package — scope=PLACE (DB v3.1 offlineMap on TrekkingPlace)
// ═══════════════════════════════════════════════════════════════════════════════
describe('GET /api/v1/places/:placeId/offline-package', () => {
  it('200 — trả về place + routes + mapManifest khi available=true', async () => {
    const TrekkingPlace = require('../../src/models/TrekkingPlace');
    const TrekkingRoute = require('../../src/models/TrekkingRoute');

    const place = await TrekkingPlace.create({
      name: 'Núi Bà Đen',
      provinceId: 'province_tayninh',
      location: { type: 'Point', coordinates: [106.165, 11.387] },
      status: 'ACTIVE',
      offlineMap: {
        available: true,
        version: 1,
        objectKey: 'maps/nui-ba-den/v1/ba-den-v1.zip',
        sizeBytes: 19300000,
        checksum: 'sha256abc',
        minZoom: 10,
        maxZoom: 14,
      },
    });
    await TrekkingRoute.create({
      trekkingPlaceId: place._id,
      name: 'Cung Đường Chính',
      status: 'ACTIVE',
    });

    const res = await request(app).get(`/api/v1/places/${place._id}/offline-package`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.place.name).toBe('Núi Bà Đen');
    expect(res.body.data.routes).toHaveLength(1);
    expect(res.body.data.mapManifest.scope).toBe('PLACE');
    expect(res.body.data.mapManifest.available).toBe(true);
    expect(res.body.data.mapManifest.version).toBe(1);
    expect(res.body.data.mapManifest.checksum).toBe('sha256abc');
    // downloadUrl built at runtime (null if R2_PUBLIC_BASE_URL not set in test)
    // Just verify the field exists
    expect(res.body.data.mapManifest).toHaveProperty('downloadUrl');
  });

  it('200 — available=false → mapManifest.available=false, downloadUrl=null', async () => {
    const place = await factory.createPlace({
      offlineMap: { available: false, version: 0 },
    });

    const res = await request(app).get(`/api/v1/places/${place._id}/offline-package`);

    expect(res.status).toBe(200);
    expect(res.body.data.mapManifest.available).toBe(false);
    expect(res.body.data.mapManifest.downloadUrl).toBeNull();
  });

  it('404 — place không tồn tại', async () => {
    const res = await request(app).get('/api/v1/places/64f1a2b3c4d5e6f7a8b9c0d1/offline-package');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/v1/places/:placeId/offline-package/check', () => {
  it('UP_TO_DATE khi client version >= server version', async () => {
    const place = await factory.createPlace({
      offlineMap: { available: true, version: 2 },
    });

    const res = await request(app).get(
      `/api/v1/places/${place._id}/offline-package/check?version=2`
    );

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('UP_TO_DATE');
    expect(res.body.data.serverVersion).toBe(2);
    expect(res.body.data.available).toBe(true);
  });

  it('OUTDATED khi server version > client version', async () => {
    const place = await factory.createPlace({
      offlineMap: { available: true, version: 5 },
    });

    const res = await request(app).get(
      `/api/v1/places/${place._id}/offline-package/check?version=3`
    );

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('OUTDATED');
    expect(res.body.data.serverVersion).toBe(5);
  });

  it('NOT_AVAILABLE khi available=false', async () => {
    const place = await factory.createPlace({
      offlineMap: { available: false, version: 0 },
    });

    const res = await request(app).get(
      `/api/v1/places/${place._id}/offline-package/check?version=0`
    );

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('NOT_AVAILABLE');
  });
});
