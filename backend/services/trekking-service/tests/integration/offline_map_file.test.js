'use strict';

process.env.MAP_R2_PUBLIC_BASE_URL = 'https://maps.example';
jest.mock('axios', () => ({ get: jest.fn() }));
const axios = require('axios');
const { Readable } = require('node:stream');
const request = require('supertest');
const db = require('../setup/db');
const createApp = require('../../src/app');
const factory = require('../helpers/factory');

let app;
beforeAll(async () => { await db.connect(); app = createApp(); });
afterEach(async () => { jest.resetAllMocks(); await db.clearDatabase(); });
afterAll(async () => { await db.disconnect(); });

test('authenticated admin receives the exact published place ZIP even without upstream CORS', async () => {
  const place = await factory.createPlace({ status: 'INACTIVE', offlineMap: {
    available: true, version: 3, objectKey: 'maps/ba-den/v3/map.zip', checksum: 'abc',
  } });
  const bytes = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 1, 2, 3]);
  axios.get.mockResolvedValueOnce({ data: Readable.from([bytes]), headers: { 'content-type': 'application/zip' } });
  const response = await request(app)
    .get(`/api/v1/admin/trekking/places/${place._id}/offline-map/file?url=https://untrusted.example`)
    .set('Authorization', `Bearer ${factory.generateAdminToken()}`)
    .buffer(true).parse((res, callback) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => callback(null, Buffer.concat(chunks)));
    });
  expect(response.status).toBe(200);
  expect(response.headers['content-type']).toContain('application/zip');
  expect(response.body).toEqual(bytes);
  expect(axios.get).toHaveBeenCalledWith('https://maps.example/maps/ba-den/v3/map.zip', expect.objectContaining({ responseType: 'stream' }));
});

test('missing map reports 404 without downloading another source', async () => {
  const place = await factory.createPlace();
  const response = await request(app).get(`/api/v1/admin/trekking/places/${place._id}/offline-map/file`)
    .set('Authorization', `Bearer ${factory.generateAdminToken()}`);
  expect(response.status).toBe(404);
  expect(axios.get).not.toHaveBeenCalled();
});

test('storage errors are returned before sending ZIP headers', async () => {
  const place = await factory.createPlace({ offlineMap: { available: true, objectKey: 'missing.zip' } });
  axios.get.mockRejectedValueOnce({ response: { status: 404 } });
  const response = await request(app).get(`/api/v1/admin/trekking/places/${place._id}/offline-map/file`)
    .set('Authorization', `Bearer ${factory.generateAdminToken()}`);
  expect(response.status).toBe(404);
  expect(response.body.error.code).toBe('OFFLINE_MAP_DOWNLOAD_FAILED');
});

test.each([['anonymous', null, 401], ['normal user', () => factory.generateToken(), 403]])(
  '%s cannot use the admin ZIP proxy', async (_name, tokenFactory, status) => {
    const place = await factory.createPlace();
    const req = request(app).get(`/api/v1/admin/trekking/places/${place._id}/offline-map/file`);
    if (tokenFactory) {req.set('Authorization', `Bearer ${tokenFactory()}`);}
    expect((await req).status).toBe(status);
    expect(axios.get).not.toHaveBeenCalled();
  },
);
