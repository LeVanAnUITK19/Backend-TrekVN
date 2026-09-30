const request = require('supertest');
const createApp = require('../../src/app');
const db = require('../setup/db');
const { generateToken, checkinPayload, outOfRadiusPayload, syncItem } = require('../helpers/factory');

let app;
let token;
let userId;

beforeAll(async () => {
  await db.connect();
  app = createApp();
  // Tạo userId cố định cho test suite này
  userId = 'user-checkin-test-001';
  token = generateToken({ id: userId });
}, 60000);

afterEach(async () => {
  await db.clearDatabase();
});

afterAll(async () => {
  await db.disconnect();
}, 30000);

// ═══════════════════════════════════════════════════════════════════
// POST /api/v1/checkins — Online check-in
// ═══════════════════════════════════════════════════════════════════

describe('POST /api/v1/checkins', () => {
  it('201 — check-in thành công khi trong bán kính', async () => {
    const payload = checkinPayload({ journeyId: 'journey_001' });
    const res = await request(app)
      .post('/api/v1/checkins')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      milestoneId: 'milestone_langbiang_summit',
      userId,
      journeyId: 'journey_001',
      verification: { status: 'VERIFIED' },
    });
    expect(res.body.data.milestoneCheckinId).toBeDefined();
  });

  it('401 — không có token', async () => {
    const res = await request(app)
      .post('/api/v1/checkins')
      .send(checkinPayload());

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('AUTH_REQUIRED');
  });

  it('400 — thiếu milestoneId', async () => {
    const payload = checkinPayload();
    delete payload.milestoneId;

    const res = await request(app)
      .post('/api/v1/checkins')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('400 — thiếu journeyId', async () => {
    const payload = checkinPayload();
    delete payload.journeyId;

    const res = await request(app)
      .post('/api/v1/checkins')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);

    expect(res.status).toBe(400);
  });

  it('422 — ngoài bán kính check-in', async () => {
    const res = await request(app)
      .post('/api/v1/checkins')
      .set('Authorization', `Bearer ${token}`)
      .send(outOfRadiusPayload({ journeyId: 'journey_oor' }));

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('CHECKIN_OUT_OF_RADIUS');
    expect(res.body.error.details).toHaveProperty('distanceMeters');
  });

  it('422 — GPS accuracy quá thấp', async () => {
    const res = await request(app)
      .post('/api/v1/checkins')
      .set('Authorization', `Bearer ${token}`)
      .send(checkinPayload({ journeyId: 'journey_acc', accuracyMeters: 999 }));

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('GPS_ACCURACY_TOO_LOW');
  });

  it('404 — milestone không tồn tại', async () => {
    const res = await request(app)
      .post('/api/v1/checkins')
      .set('Authorization', `Bearer ${token}`)
      .send(checkinPayload({ milestoneId: 'milestone_nonexistent', journeyId: 'journey_nf' }));

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('MILESTONE_NOT_FOUND');
  });

  it('409 — duplicate check-in (cùng journey + milestone + user)', async () => {
    const payload = checkinPayload({ journeyId: 'journey_dup' });

    // Check-in lần 1
    await request(app)
      .post('/api/v1/checkins')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);

    // Check-in lần 2 cùng journeyId + milestoneId
    const res = await request(app)
      .post('/api/v1/checkins')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CHECKIN_ALREADY_EXISTS');
  });

  it('không nhận placeId/provinceId từ client body', async () => {
    const payload = {
      ...checkinPayload({ journeyId: 'journey_inject' }),
      provinceId: 'injected_province',
      trekkingPlaceId: 'injected_place',
    };

    const res = await request(app)
      .post('/api/v1/checkins')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);

    expect(res.status).toBe(201);
    // placeId phải lấy từ provider, không phải từ client
    expect(res.body.data.trekkingPlaceId).toBe('place_langbiang');
    expect(String(res.body.data.provinceId)).not.toBe('injected_province');
  });

  it('userId không được lấy từ body mà từ JWT', async () => {
    const payload = {
      ...checkinPayload({ journeyId: 'journey_uid' }),
      userId: 'hacker_user_id',
    };

    const res = await request(app)
      .post('/api/v1/checkins')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.data.userId).toBe(userId);
    expect(res.body.data.userId).not.toBe('hacker_user_id');
  });
});

// ═══════════════════════════════════════════════════════════════════
// POST /api/v1/checkins/sync — Offline sync
// ═══════════════════════════════════════════════════════════════════

