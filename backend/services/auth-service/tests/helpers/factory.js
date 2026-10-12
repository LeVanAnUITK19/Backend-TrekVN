/**
 * Factory helpers — tạo data mẫu cho test
 */

const bcrypt = require('bcryptjs');
const User = require('../../src/models/User');
const UserSettings = require('../../src/models/UserSettings');
const OtpVerification = require('../../src/models/OtpVerification');
/**
 * Tạo user ACTIVE trong DB (đã xác minh email)
 */
const createActiveUser = async (overrides = {}) => {
  const hash = await bcrypt.hash(overrides.password || 'Password@123', 1);
  const { password: _password, ...rest } = overrides;
  const user = await User.create({
    email: rest.email || 'test@example.com',
    passwordHash: hash,
    displayName: rest.displayName || 'Test User',
    status: 'ACTIVE',
    emailVerifiedAt: new Date(),
    ...rest,
  });
  return user;
};

/**
 * Tạo user PENDING_VERIFICATION trong DB
 */
const createPendingUser = async (overrides = {}) => {
  const hash = await bcrypt.hash(overrides.password || 'Password@123', 1);
  const { password: _password, ...rest } = overrides;
  return User.create({
    email: rest.email || 'pending@example.com',
    passwordHash: hash,
    displayName: rest.displayName || 'Pending User',
    status: 'PENDING_VERIFICATION',
    ...rest,
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
