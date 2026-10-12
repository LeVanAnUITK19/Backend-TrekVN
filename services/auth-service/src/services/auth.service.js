const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const userRepository = require('../repositories/user.repository');
const refreshTokenRepository = require('../repositories/refreshToken.repository');
const otpRepository = require('../repositories/otp.repository');
const otpService = require('./otp.service');
const PasswordResetToken = require('../models/PasswordResetToken');
const {
  BadRequestError,
  UnauthorizedError,
  NotFoundError,
  ForbiddenError,
  TooManyRequestsError,
} = require('../utils/errors');
const { initRankProfile } = require('./gamification.service');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const generateAccessToken = (user) =>
  jwt.sign(
    { id: user._id, email: user.email, role: user.role, tokenVersion: user.tokenVersion || 0 },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '15m' }
  );

const hashToken = (token) =>
  crypto.createHash('sha256').update(token).digest('hex');

const issueRefreshToken = async (userId) => {
  const token = crypto.randomBytes(40).toString('hex');
  const tokenHash = hashToken(token);
  const days = parseInt(process.env.JWT_REFRESH_EXPIRES_DAYS) || 30;
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  await refreshTokenRepository.create(userId, tokenHash, expiresAt);
  return token;
};

const sanitizeUser = (user) => (user.toJSON ? user.toJSON() : user);

// ─── Register (Bước 1: gửi OTP) ───────────────────────────────────────────────

const register = async ({ email, password, displayName }) => {
  const existing = await userRepository.findByEmail(email);
  if (existing && existing.status !== 'PENDING_VERIFICATION') {
    throw new BadRequestError('Email đã được sử dụng');
  }
  // Nếu đã có user PENDING trước đó → gửi lại OTP, không tạo user mới
  if (!existing) {
    const rounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
    const passwordHash = await bcrypt.hash(password, rounds);
    await userRepository.create({ email, passwordHash, displayName });
  }

  const { expiresAt } = await otpService.sendOtp(email, 'REGISTER');
  return { message: 'OTP xác minh đã được gửi đến email của bạn', expiresAt };
};

// ─── Verify Email (Bước 2: xác minh OTP) ─────────────────────────────────────

const verifyEmail = async ({ email, otp }) => {
  await otpService.verifyOtp(email, 'REGISTER', otp);

  const user = await userRepository.findByEmail(email);
  if (!user) {
    throw new NotFoundError('Người dùng không tồn tại');
  }

  if (user.status !== 'PENDING_VERIFICATION') {
    throw new ForbiddenError('Tài khoản không ở trạng thái chờ xác minh');
  }

  const updatedUser = await userRepository.updateById(user._id, {
    status: 'ACTIVE',
    emailVerifiedAt: new Date(),
  });

  // Tạo settings mặc định
  const existingSettings = await userRepository.findSettingsByUserId(user._id);
  if (!existingSettings) {
    await userRepository.createSettings(user._id);
  }

  // Khởi tạo gamification profile (rank NEWBIE)
  await initRankProfile(user._id);

  const accessToken = generateAccessToken(updatedUser);
  const refreshToken = await issueRefreshToken(updatedUser._id);

  return { accessToken, refreshToken, user: sanitizeUser(updatedUser) };
};

// ─── Resend Verification OTP ──────────────────────────────────────────────────

const resendVerificationOtp = async ({ email }) => {
  const user = await userRepository.findByEmail(email);
  if (!user) {
    throw new NotFoundError('Email không tồn tại trong hệ thống');
  }
  if (user.status !== 'PENDING_VERIFICATION') {
    throw new BadRequestError('Tài khoản không ở trạng thái chờ xác minh');
  }

  // Chống spam: chỉ cho gửi lại khi OTP hiện tại đã hết hạn
  const existingOtp = await otpRepository.findActive(email, 'REGISTER');
  if (existingOtp) {
    const secondsLeft = Math.ceil((new Date(existingOtp.expiresAt) - Date.now()) / 1000);
    throw new TooManyRequestsError(
      `Vui lòng chờ ${secondsLeft} giây trước khi gửi lại OTP`
    );
  }

  const { expiresAt } = await otpService.sendOtp(email, 'REGISTER');
  return { message: 'OTP đã được gửi lại', expiresAt };
};

// ─── Login ────────────────────────────────────────────────────────────────────