describe('POST /api/v1/checkins/sync', () => {
  it('200 — sync thành công một item', async () => {
    const item = syncItem();
    const res = await request(app)
      .post('/api/v1/checkins/sync')
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [item] });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.results).toHaveLength(1);
    expect(res.body.data.results[0]).toMatchObject({
      clientCheckinId: item.clientCheckinId,
      status: 'VERIFIED',
    });
    expect(res.body.data.results[0].serverCheckinId).toBeDefined();
  });

  it('idempotent — retry cùng clientCheckinId không tạo bản ghi mới', async () => {
    const item = syncItem();

    // Lần 1
    const res1 = await request(app)
      .post('/api/v1/checkins/sync')
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [item] });

    // Lần 2 — cùng clientCheckinId
    const res2 = await request(app)
      .post('/api/v1/checkins/sync')
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [item] });

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    // Phải trả về cùng serverCheckinId
    expect(res1.body.data.results[0].serverCheckinId).toBe(
      res2.body.data.results[0].serverCheckinId
    );
  });

  it('một item lỗi không làm batch fail', async () => {
    const goodItem = syncItem({ milestoneId: 'milestone_langbiang_summit' });
    const badItem = syncItem({ milestoneId: 'milestone_nonexistent' });

    const res = await request(app)
      .post('/api/v1/checkins/sync')
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [goodItem, badItem] });

    expect(res.status).toBe(200);
    expect(res.body.data.results).toHaveLength(2);

    const goodResult = res.body.data.results.find(
      (r) => r.clientCheckinId === goodItem.clientCheckinId
    );
    const badResult = res.body.data.results.find(
      (r) => r.clientCheckinId === badItem.clientCheckinId
    );

    expect(goodResult.status).toBe('VERIFIED');
    expect(badResult.status).toBe('FAILED');
    expect(badResult.error.code).toBe('MILESTONE_NOT_FOUND');
  });

  it('400 — items rỗng', async () => {
    const res = await request(app)
      .post('/api/v1/checkins/sync')
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [] });

    expect(res.status).toBe(400);
  });

  it('401 — không có token', async () => {
    const res = await request(app)
      .post('/api/v1/checkins/sync')
      .send({ items: [syncItem()] });

    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════
// GET /api/v1/checkins/me
// ═══════════════════════════════════════════════════════════════════

describe('GET /api/v1/checkins/me', () => {
  it('200 — trả về danh sách check-in của user', async () => {
    // Tạo 2 check-in với journey và milestone khác nhau
    const r1 = await request(app)
      .post('/api/v1/checkins')
      .set('Authorization', `Bearer ${token}`)
      .send(checkinPayload({ journeyId: 'journey_list_01', milestoneId: 'milestone_langbiang_summit' }));
    expect(r1.status).toBe(201);

    const r2 = await request(app)
      .post('/api/v1/checkins')
      .set('Authorization', `Bearer ${token}`)
      .send(checkinPayload({
        journeyId: 'journey_list_02',
        milestoneId: 'milestone_langbiang_summit',
        latitude: 12.05,
        longitude: 108.441,
      }));
    if (r2.status !== 201) { console.error('r2 error body:', JSON.stringify(r2.body)); } // eslint-disable-line no-console
    expect(r2.status).toBe(201);

    const res = await request(app)
      .get('/api/v1/checkins/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(2);
    expect(res.body.data.total).toBe(2);
  });

  it('200 — filter theo journeyId', async () => {
    await request(app)
      .post('/api/v1/checkins')
      .set('Authorization', `Bearer ${token}`)
      .send(checkinPayload({ journeyId: 'journey_filter_A' }));

    await request(app)
      .post('/api/v1/checkins')
      .set('Authorization', `Bearer ${token}`)
      .send(checkinPayload({ journeyId: 'journey_filter_B' }));

    const res = await request(app)
      .get('/api/v1/checkins/me?journeyId=journey_filter_A')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].journeyId).toBe('journey_filter_A');
  });

  it('200 — không trả về check-in của user khác', async () => {
    const otherToken = generateToken({ id: 'other-user-xyz' });

    await request(app)
      .post('/api/v1/checkins')
      .set('Authorization', `Bearer ${otherToken}`)
      .send(checkinPayload({ journeyId: 'journey_other' }));

    const res = await request(app)
      .get('/api/v1/checkins/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(0);
  });

  it('401 — không có token', async () => {
    const res = await request(app).get('/api/v1/checkins/me');
    expect(res.status).toBe(401);
  });
});

// NOTE: GET /api/v1/checkins/me/recent đã bị xóa khỏi MVP.
// Home TrekViệt dùng GET /api/v1/visits/places/me/recent thay thế.

// ═══════════════════════════════════════════════════════════════════
// GET /api/v1/checkins/:checkinId
// ═══════════════════════════════════════════════════════════════════

describe('GET /api/v1/checkins/:checkinId', () => {
  it('200 — lấy được check-in của chính mình', async () => {
    const create = await request(app)
      .post('/api/v1/checkins')
      .set('Authorization', `Bearer ${token}`)
      .send(checkinPayload({ journeyId: 'journey_get_001' }));

    const checkinId = create.body.data.milestoneCheckinId;

    const res = await request(app)
      .get(`/api/v1/checkins/${checkinId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.milestoneCheckinId).toBe(checkinId);
  });

  it('403 — không xem được check-in của user khác', async () => {
    const create = await request(app)
      .post('/api/v1/checkins')
      .set('Authorization', `Bearer ${token}`)
      .send(checkinPayload({ journeyId: 'journey_get_002' }));

    const checkinId = create.body.data.milestoneCheckinId;
    const otherToken = generateToken({ id: 'other-user-abc' });

    const res = await request(app)
      .get(`/api/v1/checkins/${checkinId}`)
      .set('Authorization', `Bearer ${otherToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('404 — checkinId không tồn tại', async () => {
    const fakeId = '64f1a2b3c4d5e6f7a8b9c0d1';
    const res = await request(app)
      .get(`/api/v1/checkins/${fakeId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('CHECKIN_NOT_FOUND');
  });
});

// ═══════════════════════════════════════════════════════════════════
// GET /api/v1/journeys/:journeyId/checkins
// ═══════════════════════════════════════════════════════════════════

describe('GET /api/v1/journeys/:journeyId/checkins', () => {
  it('200 — danh sách check-in trong journey', async () => {
    await request(app)
      .post('/api/v1/checkins')
      .set('Authorization', `Bearer ${token}`)
      .send(checkinPayload({ journeyId: 'journey_jc_001' }));

    const res = await request(app)
      .get('/api/v1/journeys/journey_jc_001/checkins')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].journeyId).toBe('journey_jc_001');
  });

  it('200 — journey không có check-in trả về mảng rỗng', async () => {
    const res = await request(app)
      .get('/api/v1/journeys/journey_empty/checkins')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });
});
