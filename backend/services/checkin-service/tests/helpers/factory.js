const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

// ─── JWT ──────────────────────────────────────────────────────────────────────

/**
 * Tạo JWT hợp lệ cho test.
 * Dùng field "id" như auth-service để auth middleware normalize thành userId.
 */
const generateToken = (payload = {}) => {
  const defaults = {
    id: new mongoose.Types.ObjectId().toString(),
    email: 'test@trekvn.com',
    role: 'USER',
  };
  return jwt.sign({ ...defaults, ...payload }, process.env.JWT_SECRET, { expiresIn: '1h' });
};

// ─── Check-in request body ────────────────────────────────────────────────────

/**
 * Tạo payload cho POST /api/v1/checkins.
 * Sử dụng milestone_langbiang_summit từ mock data.
 * provinceId mock = "6849a1b2c3d4e5f6a7b8c9d0" (Lâm Đồng).
 */
const checkinPayload = (overrides = {}) => ({
  journeyId: `journey_${Date.now()}`,
  milestoneId: 'milestone_langbiang_summit',
  latitude: 12.05,
  longitude: 108.441,
  accuracyMeters: 8,
  checkedAt: new Date().toISOString(),
  ...overrides,
});

/**
 * Payload outside radius — tọa độ Hà Nội, cách Langbiang ~600km.
 */
const outOfRadiusPayload = (overrides = {}) => ({
  journeyId: `journey_${Date.now()}`,
  milestoneId: 'milestone_langbiang_summit',
  latitude: 21.0285,
  longitude: 105.8542,
  accuracyMeters: 8,
  checkedAt: new Date().toISOString(),
  ...overrides,
});

// ─── Offline sync item ────────────────────────────────────────────────────────

const syncItem = (overrides = {}) => ({
  clientCheckinId: `local_${Date.now()}_${Math.random().toString(36).slice(2)}`,
  journeyId: `journey_${Date.now()}`,
  milestoneId: 'milestone_langbiang_summit',
  latitude: 12.05,
  longitude: 108.441,
  accuracyMeters: 10,
  checkedAt: new Date().toISOString(),
  ...overrides,
});

// ─── Province helpers ─────────────────────────────────────────────────────────

/**
 * Tạo một Province document trong DB.
 */
const createProvince = (overrides = {}) => {
  const Province = require('../../src/models/Province');
  return Province.create({
    code: `province_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    name: 'Test Province',
    region: 'SOUTH',
    mapFeatureId: `VN-TST_${Date.now()}`,
    center: { type: 'Point', coordinates: [108.4, 11.9] },
    ...overrides,
  });
};

/**
 * Seed toàn bộ 34 tỉnh từ mocks/provinces.json vào DB.
 * Trả về mảng Province documents đã được tạo.
 */
const seedProvinces = () => {
  const Province = require('../../src/models/Province');
  const data = require('../../src/mocks/provinces.json');
  return Province.insertMany(data);
};

/**
 * Tạo Province với ObjectId cố định để dùng với mock milestones.json.
 * Mock dùng provinceId = "6849a1b2c3d4e5f6a7b8c9d0" (Lâm Đồng).
 */
const createLamDongProvince = () => {
  const Province = require('../../src/models/Province');
  return Province.create({
    _id: new mongoose.Types.ObjectId('6849a1b2c3d4e5f6a7b8c9d0'),
    code: 'lam_dong',
    name: 'Lâm Đồng',
    region: 'CENTRAL',
    mapFeatureId: 'VN-LD',
    center: { type: 'Point', coordinates: [108.4419, 11.9465] },
  });
};

module.exports = {
  generateToken,
  checkinPayload,
  outOfRadiusPayload,
  syncItem,
  createProvince,
  seedProvinces,
  createLamDongProvince,
};
