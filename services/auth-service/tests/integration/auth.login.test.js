/**
 * Test: POST /api/v1/auth/login
 */

const request = require('supertest');
const db = require('../setup/db');
const createApp = require('../../src/app');
const { createActiveUser, createPendingUser } = require('../helpers/factory');

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

describe('POST /api/v1/auth/login — validation', () => {
  it('thiếu email → 400', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ password: 'Pass@123' });
    expect(res.status).toBe(400);
  });

  it('thiếu password → 400', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'a@b.com' });
    expect(res.status).toBe(400);
  });

  it('email không đúng format → 400', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'invalid', password: 'Pass@123' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/v1/auth/login — happy path', () => {
  it('đăng nhập thành công → 200, trả về accessToken + refreshToken', async () => {
    await createActiveUser({ email: 'login@example.com', password: 'Pass@123' });

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'login@example.com', password: 'Pass@123' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
    expect(res.body.data.user.email).toBe('login@example.com');
    expect(res.body.data.user.passwordHash).toBeUndefined();
  });
});

describe('POST /api/v1/auth/login — error paths', () => {
  it('email không tồn tại → 401', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'noexist@example.com', password: 'Pass@123' });
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/email hoặc mật khẩu/i);
  });

  it('sai mật khẩu → 401', async () => {
    await createActiveUser({ email: 'wrongpw@example.com', password: 'Pass@123' });

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'wrongpw@example.com', password: 'WrongPass' });

    expect(res.status).toBe(401);
  });

  it('tài khoản PENDING → 403', async () => {
    await createPendingUser({ email: 'pending@example.com', password: 'Pass@123' });

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'pending@example.com', password: 'Pass@123' });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/chưa được xác minh/i);
  });

  it('tài khoản SUSPENDED → 403', async () => {
    await createActiveUser({ email: 'suspended@example.com', password: 'Pass@123', status: 'SUSPENDED' });

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'suspended@example.com', password: 'Pass@123' });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/bị khóa/i);
  });
});
