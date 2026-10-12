const request = require('supertest');
const mongoose = require('mongoose');
const createApp = require('../../src/app');
const db = require('../setup/db');
const {
  generateToken,
  checkinPayload,
  createProvince,
  seedProvinces,
  createLamDongProvince,
} = require('../helpers/factory');

let app;
let token;
let userId;

beforeAll(async () => {
  await db.connect();
  app = createApp();
  userId = 'user-visit-test-001';
  token = generateToken({ id: userId });
}, 60000);

afterEach(async () => {
  await db.clearDatabase();
});

afterAll(async () => {
  await db.disconnect();
}, 30000);

// ═══════════════════════════════════════════════════════════════════
// GET /api/v1/visits/provinces/me — CORE: trả toàn bộ 34 tỉnh
// ═══════════════════════════════════════════════════════════════════

describe('GET /api/v1/visits/provinces/me — full province list', () => {
  // CASE 1: DB có 34 provinces, user chưa visit tỉnh nào
  it('CASE 1 — 34 tỉnh, user chưa visit: tất cả UNVISITED, summary zeroes', async () => {
    await seedProvinces();

    const res = await request(app)
      .get('/api/v1/visits/provinces/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const { summary, provinces } = res.body.data;

    expect(summary.totalProvinces).toBe(34);
    expect(summary.visitedCount).toBe(0);
    expect(summary.verifiedCount).toBe(0);
    expect(summary.selfReportedCount).toBe(0);
    expect(provinces).toHaveLength(34);
    provinces.forEach((p) => {
      expect(p.visitStatus).toBe('UNVISITED');
      expect(p.manualMarked).toBe(false);
      expect(p.visitCount).toBe(0);
      expect(p.firstVisitedAt).toBeNull();
      expect(p.lastVisitedAt).toBeNull();
    });
  });

  // CASE 2: User manual mark 3 tỉnh
  it('CASE 2 — user tick 3 tỉnh: visitedCount=3, selfReportedCount=3', async () => {
    const provinces = await seedProvinces();
    const pIds = provinces.slice(0, 3).map((p) => p._id.toString());

    for (const pId of pIds) {
      await request(app)
        .patch(`/api/v1/visits/provinces/me/${pId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ visited: true });
    }

    const res = await request(app)
      .get('/api/v1/visits/provinces/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const { summary, provinces: list } = res.body.data;

    expect(summary.totalProvinces).toBe(34);
    expect(summary.visitedCount).toBe(3);
    expect(summary.verifiedCount).toBe(0);
    expect(summary.selfReportedCount).toBe(3);
    expect(list).toHaveLength(34);

    const visited = list.filter((p) => p.visitStatus === 'SELF_REPORTED');
    expect(visited).toHaveLength(3);
    const unvisited = list.filter((p) => p.visitStatus === 'UNVISITED');
    expect(unvisited).toHaveLength(31);
  });

  // CASE 3: User có 3 SELF_REPORTED + 2 VERIFIED (check-in)
  it('CASE 3 — 3 SELF_REPORTED + 2 VERIFIED: counts correct', async () => {
    // Seed đủ 34 tỉnh
    await seedProvinces();

    // Đảm bảo tỉnh Lâm Đồng có đúng _id mà mock milestones.json dùng
    // (seedProvinces có thể đã tạo lam_dong nhưng với _id random)
    const Province = require('../../src/models/Province');
    await Province.deleteOne({ code: 'lam_dong' });
    const lamDong = await createLamDongProvince();

    // Tạo tỉnh Lào Cai với _id khớp milestone_fansipan (provinceId=6849a1b2c3d4e5f6a7b8c9d1)
    await Province.deleteOne({ code: 'lao_cai' });
    await Province.create({
      _id: new mongoose.Types.ObjectId('6849a1b2c3d4e5f6a7b8c9d1'),
      code: 'lao_cai',
      name: 'Lào Cai',
      region: 'NORTH',
      mapFeatureId: 'VN-LO',
      center: { type: 'Point', coordinates: [104.0, 22.3364] },
    });

    // Tick 3 tỉnh khác thủ công
    const otherProvinces = await Province.find({
      code: { $nin: ['lam_dong', 'lao_cai'] },
    }).limit(3);
    for (const p of otherProvinces) {
      await request(app)
        .patch(`/api/v1/visits/provinces/me/${p._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ visited: true });
    }

    // Check-in Langbiang → Lâm Đồng VERIFIED
    await request(app)
      .post('/api/v1/checkins')
      .set('Authorization', `Bearer ${token}`)
      .send(checkinPayload({ journeyId: 'j_case3_a' }));

    // Check-in Fansipan → Lào Cai VERIFIED
    await request(app)
      .post('/api/v1/checkins')
      .set('Authorization', `Bearer ${token}`)
      .send(checkinPayload({
        journeyId: 'j_case3_b',
        milestoneId: 'milestone_fansipan_summit',
        latitude: 22.303,
        longitude: 103.776,
      }));

    const res = await request(app)
      .get('/api/v1/visits/provinces/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const { summary } = res.body.data;

    expect(summary.verifiedCount).toBe(2);
    expect(summary.selfReportedCount).toBe(3);
    expect(summary.visitedCount).toBe(5);
    expect(summary.visitedCount).toBe(summary.verifiedCount + summary.selfReportedCount);

    // Kiểm tra tỉnh Lâm Đồng
    const ldP = res.body.data.provinces.find((p) => p.provinceId === lamDong._id.toString());
    expect(ldP.visitStatus).toBe('VERIFIED');
  });

  // CASE 4: SELF_REPORTED province sau verified check-in → chuyển VERIFIED
  it('CASE 4 — SELF_REPORTED → VERIFIED sau check-in, visitedCount không tăng', async () => {
    await seedProvinces();
    // Đảm bảo Lâm Đồng có đúng _id
    const Province = require('../../src/models/Province');
    await Province.deleteOne({ code: 'lam_dong' });
    const lamDong = await createLamDongProvince();

    // Tick thủ công trước
    await request(app)
      .patch(`/api/v1/visits/provinces/me/${lamDong._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ visited: true });

    // Verify trước check-in
    const resBefore = await request(app)
      .get('/api/v1/visits/provinces/me')
      .set('Authorization', `Bearer ${token}`);
    const before = resBefore.body.data;
    expect(before.summary.visitedCount).toBe(1);
    expect(before.summary.selfReportedCount).toBe(1);
    expect(before.summary.verifiedCount).toBe(0);

    // Check-in GPS → Lâm Đồng trở thành VERIFIED
    await request(app)
      .post('/api/v1/checkins')
      .set('Authorization', `Bearer ${token}`)
      .send(checkinPayload({ journeyId: 'j_case4' }));

    const resAfter = await request(app)
      .get('/api/v1/visits/provinces/me')
      .set('Authorization', `Bearer ${token}`);
    const after = resAfter.body.data;

    // visitedCount không tăng vì vẫn là cùng 1 tỉnh
    expect(after.summary.visitedCount).toBe(1);
    expect(after.summary.verifiedCount).toBe(1);
    expect(after.summary.selfReportedCount).toBe(0);

    // Tìm tỉnh Lâm Đồng trong list
    const ldProvince = after.provinces.find((p) => p.provinceId === lamDong._id.toString());
    expect(ldProvince.visitStatus).toBe('VERIFIED');
  });

  // CASE 5: User bỏ tick VERIFIED province → vẫn VERIFIED
  it('CASE 5 — bỏ tick VERIFIED province → vẫn giữ VERIFIED', async () => {
    await seedProvinces();
    const Province = require('../../src/models/Province');
    await Province.deleteOne({ code: 'lam_dong' });
    const lamDong = await createLamDongProvince();

    // Check-in để VERIFIED
    await request(app)
      .post('/api/v1/checkins')
      .set('Authorization', `Bearer ${token}`)
      .send(checkinPayload({ journeyId: 'j_case5' }));

    // Bỏ tick
    await request(app)
      .patch(`/api/v1/visits/provinces/me/${lamDong._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ visited: false });

    const res = await request(app)
      .get('/api/v1/visits/provinces/me')
      .set('Authorization', `Bearer ${token}`);

    const ldProvince = res.body.data.provinces.find(
      (p) => p.provinceId === lamDong._id.toString()
    );
    expect(ldProvince.visitStatus).toBe('VERIFIED');
    expect(res.body.data.summary.verifiedCount).toBe(1);
  });

  // CASE 6: Province không có ProvinceVisit → UNVISITED
  it('CASE 6 — province không có visit record → UNVISITED', async () => {
    await seedProvinces();
    const res = await request(app)
      .get('/api/v1/visits/provinces/me')
      .set('Authorization', `Bearer ${token}`);

    const haNoi = res.body.data.provinces.find((p) => p.code === 'ha_noi');
    expect(haNoi).toBeDefined();
    expect(haNoi.visitStatus).toBe('UNVISITED');
    expect(haNoi.visitCount).toBe(0);
    expect(haNoi.firstVisitedAt).toBeNull();
  });

  it('trả về đúng fields cần cho Flutter map (mapFeatureId, center, visitStatus)', async () => {
    await seedProvinces();
    const res = await request(app)
      .get('/api/v1/visits/provinces/me')
      .set('Authorization', `Bearer ${token}`);

    const p = res.body.data.provinces[0];
    expect(p).toHaveProperty('provinceId');
    expect(p).toHaveProperty('code');
    expect(p).toHaveProperty('name');
    expect(p).toHaveProperty('region');
    expect(p).toHaveProperty('mapFeatureId');
    expect(p).toHaveProperty('center');
    expect(p).toHaveProperty('visitStatus');
    expect(p).toHaveProperty('manualMarked');
    expect(p).toHaveProperty('visitCount');
    expect(p).toHaveProperty('firstVisitedAt');
    expect(p).toHaveProperty('lastVisitedAt');
  });

  it('401 — không có token', async () => {
    const res = await request(app).get('/api/v1/visits/provinces/me');
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════
// GET /api/v1/visits/me/summary
// ═══════════════════════════════════════════════════════════════════

describe('GET /api/v1/visits/me/summary', () => {
  it('200 — summary mặc định khi chưa có gì', async () => {
    const res = await request(app)
      .get('/api/v1/visits/me/summary')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      visitedProvinceCount: 0,
      verifiedProvinceCount: 0,
      visitedPlaceCount: 0,
      checkinCount: 0,
    });
  });

  it('200 — cập nhật sau khi check-in', async () => {
    await createLamDongProvince();

    await request(app)
      .post('/api/v1/checkins')
      .set('Authorization', `Bearer ${token}`)
      .send(checkinPayload({ journeyId: 'journey_sum_01' }));

    const res = await request(app)
      .get('/api/v1/visits/me/summary')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.checkinCount).toBe(1);
    expect(res.body.data.visitedPlaceCount).toBe(1);
    expect(res.body.data.verifiedProvinceCount).toBe(1);
    expect(res.body.data.visitedProvinceCount).toBe(1);
  });

  it('401 — không có token', async () => {
    const res = await request(app).get('/api/v1/visits/me/summary');
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════
// PATCH /api/v1/visits/provinces/me/:provinceId
// ═══════════════════════════════════════════════════════════════════

describe('PATCH /api/v1/visits/provinces/me/:provinceId', () => {
  let province;

  beforeEach(async () => {
    province = await createProvince({ code: 'test_prov', name: 'Test Tỉnh' });
  });

  it('200 — tick tỉnh thủ công → SELF_REPORTED', async () => {
    const res = await request(app)
      .patch(`/api/v1/visits/provinces/me/${province._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ visited: true });

    expect(res.status).toBe(200);
    expect(res.body.data.manualMarked).toBe(true);
    expect(res.body.data.verificationStatus).toBe('SELF_REPORTED');
  });

  it('200 — bỏ tick SELF_REPORTED → record xóa, trả về null', async () => {
    await request(app)
      .patch(`/api/v1/visits/provinces/me/${province._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ visited: true });

    const res = await request(app)
      .patch(`/api/v1/visits/provinces/me/${province._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ visited: false });

    expect(res.status).toBe(200);
    expect(res.body.data).toBeNull();
  });

  it('200 — bỏ tick VERIFIED province → vẫn giữ VERIFIED, manualMarked=false', async () => {
    // Cần tỉnh có check-in để VERIFIED — dùng createLamDongProvince
    const lamDong = await createLamDongProvince();

    await request(app)
      .post('/api/v1/checkins')
      .set('Authorization', `Bearer ${token}`)
      .send(checkinPayload({ journeyId: 'j_patch_verified' }));

    const res = await request(app)
      .patch(`/api/v1/visits/provinces/me/${lamDong._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ visited: false });

    expect(res.status).toBe(200);
    expect(res.body.data.verificationStatus).toBe('VERIFIED');
    expect(res.body.data.manualMarked).toBe(false);
  });

  it('400 — thiếu visited field', async () => {
    const res = await request(app)
      .patch(`/api/v1/visits/provinces/me/${province._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('404 — provinceId không tồn tại', async () => {
    const fakeId = '64f1a2b3c4d5e6f7a8b9c0d1';
    const res = await request(app)
      .patch(`/api/v1/visits/provinces/me/${fakeId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ visited: true });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('PROVINCE_NOT_FOUND');
  });
});

// ═══════════════════════════════════════════════════════════════════
// GET /api/v1/visits/provinces/me/:provinceId
// ═══════════════════════════════════════════════════════════════════

describe('GET /api/v1/visits/provinces/me/:provinceId', () => {
  it('200 — chi tiết tỉnh chưa visit', async () => {
    const province = await createProvince({ code: 'test_detail' });
    const res = await request(app)
      .get(`/api/v1/visits/provinces/me/${province._id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.province).toBeDefined();
    expect(res.body.data.visit).toBeNull();
  });

  it('404 — provinceId không tồn tại', async () => {
    const fakeId = '64f1a2b3c4d5e6f7a8b9c0d1';
    const res = await request(app)
      .get(`/api/v1/visits/provinces/me/${fakeId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Place Visits
// ═══════════════════════════════════════════════════════════════════

describe('Place Visits', () => {
  beforeEach(async () => {
    // Tạo tỉnh Lâm Đồng để check-in có placeVisit
    await createLamDongProvince();
  });

  it('GET /places/me — danh sách rỗng ban đầu', async () => {
    const res = await request(app)
      .get('/api/v1/visits/places/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(0);
  });

  it('GET /places/me — cập nhật sau check-in qualified (qualifiesPlaceVisit=true)', async () => {
    await request(app)
      .post('/api/v1/checkins')
      .set('Authorization', `Bearer ${token}`)
      .send(checkinPayload({ journeyId: 'journey_place_01' }));

    const res = await request(app)
      .get('/api/v1/visits/places/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].trekkingPlaceId).toBe('place_langbiang');
  });

  it('province VERIFIED sau check-in qualifying', async () => {
    await request(app)
      .post('/api/v1/checkins')
      .set('Authorization', `Bearer ${token}`)
      .send(checkinPayload({ journeyId: 'journey_pv_verify' }));

    const sumRes = await request(app)
      .get('/api/v1/visits/me/summary')
      .set('Authorization', `Bearer ${token}`);

    expect(sumRes.body.data.verifiedProvinceCount).toBe(1);
  });

  it('visitCount tăng đúng — 2 journey khác nhau = visitCount 2', async () => {
    await request(app)
      .post('/api/v1/checkins')
      .set('Authorization', `Bearer ${token}`)
      .send(checkinPayload({ journeyId: 'journey_vc_01' }));

    await request(app)
      .post('/api/v1/checkins')
      .set('Authorization', `Bearer ${token}`)
      .send(checkinPayload({ journeyId: 'journey_vc_02' }));

    const res = await request(app)
      .get('/api/v1/visits/places/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.data.items[0].visitCount).toBe(2);
  });

  it('visitCount KHÔNG tăng khi 2 qualifying milestone trong cùng journey', async () => {
    // summit (qualifies) + finish (qualifies) — cùng journey
    await request(app)
      .post('/api/v1/checkins')
      .set('Authorization', `Bearer ${token}`)
      .send(checkinPayload({
        journeyId: 'journey_same',
        milestoneId: 'milestone_langbiang_summit',
      }));

    await request(app)
      .post('/api/v1/checkins')
      .set('Authorization', `Bearer ${token}`)
      .send(checkinPayload({
        journeyId: 'journey_same',
        milestoneId: 'milestone_langbiang_finish',
        latitude: 12.045,
        longitude: 108.436,
      }));

    const res = await request(app)
      .get('/api/v1/visits/places/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.data.items[0].visitCount).toBe(1);
  });

  it('GET /places/me/recent — trả về tối đa limit items', async () => {
    await request(app)
      .post('/api/v1/checkins')
      .set('Authorization', `Bearer ${token}`)
      .send(checkinPayload({ journeyId: 'journey_recent_place' }));

    const res = await request(app)
      .get('/api/v1/visits/places/me/recent?limit=5')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeLessThanOrEqual(5);
  });

  it('GET /places/me/:placeId — null khi chưa đến', async () => {
    const res = await request(app)
      .get('/api/v1/visits/places/me/place_never_visited')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeNull();
  });

  it('GET /places/me/:placeId — có data sau check-in', async () => {
    await request(app)
      .post('/api/v1/checkins')
      .set('Authorization', `Bearer ${token}`)
      .send(checkinPayload({ journeyId: 'journey_pd_01' }));

    const res = await request(app)
      .get('/api/v1/visits/places/me/place_langbiang')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).not.toBeNull();
    expect(res.body.data.trekkingPlaceId).toBe('place_langbiang');
    expect(res.body.data.visitCount).toBe(1);
  });
});
