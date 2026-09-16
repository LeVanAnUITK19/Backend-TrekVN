/**
 * Unit test: otp.service.js
 */

jest.mock('../../src/repositories/otp.repository');
jest.mock('../../src/config/mailer', () => ({
  sendMail: jest.fn().mockResolvedValue({ messageId: 'mock-id' }),
}));

const otpRepo = require('../../src/repositories/otp.repository');
const mailer = require('../../src/config/mailer');
const otpService = require('../../src/services/otp.service');
const { BadRequestError, TooManyRequestsError } = require('../../src/utils/errors');

const bcrypt = require('bcryptjs');

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── sendOtp ──────────────────────────────────────────────────────────────────

describe('otpService.sendOtp', () => {
  it('tạo OTP và gửi email thành công', async () => {
    otpRepo.revokeAllActive.mockResolvedValue({});
    otpRepo.create.mockResolvedValue({});

    const result = await otpService.sendOtp('user@example.com', 'REGISTER');

    expect(otpRepo.revokeAllActive).toHaveBeenCalledWith('user@example.com', 'REGISTER');
    expect(otpRepo.create).toHaveBeenCalledTimes(1);
    expect(mailer.sendMail).toHaveBeenCalledTimes(1);
    expect(result.expiresAt).toBeInstanceOf(Date);
  });

  it('gửi email thất bại → không ném lỗi (vẫn trả về expiresAt)', async () => {
    otpRepo.revokeAllActive.mockResolvedValue({});
    otpRepo.create.mockResolvedValue({});
    mailer.sendMail.mockRejectedValue(new Error('SMTP down'));

    await expect(
      otpService.sendOtp('fail@example.com', 'REGISTER')
    ).resolves.toBeDefined();
  });

  it('purpose không hợp lệ → ném Error', async () => {
    otpRepo.revokeAllActive.mockResolvedValue({});
    otpRepo.create.mockResolvedValue({});

    await expect(
      otpService.sendOtp('x@x.com', 'UNKNOWN_PURPOSE')
    ).rejects.toThrow();
  });
});

// ─── verifyOtp ────────────────────────────────────────────────────────────────

describe('otpService.verifyOtp', () => {
  it('không có record active → BadRequestError', async () => {
    otpRepo.findActive.mockResolvedValue(null);

    await expect(
      otpService.verifyOtp('x@x.com', 'REGISTER', '123456')
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('vượt quá MAX_ATTEMPTS → TooManyRequestsError + revoke', async () => {
    otpRepo.findActive.mockResolvedValue({ _id: 'otp-id', attempts: 5, otpHash: 'hash' });
    otpRepo.revokeAllActive.mockResolvedValue({});

    await expect(
      otpService.verifyOtp('x@x.com', 'REGISTER', '123456')
    ).rejects.toBeInstanceOf(TooManyRequestsError);

    expect(otpRepo.revokeAllActive).toHaveBeenCalled();
  });

  it('OTP sai → BadRequestError + tăng attempts', async () => {
    const realHash = await bcrypt.hash('654321', 1);
    otpRepo.findActive.mockResolvedValue({ _id: 'otp-id', attempts: 0, otpHash: realHash });
    otpRepo.incrementAttempts.mockResolvedValue({});

    await expect(
      otpService.verifyOtp('x@x.com', 'REGISTER', '000000')
    ).rejects.toBeInstanceOf(BadRequestError);

    expect(otpRepo.incrementAttempts).toHaveBeenCalledWith('otp-id');
  });

  it('OTP đúng → markUsed được gọi, trả về record', async () => {
    const realHash = await bcrypt.hash('123456', 1);
    const record = { _id: 'otp-id', attempts: 0, otpHash: realHash };
    otpRepo.findActive.mockResolvedValue(record);
    otpRepo.markUsed.mockResolvedValue({ ...record, status: 'USED' });

    const result = await otpService.verifyOtp('x@x.com', 'REGISTER', '123456');

    expect(otpRepo.markUsed).toHaveBeenCalledWith('otp-id');
    expect(result).toEqual(record);
  });
});
