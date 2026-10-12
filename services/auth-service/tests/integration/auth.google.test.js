/**
 * Tests: POST /api/v1/auth/google
 * Google Sign-In integration tests using mocked google-auth-library
 */

const request = require('supertest');
const db = require('../setup/db');
const createApp = require('../../src/app');
const User = require('../../src/models/User');
const RankDefinition = require('../../src/models/RankDefinition');
const { createActiveUser, createPendingUser } = require('../helpers/factory');

// ─── Mock google-auth-library ─────────────────────────────────────────────────
const mockVerifyIdToken = jest.fn();
jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({
    verifyIdToken: mockVerifyIdToken,
  })),
}));

let app;

beforeAll(async () => {
  await db.connect();
  app = createApp();
  // Seed NEWBIE rank
  await RankDefinition.create({
    code: 'NEWBIE', name: 'Newbie', level: 1, minXp: 0,
    minCompletedJourneys: 0, minVisitedProvinces: 0, minBadgeCount: 0,
    status: 'ACTIVE',
  });
});

afterEach(async () => {
  await db.clearCollections();
  // Re-seed rank after clear
  await RankDefinition.create({
    code: 'NEWBIE', name: 'Newbie', level: 1, minXp: 0,
    minCompletedJourneys: 0, minVisitedProvinces: 0, minBadgeCount: 0,
    status: 'ACTIVE',
  });
  mockVerifyIdToken.mockReset();
});

afterAll(async () => {
  await db.disconnect();
});

// ─── Helper ───────────────────────────────────────────────────────────────────
const mockGooglePayload = (overrides = {}) => ({
  sub: 'google-sub-123',
  email: 'google@example.com',
  name: 'Google User',
  picture: 'https://example.com/pic.jpg',
  email_verified: true,
  ...overrides,
});

const setupMockVerify = (payload) => {
  mockVerifyIdToken.mockResolvedValue({
    getPayload: () => payload,
  });
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/v1/auth/google — validation', () => {
  it('thiếu idToken → 400', async () => {
    const res = await request(app).post('/api/v1/auth/google').send({});
    expect(res.status).toBe(400);
  });

  it('idToken rỗng → 400', async () => {
    const res = await request(app).post('/api/v1/auth/google').send({ idToken: '' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/v1/auth/google — invalid token', () => {
  it('Google ID Token không hợp lệ → 401', async () => {
    mockVerifyIdToken.mockRejectedValue(new Error('Invalid token'));
    const res = await request(app)
      .post('/api/v1/auth/google')
      .send({ idToken: 'invalid-token' });
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/không hợp lệ/i);
  });
});

describe('POST /api/v1/auth/google — new user (CASE 1)', () => {
  it('email chưa tồn tại → tạo user mới, trả về tokens', async () => {
    setupMockVerify(mockGooglePayload());

    const res = await request(app)
      .post('/api/v1/auth/google')
      .send({ idToken: 'valid-google-token' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
    expect(res.body.data.user.email).toBe('google@example.com');
    expect(res.body.data.user.status).toBe('ACTIVE');

    // User should exist in DB
    const dbUser = await User.findOne({ email: 'google@example.com' });
    expect(dbUser).not.toBeNull();
    expect(dbUser.passwordHash).toBeNull(); // Google-only, no password
  });

  it('retry cùng Google sub → không tạo duplicate user', async () => {
    setupMockVerify(mockGooglePayload());

    await request(app).post('/api/v1/auth/google').send({ idToken: 'token1' });
    mockVerifyIdToken.mockResolvedValue({ getPayload: () => mockGooglePayload() });
    await request(app).post('/api/v1/auth/google').send({ idToken: 'token2' });

    const count = await User.countDocuments({ email: 'google@example.com' });
    expect(count).toBe(1);
  });
});

describe('POST /api/v1/auth/google — link existing LOCAL user (CASE 2)', () => {
  it('Google activation clears an unverified local password', async () => {
    await createPendingUser({ email: 'google@example.com', password: 'AttackerPass@123' });
    setupMockVerify(mockGooglePayload({ email: 'google@example.com' }));
    const response = await request(app).post('/api/v1/auth/google').send({ idToken: 'valid-token' });
    expect(response.status).toBe(200);
    const user = await User.findOne({ email: 'google@example.com' });
    expect(user.status).toBe('ACTIVE');
    expect(user.passwordHash).toBeNull();
    const localLogin = await request(app).post('/api/v1/auth/login').send({ email: user.email, password: 'AttackerPass@123' });
    expect(localLogin.status).toBe(403);
  });
  it('email đã có LOCAL user → link GOOGLE identity, trả về tokens', async () => {
    // Create existing LOCAL user
    await createActiveUser({ email: 'google@example.com', password: 'Pass@123' });

    setupMockVerify(mockGooglePayload({ email: 'google@example.com' }));

    const res = await request(app)
      .post('/api/v1/auth/google')
      .send({ idToken: 'valid-token' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe('google@example.com');

    // Still only 1 user
    const count = await User.countDocuments({ email: 'google@example.com' });
    expect(count).toBe(1);
  });
});

describe('POST /api/v1/auth/google — BLOCKED user', () => {
  it('user BLOCKED → 403', async () => {
    await createActiveUser({
      email: 'blocked@example.com',
      password: 'Pass@123',
      status: 'BLOCKED',
    });

    setupMockVerify(mockGooglePayload({ email: 'blocked@example.com' }));

    const res = await request(app)
      .post('/api/v1/auth/google')
      .send({ idToken: 'valid-token' });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/bị khóa/i);
  });
});
