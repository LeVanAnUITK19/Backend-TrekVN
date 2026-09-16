/**
 * Test: POST /api/v1/auth/verify-email
 */

const request = require('supertest');
const db = require('../setup/db');
const createApp = require('../../src/app');
const { createPendingUser, createOtpRecord } = require('../helpers/factory');
const OtpVerification = require('../../src/models/OtpVerification');

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

describe('POST /api/v1/auth/verify-email — validation', () => {
  it('thiếu email → 400', async () => {
    const res = await request(app)
      .post('/api/v1/auth/verify-email')
      .send({ otp: '123456' });
    expect(res.status).toBe(400);
  });

  it('otp không đủ 6 chữ số → 400', async () => {
    const res = await request(app)
      .post('/api/v1/auth/verify-email')
      .send({ email: 'a@b.com', otp: '123' });
    expect(res.status).toBe(400);
  });

  it('otp có ký tự không phải số → 400', async () => {
    const res = await request(app)
      .post('/api/v1/auth/verify-email')
      .send({ email: 'a@b.com', otp: '12345a' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/v1/auth/verify-email — happy path', () => {
  it('OTP đúng → 200, trả về accessToken + refreshToken + user ACTIVE', async () => {
    const user = await createPendingUser({ email: 'verify@example.com' });
    const { plainOtp } = await createOtpRecord({
      email: 'verify@example.com',
      purpose: 'REGISTER',
      userId: user._id,
    });

    const res = await request(app)
      .post('/api/v1/auth/verify-email')
      .send({ email: 'verify@example.com', otp: plainOtp });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
    expect(res.body.data.user.status).toBe('ACTIVE');
    expect(res.body.data.user.emailVerifiedAt).toBeDefined();
    // passwordHash không được trả về client
    expect(res.body.data.user.passwordHash).toBeUndefined();
  });

  it('OTP đúng → OTP record bị đánh dấu USED', async () => {
    const user = await createPendingUser({ email: 'verify2@example.com' });
    const { record, plainOtp } = await createOtpRecord({
      email: 'verify2@example.com',
      purpose: 'REGISTER',
      userId: user._id,
    });

    await request(app)
      .post('/api/v1/auth/verify-email')
      .send({ email: 'verify2@example.com', otp: plainOtp });

    const updated = await OtpVerification.findById(record._id);
    expect(updated.status).toBe('USED');
    expect(updated.usedAt).not.toBeNull();
  });
});

describe('POST /api/v1/auth/verify-email — error paths', () => {
  it('OTP sai → 400, tăng attempts', async () => {
    const user = await createPendingUser({ email: 'wrong@example.com' });
    const { record } = await createOtpRecord({
      email: 'wrong@example.com',
      purpose: 'REGISTER',
      userId: user._id,
    });

    const res = await request(app)
      .post('/api/v1/auth/verify-email')
      .send({ email: 'wrong@example.com', otp: '000000' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/OTP không đúng/i);

    const updated = await OtpVerification.findById(record._id);
    expect(updated.attempts).toBe(1);
  });

  it('không có OTP active → 400', async () => {
    await createPendingUser({ email: 'noOtp@example.com' });

    const res = await request(app)
      .post('/api/v1/auth/verify-email')
      .send({ email: 'noOtp@example.com', otp: '123456' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/hết hạn/i);
  });

  it('OTP hết hạn → 400', async () => {
    const bcrypt = require('bcryptjs');
    const user = await createPendingUser({ email: 'expired@example.com' });
    const otpHash = await bcrypt.hash('123456', 1);

    await OtpVerification.create({
      email: 'expired@example.com',
      purpose: 'REGISTER',
      otpHash,
      expiresAt: new Date(Date.now() - 1000), // đã hết hạn
      userId: user._id,
      status: 'ACTIVE',
    });

    const res = await request(app)
      .post('/api/v1/auth/verify-email')
      .send({ email: 'expired@example.com', otp: '123456' });

    expect(res.status).toBe(400);
  });
});
