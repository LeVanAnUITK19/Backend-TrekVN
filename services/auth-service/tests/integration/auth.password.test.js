/**
 * Test: Forgot password, Verify reset OTP, Reset password, Change password
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');
const db = require('../setup/db');
const createApp = require('../../src/app');
const { createActiveUser, createOtpRecord } = require('../helpers/factory');

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

const loginAs = async (email, password = 'Pass@123') => {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password });
  return res.body.data;
};

// ─── Forgot password ──────────────────────────────────────────────────────────

describe('POST /api/v1/auth/forgot-password', () => {
  it('email hợp lệ + tồn tại → 200, gửi OTP', async () => {
    const mailer = require('../../src/config/mailer');
    await createActiveUser({ email: 'forgot@example.com' });

    const res = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'forgot@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mailer.sendMail).toHaveBeenCalledTimes(1);
  });

  it('email không tồn tại → vẫn 200 (không tiết lộ)', async () => {
    const mailer = require('../../src/config/mailer');

    const res = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'ghost@example.com' });

    expect(res.status).toBe(200);
    expect(mailer.sendMail).not.toHaveBeenCalled();
  });

  it('email không đúng format → 400', async () => {
    const res = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'not-email' });
    expect(res.status).toBe(400);
  });
});

// ─── Verify reset OTP ─────────────────────────────────────────────────────────

describe('POST /api/v1/auth/verify-reset-otp', () => {
  it('OTP đúng → 200, trả về resetToken', async () => {
    const user = await createActiveUser({ email: 'resetotp@example.com' });
    const { plainOtp } = await createOtpRecord({
      email: 'resetotp@example.com',
      purpose: 'RESET_PASSWORD',
      userId: user._id,
    });

    const res = await request(app)
      .post('/api/v1/auth/verify-reset-otp')
      .send({ email: 'resetotp@example.com', otp: plainOtp });

    expect(res.status).toBe(200);
    expect(res.body.data.resetToken).toBeDefined();

    // Verify token có đúng payload
    const secret = process.env.JWT_RESET_SECRET || process.env.JWT_SECRET + '_reset';
    const decoded = jwt.verify(res.body.data.resetToken, secret);
    expect(decoded.email).toBe('resetotp@example.com');
    expect(decoded.purpose).toBe('RESET_PASSWORD');
  });

  it('OTP sai → 400', async () => {
    const user = await createActiveUser({ email: 'resetwrong@example.com' });
    await createOtpRecord({
      email: 'resetwrong@example.com',
      purpose: 'RESET_PASSWORD',
      userId: user._id,
    });

    const res = await request(app)
      .post('/api/v1/auth/verify-reset-otp')
      .send({ email: 'resetwrong@example.com', otp: '000000' });

    expect(res.status).toBe(400);
  });
});

// ─── Reset password ───────────────────────────────────────────────────────────

describe('POST /api/v1/auth/reset-password', () => {
  const generateResetToken = (email) => {
    const secret = process.env.JWT_RESET_SECRET || process.env.JWT_SECRET + '_reset';
    return jwt.sign({ email, purpose: 'RESET_PASSWORD' }, secret, { expiresIn: '15m' });
  };

  it('resetToken hợp lệ + mật khẩu mới → 200', async () => {
    await createActiveUser({ email: 'resetpw@example.com', password: 'OldPass@123' });
    const resetToken = generateResetToken('resetpw@example.com');

    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ resetToken, newPassword: 'NewPass@456' });

    expect(res.status).toBe(200);
    expect(res.body.data.message).toMatch(/thành công/i);

    // Đăng nhập bằng mật khẩu mới
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'resetpw@example.com', password: 'NewPass@456' });
    expect(loginRes.status).toBe(200);
  });

  it('resetToken hết hạn → 401', async () => {
    const secret = process.env.JWT_RESET_SECRET || process.env.JWT_SECRET + '_reset';
    const expiredToken = jwt.sign(
      { email: 'x@x.com', purpose: 'RESET_PASSWORD' },
      secret,
      { expiresIn: '-1s' }
    );

    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ resetToken: expiredToken, newPassword: 'NewPass@456' });

    expect(res.status).toBe(401);
  });

  it('resetToken giả → 401', async () => {
    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ resetToken: 'fake.token.here', newPassword: 'NewPass@456' });
    expect(res.status).toBe(401);
  });

  it('password < 6 ký tự → 400', async () => {
    const resetToken = generateResetToken('x@x.com');
    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ resetToken, newPassword: '123' });
    expect(res.status).toBe(400);
  });
});

// ─── Change password (yêu cầu đăng nhập) ────────────────────────────────────

describe('PATCH /api/v1/users/me/password', () => {
  it('đổi mật khẩu thành công → 200', async () => {
    await createActiveUser({ email: 'chgpw@example.com', password: 'OldPass@123' });
    const { accessToken } = await loginAs('chgpw@example.com', 'OldPass@123');

    const res = await request(app)
      .patch('/api/v1/users/me/password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ currentPassword: 'OldPass@123', newPassword: 'NewPass@456' });

    expect(res.status).toBe(200);
    expect(res.body.data.message).toMatch(/thành công/i);
  });

  it('mật khẩu hiện tại sai → 400', async () => {
    await createActiveUser({ email: 'chgpwwrong@example.com', password: 'OldPass@123' });
    const { accessToken } = await loginAs('chgpwwrong@example.com', 'OldPass@123');

    const res = await request(app)
      .patch('/api/v1/users/me/password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ currentPassword: 'WrongPass', newPassword: 'NewPass@456' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/hiện tại không đúng/i);
  });

  it('mật khẩu mới trùng cũ → 400', async () => {
    await createActiveUser({ email: 'chgpwsame@example.com', password: 'OldPass@123' });
    const { accessToken } = await loginAs('chgpwsame@example.com', 'OldPass@123');

    const res = await request(app)
      .patch('/api/v1/users/me/password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ currentPassword: 'OldPass@123', newPassword: 'OldPass@123' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/phải khác/i);
  });

  it('không có token → 401', async () => {
    const res = await request(app)
      .patch('/api/v1/users/me/password')
      .send({ currentPassword: 'Old', newPassword: 'New@123' });
    expect(res.status).toBe(401);
  });
});