const login = async ({ email, password }) => {
  const user = await userRepository.findByEmail(email);
  if (!user) {
    throw new UnauthorizedError('Email hoặc mật khẩu không đúng');
  }

  if (user.status === 'PENDING_VERIFICATION') {
    throw new ForbiddenError('Tài khoản chưa được xác minh email');
  }
  if (user.status === 'BLOCKED') {
    throw new ForbiddenError('Tài khoản đã bị khóa');
  }
  if (user.status !== 'ACTIVE') {
    throw new ForbiddenError('Tài khoản không hợp lệ');
  }

  // Tài khoản Google-only không có passwordHash
  if (!user.passwordHash) {
    throw new ForbiddenError('Tài khoản này đăng nhập bằng Google. Vui lòng dùng Google Sign-In.');
  }

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) {
    throw new UnauthorizedError('Email hoặc mật khẩu không đúng');
  }

  await userRepository.updateById(user._id, { lastLoginAt: new Date() });

  const accessToken = generateAccessToken(user);
  const refreshToken = await issueRefreshToken(user._id);

  return { accessToken, refreshToken, user: sanitizeUser(user) };
};

// ─── Refresh Token ────────────────────────────────────────────────────────────

const refresh = async (rawToken) => {
  if (!rawToken) {
    throw new UnauthorizedError('Refresh token bắt buộc');
  }

  const tokenHash = hashToken(rawToken);
  const record = await refreshTokenRepository.consumeByHash(tokenHash);
  if (!record) {
    throw new UnauthorizedError('Refresh token không hợp lệ hoặc đã hết hạn');
  }

  // The old token was consumed atomically before issuing a replacement.
  const user = await userRepository.findById(record.userId);
  if (!user || user.status !== 'ACTIVE') {
    throw new UnauthorizedError('Tài khoản không hợp lệ hoặc đã bị khóa');
  }

  const accessToken = generateAccessToken(user);
  const newRefreshToken = await issueRefreshToken(user._id);

  return { accessToken, refreshToken: newRefreshToken };
};

// ─── Logout ───────────────────────────────────────────────────────────────────

const logout = async (userId, rawRefreshToken) => {
  if (rawRefreshToken) {
    const tokenHash = hashToken(rawRefreshToken);
    await refreshTokenRepository.revokeByHash(tokenHash);
  } else if (userId) {
    // Nếu không có rawRefreshToken thì revoke tất cả thiết bị
    await refreshTokenRepository.revokeAllByUserId(userId);
  }
};

// ─── Verify Token (dùng bởi API Gateway) ──────────────────────────────────────

const verifyToken = (token) => {
  if (!token) {
    throw new UnauthorizedError('Token bắt buộc');
  }
  try {
    return jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
  } catch {
    throw new UnauthorizedError('Token không hợp lệ hoặc đã hết hạn');
  }
};

// ─── Forgot Password (Bước 1: gửi OTP) ───────────────────────────────────────

const forgotPassword = async ({ email }) => {
  const user = await userRepository.findByEmail(email);
  // Không tiết lộ email có tồn tại hay không (security best practice)
  if (!user || user.status !== 'ACTIVE') {
    return { message: 'Nếu email tồn tại, OTP sẽ được gửi đến hộp thư của bạn' };
  }

  const { expiresAt } = await otpService.sendOtp(email, 'RESET_PASSWORD', user._id);
  return { message: 'Nếu email tồn tại, OTP sẽ được gửi đến hộp thư của bạn', expiresAt };
};

// ─── Verify Reset OTP (Bước 2: xác minh OTP, nhận reset token) ───────────────

const verifyResetOtp = async ({ email, otp }) => {
  await otpService.verifyOtp(email, 'RESET_PASSWORD', otp);
  const user = await userRepository.findByEmail(email);
  if (!user || user.status !== 'ACTIVE') {
    throw new UnauthorizedError('Tài khoản không hợp lệ hoặc đã bị khóa');
  }

  // Phát reset token ngắn hạn (15 phút), ký bằng secret riêng
  const resetToken = jwt.sign(
    { email, purpose: 'RESET_PASSWORD' },
    process.env.JWT_RESET_SECRET || process.env.JWT_SECRET + '_reset',
    { expiresIn: '15m', jwtid: crypto.randomBytes(16).toString('hex') }
  );

  await PasswordResetToken.create({
    userId: user._id, tokenHash: hashToken(resetToken),
    expiresAt: new Date(Date.now() + 15 * 60 * 1000),
  });

  return { resetToken };
};

