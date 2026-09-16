/**
 * Unit test: auth.service.js
 *
 * Mock toàn bộ dependencies (repositories, otpService) để test business logic
 * độc lập, không cần DB kết nối thật.
 */

const jwt = require('jsonwebtoken');

// ─── Mock dependencies trước khi require service ──────────────────────────────

jest.mock('../../src/repositories/user.repository');
jest.mock('../../src/repositories/refreshToken.repository');
jest.mock('../../src/services/otp.service');

const userRepo = require('../../src/repositories/user.repository');
const refreshTokenRepo = require('../../src/repositories/refreshToken.repository');
const otpService = require('../../src/services/otp.service');
const authService = require('../../src/services/auth.service');
const {
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
} = require('../../src/utils/errors');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const makeUser = (overrides = {}) => ({
  _id: 'user-id-123',
  email: 'test@example.com',
  passwordHash: '$2a$01$hashedpassword',
  displayName: 'Test User',
  role: 'USER',
  status: 'ACTIVE',
  toJSON() { return { ...this }; },
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── register ─────────────────────────────────────────────────────────────────

describe('authService.register', () => {
  it('email chưa tồn tại → tạo user mới + gửi OTP', async () => {
    userRepo.findByEmail.mockResolvedValue(null);
    userRepo.create.mockResolvedValue(makeUser());
    otpService.sendOtp.mockResolvedValue({ expiresAt: new Date() });

    const result = await authService.register({
      email: 'new@example.com',
      password: 'Pass@123',
      displayName: 'New User',
    });

    expect(userRepo.create).toHaveBeenCalledTimes(1);
    expect(otpService.sendOtp).toHaveBeenCalledWith('new@example.com', 'REGISTER');
    expect(result.message).toMatch(/OTP/i);
  });

  it('email PENDING → không tạo user mới, gửi lại OTP', async () => {
    userRepo.findByEmail.mockResolvedValue(makeUser({ status: 'PENDING_VERIFICATION' }));
    otpService.sendOtp.mockResolvedValue({ expiresAt: new Date() });

    await authService.register({
      email: 'pending@example.com',
      password: 'Pass@123',
      displayName: 'Pending',
    });

    expect(userRepo.create).not.toHaveBeenCalled();
    expect(otpService.sendOtp).toHaveBeenCalledTimes(1);
  });

  it('email ACTIVE → ném BadRequestError', async () => {
    userRepo.findByEmail.mockResolvedValue(makeUser({ status: 'ACTIVE' }));

    await expect(
      authService.register({ email: 'active@example.com', password: 'Pass@123', displayName: 'X' })
    ).rejects.toBeInstanceOf(BadRequestError);
  });
});

// ─── login ────────────────────────────────────────────────────────────────────

describe('authService.login', () => {
  it('email không tồn tại → UnauthorizedError', async () => {
    userRepo.findByEmail.mockResolvedValue(null);

    await expect(
      authService.login({ email: 'ghost@example.com', password: 'Pass@123' })
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('status PENDING → ForbiddenError', async () => {
    userRepo.findByEmail.mockResolvedValue(makeUser({ status: 'PENDING_VERIFICATION' }));

    await expect(
      authService.login({ email: 'x@x.com', password: 'Pass@123' })
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('status SUSPENDED → ForbiddenError', async () => {
    userRepo.findByEmail.mockResolvedValue(makeUser({ status: 'SUSPENDED' }));

    await expect(
      authService.login({ email: 'x@x.com', password: 'Pass@123' })
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

// ─── refresh ──────────────────────────────────────────────────────────────────

describe('authService.refresh', () => {
  it('thiếu rawToken → UnauthorizedError', async () => {
    await expect(authService.refresh(undefined)).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(authService.refresh('')).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('token không tìm thấy trong DB → UnauthorizedError', async () => {
    refreshTokenRepo.findByHash.mockResolvedValue(null);
    await expect(authService.refresh('fake-raw-token')).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('user bị SUSPENDED → UnauthorizedError', async () => {
    refreshTokenRepo.findByHash.mockResolvedValue({ userId: 'uid' });
    refreshTokenRepo.revokeByHash.mockResolvedValue(null);
    userRepo.findById.mockResolvedValue(makeUser({ status: 'SUSPENDED' }));

    await expect(authService.refresh('some-token')).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

// ─── verifyToken ──────────────────────────────────────────────────────────────

describe('authService.verifyToken', () => {
  it('token hợp lệ → trả về decoded payload', () => {
    const token = jwt.sign(
      { id: 'uid', email: 'a@b.com', role: 'USER' },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    const decoded = authService.verifyToken(token);
    expect(decoded.email).toBe('a@b.com');
    expect(decoded.role).toBe('USER');
  });

  it('thiếu token → UnauthorizedError', () => {
    expect(() => authService.verifyToken(undefined)).toThrow(UnauthorizedError);
    expect(() => authService.verifyToken('')).toThrow(UnauthorizedError);
  });

  it('token sai chữ ký → UnauthorizedError', () => {
    const badToken = jwt.sign({ id: 'x' }, 'wrong-secret');
    expect(() => authService.verifyToken(badToken)).toThrow(UnauthorizedError);
  });

  it('token hết hạn → UnauthorizedError', () => {
    const expiredToken = jwt.sign({ id: 'x' }, process.env.JWT_SECRET, { expiresIn: '-1s' });
    expect(() => authService.verifyToken(expiredToken)).toThrow(UnauthorizedError);
  });
});

// ─── forgotPassword ───────────────────────────────────────────────────────────

describe('authService.forgotPassword', () => {
  it('email không tồn tại → trả về message mà không gửi OTP', async () => {
    userRepo.findByEmail.mockResolvedValue(null);

    const result = await authService.forgotPassword({ email: 'ghost@x.com' });

    expect(otpService.sendOtp).not.toHaveBeenCalled();
    expect(result.message).toMatch(/Nếu email tồn tại/i);
  });

  it('email tồn tại + ACTIVE → gửi OTP', async () => {
    userRepo.findByEmail.mockResolvedValue(makeUser({ status: 'ACTIVE' }));
    otpService.sendOtp.mockResolvedValue({ expiresAt: new Date() });

    const result = await authService.forgotPassword({ email: 'found@x.com' });

    expect(otpService.sendOtp).toHaveBeenCalledWith('found@x.com', 'RESET_PASSWORD', 'user-id-123');
    expect(result.expiresAt).toBeDefined();
  });
});

// ─── changePassword ───────────────────────────────────────────────────────────

describe('authService.changePassword', () => {
  it('user không tồn tại → NotFoundError', async () => {
    userRepo.findById.mockResolvedValue(null);

    await expect(
      authService.changePassword('uid', { currentPassword: 'old', newPassword: 'new' })
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('mật khẩu mới trùng cũ → BadRequestError', async () => {
    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash('Same@123', 1);
    userRepo.findById.mockResolvedValue(makeUser({ passwordHash: hash }));

    await expect(
      authService.changePassword('uid', { currentPassword: 'Same@123', newPassword: 'Same@123' })
    ).rejects.toBeInstanceOf(BadRequestError);
  });
});

// ─── getProfile ───────────────────────────────────────────────────────────────

describe('authService.getProfile', () => {
  it('user không tồn tại → NotFoundError', async () => {
    userRepo.findById.mockResolvedValue(null);
    await expect(authService.getProfile('bad-id')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('user tồn tại → trả về sanitized user', async () => {
    userRepo.findById.mockResolvedValue(makeUser());
    const profile = await authService.getProfile('user-id-123');
    expect(profile.email).toBe('test@example.com');
  });
});
