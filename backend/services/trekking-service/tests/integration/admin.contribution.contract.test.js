const request = require('supertest');
const mongoose = require('mongoose');
const db = require('../setup/db');
const factory = require('../helpers/factory');
const createApp = require('../../src/app');
const Marker = require('../../src/models/JourneyMarker');
const RouteSubmission = require('../../src/models/RouteSubmission');
const PlaceSuggestion = require('../../src/models/PlaceSuggestion');
const snapshots = require('../../src/repositories/routeSubmissionMarker.repository');
let app, userId, token, admin, journey, place;
beforeAll(async () => { await db.connect(); app = createApp(); await RouteSubmission.init(); });
afterAll(async () => { await db.disconnect(); });
beforeEach(async () => {
  userId = String(new mongoose.Types.ObjectId()); token = factory.generateToken({ id: userId });
  admin = factory.generateToken({ role: 'ADMIN' });
  place = await factory.createPlace(); const route = await factory.createRoute(place._id);
  journey = await factory.createCompletedJourney(userId, place._id, route._id);
});
afterEach(async () => { jest.restoreAllMocks(); await db.clearDatabase(); });
const marker = (owner = userId) => Marker.create({ userId: owner, journeyId: journey._id,
  name: 'Nguồn nước', type: 'WATER_POINT', markedAt: new Date(), location: { type: 'Point', coordinates: [108, 12] } });
const submit = (markerIds = []) => request(app).post('/api/v1/contributions/routes').set('Authorization', `Bearer ${token}`)
  .send({ sourceJourneyId: String(journey._id), proposedName: 'Cung đường thử', markerIds, clientOperationId: 'operation' });

test('submitted route appears in admin list, detail and marker review data with the real API contract', async () => {
  const original = await marker(); const response = await submit([String(original._id)]);
  expect(response.status).toBe(201);
  const id = response.body.data.routeSubmissionId;
  const list = await request(app).get('/api/v1/admin/contributions').set('Authorization', `Bearer ${admin}`);
  expect(list.body.data).toMatchObject({ total: 1, totalPages: 1, data: [{ id, type: 'ROUTE_SUBMISSION', status: 'PENDING_REVIEW' }] });
  expect(list.body.data.data[0].routeSubmission.suggestedName).toBe('Cung đường thử');
  expect(list.body.data.data[0].routeSubmission.markerCount).toBe(1);
  const detail = await request(app).get(`/api/v1/admin/contributions/${id}`).set('Authorization', `Bearer ${admin}`);
  expect(detail.body.data.id).toBe(id);
  expect(detail.body.data.contributor.id).toBe(userId);
  const points = await request(app).get(`/api/v1/admin/contributions/${id}/markers`).set('Authorization', `Bearer ${admin}`);
  expect(points.body.data[0]).toMatchObject({ name: 'Nguồn nước', sourceJourneyMarkerId: String(original._id) });
});

test('active journey can explicitly send marker-only contributions without creating a new route', async () => {
  journey.status = 'ACTIVE'; await journey.save();
  const original = await marker();
  const response = await request(app).post('/api/v1/contributions/routes').set('Authorization', `Bearer ${token}`)
    .send({ sourceJourneyId: String(journey._id), proposedName: 'Cột mốc mới', contributionKind: 'MARKERS', markerIds: [String(original._id)] });
  expect(response.status).toBe(201);
  const id = response.body.data.routeSubmissionId;
  const detail = await request(app).get(`/api/v1/admin/contributions/${id}`).set('Authorization', `Bearer ${admin}`);
  expect(detail.body.data.routeSubmission).toMatchObject({ contributionKind: 'MARKERS', markerCount: 1 });
  const approved = await request(app).patch(`/api/v1/admin/contributions/${id}/review`).set('Authorization', `Bearer ${admin}`).send({ decision: 'APPROVED' });
  expect(approved.status).toBe(200);
  expect(String((await RouteSubmission.findById(id)).resultingRouteId)).toBe(String(journey.trekkingRouteId));
  expect(await require('../../src/models/TrekkingRoute').countDocuments()).toBe(1);
  expect((await submit([String(original._id)])).status).toBe(422);
  const filtered = await request(app).get('/api/v1/admin/contributions').query({ contributionKind: 'MARKERS' }).set('Authorization', `Bearer ${admin}`);
  expect(filtered.body.data.total).toBe(1);
});

test('mixed types paginate together and search applies to the actual proposed name', async () => {
  await submit();
  await PlaceSuggestion.create({ userId, provinceId: 'lam_dong', proposedName: 'Địa điểm mới', description: 'Test', location: { type: 'Point', coordinates: [108, 12] } });
  const list = await request(app).get('/api/v1/admin/contributions?limit=1').set('Authorization', `Bearer ${admin}`);
  expect(list.body.data.total).toBe(2); expect(list.body.data.data).toHaveLength(1); expect(list.body.data.totalPages).toBe(2);
  const filtered = await request(app).get('/api/v1/admin/contributions').query({ search: 'Cung đường', type: 'ROUTE_SUBMISSION' }).set('Authorization', `Bearer ${admin}`);
  expect(filtered.body.data.total).toBe(1);
  const literal = await request(app).get('/api/v1/admin/contributions').query({ search: '[' }).set('Authorization', `Bearer ${admin}`);
  expect(literal.status).toBe(200);
  expect(literal.body.data.total).toBe(0);
});

test('cannot include another user marker or leak another user contribution by operation ID', async () => {
  const foreign = await marker('other-user');
  expect((await submit([String(foreign._id)])).status).toBe(403);
  expect(await RouteSubmission.countDocuments()).toBe(0);
  await submit();
  token = factory.generateToken({ id: String(new mongoose.Types.ObjectId()) });
  expect((await submit()).status).toBe(403);
});

test('snapshot write failure leaves no incomplete submission and retry restores all selected markers', async () => {
  const original = await marker();
  jest.spyOn(snapshots, 'createMany').mockRejectedValueOnce(new Error('temporary write failure'));
  expect((await submit([String(original._id)])).status).toBe(500);
  expect(await RouteSubmission.countDocuments()).toBe(0);
  expect((await submit([String(original._id)])).status).toBe(201);
  expect(await require('../../src/models/RouteSubmissionMarker').countDocuments()).toBe(1);
});
