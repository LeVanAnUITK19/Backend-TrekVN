'use strict';

const { OAuth2Client } = require('google-auth-library');
const userRepository = require('../repositories/user.repository');
const authIdentityRepository = require('../repositories/authIdentity.repository');
const refreshTokenRepository = require('../repositories/refreshToken.repository');
const { initRankProfile } = require('./gamification.service');
const {
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
} = require('../utils/errors');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

// ─── Google OAuth2 client ─────────────────────────────────────────────────────
// QUAN TRỌNG: Khi Flutter app dùng serverClientId (Web Client ID) để lấy ID Token,
// backend phải verify token với CÙNG Web Client ID đó, KHÔNG PHẢI Android Client ID
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID_WEB || process.env.GOOGLE_CLIENT_ID;

const getGoogleClient = () => {
  if (!GOOGLE_CLIENT_ID) {
    throw new BadRequestError('Google Sign-In chưa được cấu hình');
  }
  return new OAuth2Client(GOOGLE_CLIENT_ID);
};

// ─── Token helpers ────────────────────────────────────────────────────────────
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

// ─── Main: Google Sign-In ─────────────────────────────────────────────────────

/**
 * POST /api/v1/auth/google
 *
 * Flow:
 *   idToken → verify với Google → lấy sub, email, name, picture
 *   → tìm auth_identity provider=GOOGLE, providerUserId=sub
 *     Exists → load User → kiểm tra BLOCKED → issue tokens
 *     Not found:
 *       Email chưa có User → tạo User (ACTIVE) + GOOGLE identity + settings + rank
 *       Email đã có LOCAL User → link GOOGLE identity → issue tokens
 *
 * Không lưu idToken. Không tin userId/email từ client.
 *
 * @param {string} idToken - Google ID Token từ Flutter
 */
const googleSignIn = async (idToken) => {
  if (!idToken) {
    throw new BadRequestError('idToken là bắt buộc');
  }

  // 1. Verify Google ID Token
  const client = getGoogleClient();
  let payload;
  try {
    if (process.env.NODE_ENV === 'development') {
      console.log('[GoogleAuth] Verifying ID Token with Client ID:', GOOGLE_CLIENT_ID.substring(0, 30) + '...');
      console.log('[GoogleAuth] ID Token length:', idToken.length);
      console.log('[GoogleAuth] ID Token preview:', idToken.substring(0, 50) + '...');
    }
    
    const ticket = await client.verifyIdToken({
      idToken,
      audience: GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload();
    
    if (process.env.NODE_ENV === 'development') {
      console.log('[GoogleAuth] Token verified successfully for:', payload.email);
    }
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[GoogleAuth] Token verification failed:', err.message);
    }
    throw new UnauthorizedError('Google ID Token không hợp lệ hoặc đã hết hạn');
  }

  // 2. Extract từ verified payload — KHÔNG tin client gửi
  const {
    sub: googleSub,
    email,
    name: displayName,
    picture: avatarUrl,
    email_verified: emailVerified,
  } = payload;

  if (!email) {
    throw new BadRequestError('Google account không có email');
  }

  // 3. Tìm identity GOOGLE với sub này
  const existingIdentity = await authIdentityRepository.findByProviderAndUserId('GOOGLE', googleSub);

  if (existingIdentity) {
    // Case: đã có identity → load user
    const user = await userRepository.findById(existingIdentity.userId);
    if (!user) {
      throw new UnauthorizedError('Tài khoản không tồn tại');
    }
    if (user.status === 'BLOCKED') {
      throw new ForbiddenError('Tài khoản đã bị khóa');
    }
    if (user.status !== 'ACTIVE') {
      // Kích hoạt nếu đang PENDING_VERIFICATION (chưa verify email nhưng Google đã verify)
      if (emailVerified) {
        await userRepository.updateById(user._id, {
          status: 'ACTIVE',
          passwordHash: null,
          emailVerifiedAt: new Date(),
        });
      } else {
        throw new ForbiddenError('Tài khoản không hợp lệ');
      }
    }
    const freshUser = await userRepository.updateById(user._id, { lastLoginAt: new Date() });
    const accessToken = generateAccessToken(freshUser);
    const refreshToken = await issueRefreshToken(freshUser._id);
    return { accessToken, refreshToken, user: sanitizeUser(freshUser) };
  }

  // 4. Chưa có identity — lookup user theo email
  let user = await userRepository.findByEmail(email);

  if (!user) {
    // CASE 1: email chưa tồn tại → tạo user mới (Google-only, không có passwordHash)
    user = await userRepository.create({
      email,
      displayName: displayName || email.split('@')[0],
      avatarUrl: avatarUrl || null,
      passwordHash: null, // Google-only user
      status: 'ACTIVE',
      emailVerifiedAt: emailVerified ? new Date() : null,
    });

    // Tạo LOCAL identity (không có, chỉ GOOGLE)
    await authIdentityRepository.create({
      userId: user._id,
      provider: 'GOOGLE',
      providerUserId: googleSub,
    });

    // Tạo user settings mặc định
    const existingSettings = await userRepository.findSettingsByUserId(user._id);
    if (!existingSettings) {
      await userRepository.createSettings(user._id);
    }

    // Khởi tạo gamification profile (NEWBIE)
    await initRankProfile(user._id);
  } else {
    // CASE 2: email đã tồn tại → link GOOGLE identity vào user cũ
    if (user.status === 'BLOCKED') {
      throw new ForbiddenError('Tài khoản đã bị khóa');
    }
    // Link GOOGLE identity (upsert chống race condition)
    await authIdentityRepository.upsert(user._id, 'GOOGLE', googleSub);

    // Nếu user PENDING_VERIFICATION và Google đã verify email → activate
    if (user.status === 'PENDING_VERIFICATION' && emailVerified) {
      await userRepository.updateById(user._id, {
        status: 'ACTIVE',
        passwordHash: null,
        emailVerifiedAt: new Date(),
      });
      user = await userRepository.findById(user._id);
    }

    if (user.status !== 'ACTIVE') {
      throw new ForbiddenError('Tài khoản không hợp lệ');
    }
  }

  const freshUser = await userRepository.updateById(user._id, { lastLoginAt: new Date() });
  const accessToken = generateAccessToken(freshUser);
  const refreshToken = await issueRefreshToken(freshUser._id);

  return { accessToken, refreshToken, user: sanitizeUser(freshUser) };
};

module.exports = { googleSignIn };
