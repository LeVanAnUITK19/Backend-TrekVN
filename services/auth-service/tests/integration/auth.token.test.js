/**
 * Test: Refresh token, Logout, Verify token
 */

const request = require('supertest');
const crypto = require('crypto');
const db = require('../setup/db');
const createApp = require('../../src/app');
const { createActiveUser } = require('../helpers/factory');
const RefreshToken = require('../../src/models/RefreshToken');

jest.mock('../../src/config/mailer', () => ({
  sendMail: jest.fn().mockResolvedValue({ messageId: 'test-msg-id' }),
}));

let app;

beforeAll(async () => {
  await db.connect();
  app = createApp();
});

afterEach(async () => {
  await db.clearCollections();
});

afterAll(async () => {
  await db.disconnect();
});

// ─── Helper: login nhanh ──────────────────────────────────────────────────────

const loginAs = async (email = 'token@example.com', password = 'Pass@123') => {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password });
  return res.body.data;
};

// ─── Refresh ──────────────────────────────────────────────────────────────────

describe('POST /api/v1/auth/refresh', () => {
  it('refresh token hợp lệ → 200, nhận accessToken + refreshToken mới', async () => {
    await createActiveUser({ email: 'token@example.com', password: 'Pass@123' });
    const { refreshToken: oldToken } = await loginAs();

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: oldToken });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
    expect(res.body.data.refreshToken).not.toBe(oldToken); // token mới
  });

  it('token cũ bị revoke sau khi refresh (rotation)', async () => {
    await createActiveUser({ email: 'rotate@example.com', password: 'Pass@123' });
    const { refreshToken: oldToken } = await loginAs('rotate@example.com');

    await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: oldToken });

    // Dùng lại token cũ → phải bị từ chối
    const res2 = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: oldToken });

    expect(res2.status).toBe(401);
  });

  it('token không tồn tại → 401', async () => {
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'totally-fake-token' });
    expect(res.status).toBe(401);
  });

  it('thiếu refreshToken → 401', async () => {
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({});
    expect(res.status).toBe(401);
  });
});

// ─── Logout ───────────────────────────────────────────────────────────────────

describe('POST /api/v1/auth/logout', () => {
  it('logout thành công → 200', async () => {
    await createActiveUser({ email: 'logout@example.com', password: 'Pass@123' });
    const { accessToken, refreshToken } = await loginAs('logout@example.com');

    const res = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/đăng xuất thành công/i);
  });

  it('refresh token bị revoke sau logout', async () => {
    await createActiveUser({ email: 'logout2@example.com', password: 'Pass@123' });
    const { accessToken, refreshToken } = await loginAs('logout2@example.com');

    await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ refreshToken });

    const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const record = await RefreshToken.findOne({ tokenHash: hash });
    expect(record.revokedAt).not.toBeNull();
  });

  it('không có Authorization header → 401', async () => {
    const res = await request(app)
      .post('/api/v1/auth/logout')
      .send({ refreshToken: 'some-token' });
    expect(res.status).toBe(401);
  });
});

// ─── Verify token ─────────────────────────────────────────────────────────────

describe('GET /api/v1/auth/verify', () => {
  it('accessToken hợp lệ → 200, trả về decoded payload', async () => {
    await createActiveUser({ email: 'verifytk@example.com', password: 'Pass@123' });
    const { accessToken } = await loginAs('verifytk@example.com');

    const res = await request(app)
      .get('/api/v1/auth/verify')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe('verifytk@example.com');
    expect(res.body.data.role).toBe('USER');
  });

  it('token sai → 401', async () => {
    const res = await request(app)
      .get('/api/v1/auth/verify')
      .set('Authorization', 'Bearer bad.token.here');
    expect(res.status).toBe(401);
  });

  it('thiếu Authorization → 401', async () => {
    const res = await request(app).get('/api/v1/auth/verify');
    expect(res.status).toBe(401);
  });
});
