/**
 * Test: POST /api/v1/auth/register
 *
 * otp.service.js gọi nodemailer để gửi email thật → mock lại để test không
 * phụ thuộc vào SMTP server.
 */

const request = require('supertest');
const db = require('../setup/db');
const createApp = require('../../src/app');
const { createActiveUser, createPendingUser } = require('../helpers/factory');

// ─── Mock nodemailer transporter ──────────────────────────────────────────────
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
  jest.clearAllMocks();
});

afterAll(async () => {
  await db.disconnect();
});

// ─── Validation ───────────────────────────────────────────────────────────────

describe('POST /api/v1/auth/register — validation', () => {
  it('thiếu email → 400', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ password: 'Pass@123', displayName: 'Test' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('email không hợp lệ → 400', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'not-an-email', password: 'Pass@123', displayName: 'Test' });
    expect(res.status).toBe(400);
  });

  it('password < 6 ký tự → 400', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'a@b.com', password: '123', displayName: 'Test' });
    expect(res.status).toBe(400);
  });

  it('thiếu displayName → 400', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'a@b.com', password: 'Pass@123' });
    expect(res.status).toBe(400);
  });

  it('displayName < 2 ký tự → 400', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'a@b.com', password: 'Pass@123', displayName: 'A' });
    expect(res.status).toBe(400);
  });
});

// ─── Happy path ───────────────────────────────────────────────────────────────

describe('POST /api/v1/auth/register — happy path', () => {
  it('đăng ký thành công → 201 + gửi OTP', async () => {
    const mailer = require('../../src/config/mailer');

    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'new@example.com', password: 'Pass@123', displayName: 'New User' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.message).toMatch(/OTP/i);
    expect(res.body.data.expiresAt).toBeDefined();
    expect(mailer.sendMail).toHaveBeenCalledTimes(1);
  });

  it('đăng ký lại email PENDING → gửi OTP mới, không tạo user mới', async () => {
    const mailer = require('../../src/config/mailer');
    await createPendingUser({ email: 'pending@example.com' });

    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'pending@example.com', password: 'Pass@123', displayName: 'Pending User' });

    expect(res.status).toBe(201);
    expect(mailer.sendMail).toHaveBeenCalledTimes(1);

    // Kiểm tra không tạo thêm user
    const User = require('../../src/models/User');
    const count = await User.countDocuments({ email: 'pending@example.com' });
    expect(count).toBe(1);
  });
});

// ─── Error path ───────────────────────────────────────────────────────────────

describe('POST /api/v1/auth/register — email đã tồn tại', () => {
  it('email ACTIVE → 400', async () => {
    await createActiveUser({ email: 'existing@example.com' });

    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'existing@example.com', password: 'Pass@123', displayName: 'Dup' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/email đã được sử dụng/i);
  });
});