// ─── Reset Password (Bước 3: đặt mật khẩu mới) ───────────────────────────────

const resetPassword = async ({ resetToken, newPassword }) => {
  let decoded;
  try {
    decoded = jwt.verify(
      resetToken,
      process.env.JWT_RESET_SECRET || process.env.JWT_SECRET + '_reset',
      { algorithms: ['HS256'] }
    );
  } catch {
    throw new UnauthorizedError('Reset token không hợp lệ hoặc đã hết hạn');
  }

  if (decoded.purpose !== 'RESET_PASSWORD') {
    throw new UnauthorizedError('Reset token không hợp lệ');
  }

  const user = await userRepository.findByEmail(decoded.email);
  if (!user) {
    throw new NotFoundError('Người dùng không tồn tại');
  }
  if (user.status !== 'ACTIVE') {
    throw new UnauthorizedError('Tài khoản không hợp lệ hoặc đã bị khóa');
  }

  const rounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
  const passwordHash = await bcrypt.hash(newPassword, rounds);

  const consumed = await PasswordResetToken.findOneAndDelete({
    tokenHash: hashToken(resetToken), userId: user._id, expiresAt: { $gt: new Date() },
  });
  if (!consumed) {
    throw new UnauthorizedError('Reset token đã được sử dụng hoặc không hợp lệ');
  }

  await userRepository.updateById(user._id, { passwordHash, $inc: { tokenVersion: 1 } });

  // Revoke tất cả refresh token khi đổi mật khẩu
  await refreshTokenRepository.revokeAllByUserId(user._id);

  return { message: 'Mật khẩu đã được đặt lại thành công' };
};

// ─── Change Password (khi đang đăng nhập) ────────────────────────────────────

const changePassword = async (userId, { currentPassword, newPassword }) => {
  const user = await userRepository.findById(userId);
  if (!user) {
    throw new NotFoundError('Người dùng không tồn tại');
  }

  const match = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!match) {
    throw new BadRequestError('Mật khẩu hiện tại không đúng');
  }

  if (currentPassword === newPassword) {
    throw new BadRequestError('Mật khẩu mới phải khác mật khẩu hiện tại');
  }

  const rounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
  const passwordHash = await bcrypt.hash(newPassword, rounds);

  await userRepository.updateById(userId, { passwordHash, $inc: { tokenVersion: 1 } });

  // Revoke tất cả refresh token trừ session hiện tại (bảo mật)
  await refreshTokenRepository.revokeAllByUserId(userId);

  return { message: 'Đổi mật khẩu thành công. Vui lòng đăng nhập lại' };
};

// ─── Profile ──────────────────────────────────────────────────────────────────

const getProfile = async (userId) => {
  const user = await userRepository.findById(userId);
  if (!user) {
    throw new NotFoundError('Người dùng không tồn tại');
  }
  return sanitizeUser(user);
};

const updateProfile = async (userId, data) => {
  const allowed = {};
  if (data.displayName !== undefined) {
    allowed.displayName = data.displayName;
  }
  if (data.avatarUrl !== undefined) {
    allowed.avatarUrl = data.avatarUrl;
  }
  if (data.bio !== undefined) {
    allowed.bio = data.bio;
  }

  const user = await userRepository.updateById(userId, allowed);
  if (!user) {
    throw new NotFoundError('Người dùng không tồn tại');
  }
  return sanitizeUser(user);
};

// ─── Settings ─────────────────────────────────────────────────────────────────

const getSettings = async (userId) => {
  let settings = await userRepository.findSettingsByUserId(userId);
  if (!settings) {
    settings = await userRepository.createSettings(userId);
  }
  return settings;
};

const updateSettings = async (userId, data) => {
  let settings = await userRepository.updateSettings(userId, data);
  if (!settings) {
    await userRepository.createSettings(userId);
    settings = await userRepository.updateSettings(userId, data);
  }
  return settings;
};

module.exports = {
  register,
  verifyEmail,
  resendVerificationOtp,
  login,
  refresh,
  logout,
  verifyToken,
  forgotPassword,
  verifyResetOtp,
  resetPassword,
  changePassword,
  getProfile,
  updateProfile,
  getSettings,
  updateSettings,
};
