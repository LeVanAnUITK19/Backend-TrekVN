'use strict';

const request = require('supertest');
const mongoose = require('mongoose');
const db = require('../setup/db');
const createApp = require('../../src/app');
const factory = require('../helpers/factory');

let app;

describe('Sharing a completed GPS route with admin', () => {
  it('uses the saved journey track and statistics when omitted and exposes them to admin', async () => {
    const userId = new mongoose.Types.ObjectId().toString();
    const token = factory.generateToken({ id: userId });
    const place = await factory.createPlace();
    const route = await factory.createRoute(place._id);
    const polyline = '_p~iF~ps|U_ulLnnqC_mqNvxq`@';
    const journey = await factory.createCompletedJourney(userId, place._id, route._id);
    journey.track = { encodedPolyline: polyline };
    journey.statistics = { distanceMeters: 1500, durationSeconds: 1800, elevationGain: 100 };
    await journey.save();
    const body = { sourceJourneyId: String(journey._id), proposedName: 'GPS route', clientOperationId: 'share-saved-gps' };
    const submitted = await request(app).post('/api/v1/contributions/routes')
      .set('Authorization', `Bearer ${token}`).send(body);
    expect(submitted.status).toBe(201);
    expect(submitted.body.data.encodedPolyline).toBe(polyline);
    expect(submitted.body.data.statistics.distanceMeters).toBe(1500);
    const id = submitted.body.data.routeSubmissionId;
    const repeated = await request(app).post('/api/v1/contributions/routes')
      .set('Authorization', `Bearer ${token}`).send(body);
    expect(repeated.body.data.routeSubmissionId).toBe(id);
    const admin = await request(app).get(`/api/v1/admin/contributions/${id}`)
      .set('Authorization', `Bearer ${factory.generateAdminToken()}`);
    expect(admin.status).toBe(200);
    expect(admin.body.data.routeSubmission).toMatchObject({
      encodedPolyline: polyline, trekkingPlaceId: String(place._id),
      sourceJourneyId: String(journey._id), distance: 1.5,
    });
  });
});

beforeAll(async () => {
  await db.connect();
  app = createApp();
});
afterEach(async () => { await db.clearDatabase(); });
afterAll(async () => { await db.disconnect(); });

const makeCompletedJourneyUser = async () => {
  const userId = new mongoose.Types.ObjectId().toString();
  const token = factory.generateToken({ id: userId });
  const place = await factory.createPlace();
  const route = await factory.createRoute(place._id);
  const journey = await factory.createCompletedJourney(userId, place._id, route._id);
  return { userId, token, place, route, journey };
};

