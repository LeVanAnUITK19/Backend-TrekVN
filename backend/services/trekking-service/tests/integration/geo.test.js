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

// ═══════════════════════════════════════════════════════════════════════════════
// 21. GeoJSON invalid bị reject
// ═══════════════════════════════════════════════════════════════════════════════
describe('GeoJSON Validation', () => {
  const makeActiveJourney = async () => {
    const userId = new mongoose.Types.ObjectId().toString();
    const token = factory.generateToken({ id: userId });
    const place = await factory.createPlace();
    const route = await factory.createRoute(place._id);
    const journey = await factory.createJourney(userId, place._id, route._id, {
      status: 'ACTIVE', startedAt: new Date(),
    });
    return { userId, token, journey };
  };

  it('400 — longitude > 180 bị từ chối khi tạo marker', async () => {
    const { token, journey } = await makeActiveJourney();
    const res = await request(app)
      .post(`/api/v1/journeys/${journey._id}/markers`)
      .set('Authorization', `Bearer ${token}`)
      .send(factory.markerPayload({
        location: { type: 'Point', coordinates: [181, 12.05] },
      }));
    expect(res.status).toBe(400);
  });

  it('400 — latitude > 90 bị từ chối khi tạo marker', async () => {
    const { token, journey } = await makeActiveJourney();
    const res = await request(app)
      .post(`/api/v1/journeys/${journey._id}/markers`)
      .set('Authorization', `Bearer ${token}`)
      .send(factory.markerPayload({
        location: { type: 'Point', coordinates: [108.441, 91] },
      }));
    expect(res.status).toBe(400);
  });

  it('400 — longitude < -180 bị từ chối', async () => {
    const { token, journey } = await makeActiveJourney();
    const res = await request(app)
      .post(`/api/v1/journeys/${journey._id}/markers`)
      .set('Authorization', `Bearer ${token}`)
      .send(factory.markerPayload({
        location: { type: 'Point', coordinates: [-181, 12.05] },
      }));
    expect(res.status).toBe(400);
  });

  it('400 — type không phải Point bị từ chối', async () => {
    const { token, journey } = await makeActiveJourney();
    const res = await request(app)
      .post(`/api/v1/journeys/${journey._id}/markers`)
      .set('Authorization', `Bearer ${token}`)
      .send(factory.markerPayload({
        location: { type: 'Polygon', coordinates: [108.441, 12.05] },
      }));
    expect(res.status).toBe(400);
  });

  it('400 — GeoJSON thiếu coordinates bị từ chối', async () => {
    const { token, journey } = await makeActiveJourney();
    const res = await request(app)
      .post(`/api/v1/journeys/${journey._id}/markers`)
      .set('Authorization', `Bearer ${token}`)
      .send(factory.markerPayload({
        location: { type: 'Point' },
      }));
    expect(res.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 22. RabbitMQ publisher failure được handle/log (không crash request)
// ═══════════════════════════════════════════════════════════════════════════════
describe('RabbitMQ Publisher — failure handling', () => {
  it('journey complete thành công dù RABBITMQ_ENABLED=false', async () => {
    // RABBITMQ_ENABLED=false in test env — publisher chỉ log, không crash
    const userId = new mongoose.Types.ObjectId().toString();
    const token = factory.generateToken({ id: userId });
    const place = await factory.createPlace();
    const route = await factory.createRoute(place._id);
    const journey = await factory.createJourney(userId, place._id, route._id, {
      status: 'ACTIVE', startedAt: new Date(),
    });

    const res = await request(app)
      .post(`/api/v1/journeys/${journey._id}/complete`)
      .set('Authorization', `Bearer ${token}`)
      .send(factory.completePayload());

    // Thành công dù RabbitMQ disabled
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('COMPLETED');
  });

  it('journey start thành công dù RABBITMQ_ENABLED=false', async () => {
    const userId = new mongoose.Types.ObjectId().toString();
    const token = factory.generateToken({ id: userId });
    const place = await factory.createPlace();
    const route = await factory.createRoute(place._id);
    const journey = await factory.createJourney(userId, place._id, route._id, { status: 'PLANNED' });

    const res = await request(app)
      .post(`/api/v1/journeys/${journey._id}/start`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ACTIVE');
  });
});
