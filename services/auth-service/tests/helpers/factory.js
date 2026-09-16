/**
 * Factory helpers — tạo data mẫu cho test
 */

const bcrypt = require('bcryptjs');
const User = require('../../src/models/User');
const UserSettings = require('../../src/models/UserSettings');
const OtpVerification = require('../../src/models/OtpVerification');
const RefreshToken = require('../../src/models/RefreshToken');

/**
 * Tạo user ACTIVE trong DB (đã xác minh email)
 */
const createActiveUser = async (overrides = {}) => {
  const passwordHash = await bcrypt.hash(overrides.password || 'Password@123', 1);
  const user = await User.create({
    email: overrides.email || 'test@example.com',
    passwordHash,
    displayName: overrides.displayName || 'Test User',
    status: 'ACTIVE',
    emailVerifiedAt: new Date(),
    ...overrides,
    passwordHash, // đảm bảo hash luôn đúng
  });
  return user;
};

/**
 * Tạo user PENDING_VERIFICATION trong DB
 */
const createPendingUser = async (overrides = {}) => {
  const passwordHash = await bcrypt.hash(overrides.password || 'Password@123', 1);
  return User.create({
    email: overrides.email || 'pending@example.com',
    passwordHash,
    displayName: overrides.displayName || 'Pending User',
    status: 'PENDING_VERIFICATION',
    ...overrides,
    passwordHash,
  });
};

/**
 * Tạo OTP record ACTIVE trong DB (OTP thật, không hash)
 * Trả về { record, plainOtp }
 */
const createOtpRecord = async ({ email, purpose = 'REGISTER', userId = null } = {}) => {
  const plainOtp = '123456';
  const otpHash = await bcrypt.hash(plainOtp, 1);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  const record = await OtpVerification.create({
    email,
    purpose,
    otpHash,
    expiresAt,
    userId,
    status: 'ACTIVE',
  });
  return { record, plainOtp };
};

/**
 * Tạo UserSettings cho user
 */
const createSettings = (userId) => UserSettings.create({ userId });

module.exports = {
  createActiveUser,
  createPendingUser,
  createOtpRecord,
  createSettings,
};