// ═══════════════════════════════════════════════════════════════════════════════
// 12. Route submission từ Journey chưa COMPLETED bị reject
// ═══════════════════════════════════════════════════════════════════════════════
describe('Route Submission — Journey state validation', () => {
  it('422 — không thể submit route từ journey PLANNED', async () => {
    const userId = new mongoose.Types.ObjectId().toString();
    const token = factory.generateToken({ id: userId });
    const place = await factory.createPlace();
    const route = await factory.createRoute(place._id);
    const journey = await factory.createJourney(userId, place._id, route._id, { status: 'PLANNED' });

    const res = await request(app)
      .post('/api/v1/contributions/routes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        sourceJourneyId: String(journey._id),
        proposedName: 'Route mới',
        encodedPolyline: 'test_poly',
      });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('CONTRIBUTION_INVALID_STATE');
  });

  it('422 — không thể submit route từ journey ACTIVE', async () => {
    const userId = new mongoose.Types.ObjectId().toString();
    const token = factory.generateToken({ id: userId });
    const place = await factory.createPlace();
    const route = await factory.createRoute(place._id);
    const journey = await factory.createJourney(userId, place._id, route._id, { status: 'ACTIVE', startedAt: new Date() });

    const res = await request(app)
      .post('/api/v1/contributions/routes')
      .set('Authorization', `Bearer ${token}`)
      .send({ sourceJourneyId: String(journey._id) });
    expect(res.status).toBe(422);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 13. Route submission snapshot marker đúng
// ═══════════════════════════════════════════════════════════════════════════════
describe('Route Submission — Marker snapshot', () => {
  it('201 — submission tạo snapshot của markers đã chọn', async () => {
    const { userId, token, journey } = await makeCompletedJourneyUser();

    // Tạo active journey để tạo marker — dùng cùng place/route của completed journey
    const place = await factory.createPlace();
    const route = await factory.createRoute(place._id);
    // Tạo với clientJourneyId unique để tránh dup key với null
    const activeJourney = await factory.createJourney(userId, place._id, route._id, {
      status: 'ACTIVE',
      startedAt: new Date(),
      clientJourneyId: `active_${userId}_${Date.now()}`,
    });
    const marker = await factory.createMarker(activeJourney._id, userId);

    const res = await request(app)
      .post('/api/v1/contributions/routes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        sourceJourneyId: String(journey._id),
        proposedName: 'Route với marker',
        encodedPolyline: 'test_polyline',
        markerIds: [String(marker._id)],
      });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('PENDING_REVIEW');

    // Kiểm tra snapshot markers
    const RouteSubmissionMarker = require('../../src/models/RouteSubmissionMarker');
    const snapshots = await RouteSubmissionMarker.find({ routeSubmissionId: res.body.data.routeSubmissionId });
    expect(snapshots.length).toBe(1);
    expect(snapshots[0].name).toBe(marker.name);
    expect(String(snapshots[0].sourceJourneyMarkerId)).toBe(String(marker._id));
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 14. Duplicate clientOperationId không tạo contribution mới
// ═══════════════════════════════════════════════════════════════════════════════
describe('Contribution Idempotency (clientOperationId)', () => {
  it('duplicate clientOperationId trả về contribution đã tạo', async () => {
    const { token, journey } = await makeCompletedJourneyUser();
    const clientOperationId = `op_${Date.now()}`;

    const res1 = await request(app)
      .post('/api/v1/contributions/routes')
      .set('Authorization', `Bearer ${token}`)
      .send({ sourceJourneyId: String(journey._id), clientOperationId });
    expect(res1.status).toBe(201);

    const res2 = await request(app)
      .post('/api/v1/contributions/routes')
      .set('Authorization', `Bearer ${token}`)
      .send({ sourceJourneyId: String(journey._id), clientOperationId });
    expect(res2.status).toBe(201);
    expect(res2.body.data.routeSubmissionId).toBe(res1.body.data.routeSubmissionId);

    // DB chỉ có 1 submission
    const RouteSubmission = require('../../src/models/RouteSubmission');
    const count = await RouteSubmission.countDocuments({ clientOperationId });
    expect(count).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 15. Admin review authorization
// ═══════════════════════════════════════════════════════════════════════════════
describe('Admin Review Authorization', () => {
  it('403 — USER không thể review contribution', async () => {
    const { token, journey } = await makeCompletedJourneyUser();
    const subRes = await request(app)
      .post('/api/v1/contributions/routes')
      .set('Authorization', `Bearer ${token}`)
      .send({ sourceJourneyId: String(journey._id) });
    expect(subRes.status).toBe(201);
    const subId = subRes.body.data.routeSubmissionId;

    const res = await request(app)
      .patch(`/api/v1/admin/contributions/${subId}/review`)
      .set('Authorization', `Bearer ${token}`)
      .send({ decision: 'APPROVED' });
    expect(res.status).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 16. Concurrent contribution review → 409
// ═══════════════════════════════════════════════════════════════════════════════
describe('Concurrent contribution review', () => {
  it('second admin review sau khi đã APPROVED nhận 409', async () => {
    const adminId = new mongoose.Types.ObjectId().toString();
    const adminToken = factory.generateAdminToken({ id: adminId });
    const { token, journey } = await makeCompletedJourneyUser();

    const subRes = await request(app)
      .post('/api/v1/contributions/routes')
      .set('Authorization', `Bearer ${token}`)
      .send({ sourceJourneyId: String(journey._id) });
    expect(subRes.status).toBe(201);
    const subId = subRes.body.data.routeSubmissionId;

    // First review
    const res1 = await request(app)
      .patch(`/api/v1/admin/contributions/${subId}/review`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ decision: 'REJECTED', adminNote: 'Không đạt' });
    expect(res1.status).toBe(200);

    // Second review on already-REJECTED → 409
    const res2 = await request(app)
      .patch(`/api/v1/admin/contributions/${subId}/review`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ decision: 'APPROVED' });
    expect(res2.status).toBe(409);
    expect(res2.body.error.code).toBe('CONTRIBUTION_ALREADY_REVIEWED');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 17. Approve marker tạo Official Milestone
// ═══════════════════════════════════════════════════════════════════════════════
describe.each([
  { method: 'patch', reviewBody: { decision: 'APPROVED', createOfficialMilestone: true } },
  { method: 'post', reviewBody: { action: 'APPROVE' } },
])('Admin approve marker ($method) → Official Milestone', ({ method, reviewBody }) => {
  it('approved marker với createOfficialMilestone=true tạo Milestone', async () => {
    const adminId = new mongoose.Types.ObjectId().toString();
    const adminToken = factory.generateAdminToken({ id: adminId });
    const { userId, token, journey } = await makeCompletedJourneyUser();

    // Tạo route cho resulting
    const place2 = await factory.createPlace();
    const resultingRoute = await factory.createRoute(place2._id);

    // Tạo marker trên 1 active journey với clientJourneyId unique
    const activePlace = await factory.createPlace();
    const activeRoute = await factory.createRoute(activePlace._id);
    const activeJourney = await factory.createJourney(userId, activePlace._id, activeRoute._id, {
      status: 'ACTIVE',
      startedAt: new Date(),
      clientJourneyId: `admin_test_active_${userId}_${Date.now()}`,
    });
    const marker = await factory.createMarker(activeJourney._id, userId);

    // Submit route contribution
    const subRes = await request(app)
      .post('/api/v1/contributions/routes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        sourceJourneyId: String(journey._id),
        markerIds: [String(marker._id)],
      });
    expect(subRes.status).toBe(201);
    const subId = subRes.body.data.routeSubmissionId;

    // Admin approve submission với resultingRouteId
    await request(app)
      .patch(`/api/v1/admin/contributions/${subId}/review`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ decision: 'APPROVED', resultingRouteId: String(resultingRoute._id) });

    // Lấy submission marker
    const RouteSubmissionMarker = require('../../src/models/RouteSubmissionMarker');
    const snapshots = await RouteSubmissionMarker.find({ routeSubmissionId: subId });
    expect(snapshots.length).toBeGreaterThan(0);
    const snapshotMarkerId = String(snapshots[0]._id);

    // Admin approve marker với createOfficialMilestone=true
    const markerReviewRes = await request(app)[method](`/api/v1/admin/contributions/${subId}/markers/${snapshotMarkerId}/review`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(reviewBody);

    expect(markerReviewRes.status).toBe(200);
    expect(markerReviewRes.body.data.reviewStatus).toBe('APPROVED');
    expect(markerReviewRes.body.data.resultingMilestoneId).toBeTruthy();

    // Verify Milestone được tạo
    const Milestone = require('../../src/models/Milestone');
    const milestone = await Milestone.findById(markerReviewRes.body.data.resultingMilestoneId);
    expect(milestone).toBeTruthy();
    expect(String(milestone.trekkingRouteId)).toBe(String(resultingRoute._id));
  });
});
