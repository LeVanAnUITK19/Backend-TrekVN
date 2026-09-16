const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { authenticate } = require('../middlewares/auth');
const { validate } = require('../middlewares/validate');
const {
  registerSchema,
  verifyEmailSchema,
  resendOtpSchema,
  loginSchema,
  forgotPasswordSchema,
  verifyResetOtpSchema,
  resetPasswordSchema,
} = require('../validators/auth.validator');

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Đăng ký, đăng nhập và quản lý token
 */

// ─── Register flow ────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/v1/auth/register:
 *   post:
 *     summary: Đăng ký tài khoản mới (Bước 1 — gửi OTP)
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, displayName]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: an@gmail.com
 *               password:
 *                 type: string
 *                 minLength: 6
 *                 example: "Abc@1234"
 *               displayName:
 *                 type: string
 *                 example: Nguyễn Văn An
 *     responses:
 *       201:
 *         description: OTP đã được gửi tới email
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               data:
 *                 message: "OTP xác minh đã được gửi đến email của bạn"
 *                 expiresAt: "2024-01-15T08:10:00.000Z"
 *       400:
 *         description: Email đã tồn tại hoặc validation lỗi
 *         content:
 *           application/json:
 *             examples:
 *               emailExists:
 *                 value:
 *                   success: false
 *                   message: "Email đã được sử dụng"
 *               validation:
 *                 value:
 *                   success: false
 *                   message: "Validation error"
 *                   errors: ["\"email\" must be a valid email"]
 */
router.post('/register', validate(registerSchema), authController.register);

/**
 * @swagger
 * /api/v1/auth/verify-email:
 *   post:
 *     summary: Xác minh OTP đăng ký (Bước 2) — trả về token nếu thành công
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, otp]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: an@gmail.com
 *               otp:
 *                 type: string
 *                 example: "482910"
 *     responses:
 *       200:
 *         description: Xác minh thành công, tài khoản được kích hoạt
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               data:
 *                 accessToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *                 refreshToken: "a3f9b2c1d4e5..."
 *                 user:
 *                   userId: "64f1a2b3c4d5e6f7a8b9c0d1"
 *                   email: "an@gmail.com"
 *                   displayName: "Nguyễn Văn An"
 *                   status: "ACTIVE"
 *                   emailVerifiedAt: "2024-01-15T08:05:00.000Z"
 *       400:
 *         description: OTP không đúng hoặc đã hết hạn
 *         content:
 *           application/json:
 *             examples:
 *               wrong:
 *                 value:
 *                   success: false
 *                   message: "OTP không đúng. Còn 4 lần thử"
 *               expired:
 *                 value:
 *                   success: false
 *                   message: "OTP không hợp lệ hoặc đã hết hạn"
 *       429:
 *         description: Vượt quá số lần thử
 *         content:
 *           application/json:
 *             example:
 *               success: false
 *               message: "Vượt quá số lần thử. Vui lòng yêu cầu OTP mới"
 */
router.post('/verify-email', validate(verifyEmailSchema), authController.verifyEmail);

/**
 * @swagger
 * /api/v1/auth/resend-verification-otp:
 *   post:
 *     summary: Gửi lại OTP xác minh email
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: an@gmail.com
 *     responses:
 *       200:
 *         description: OTP đã được gửi lại
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               data:
 *                 message: "OTP đã được gửi lại"
 *                 expiresAt: "2024-01-15T08:15:00.000Z"
 *       400:
 *         description: Email đã được xác minh rồi
 *         content:
 *           application/json:
 *             example:
 *               success: false
 *               message: "Email đã được xác minh"
 *       404:
 *         description: Email không tồn tại
 *         content:
 *           application/json:
 *             example:
 *               success: false
 *               message: "Email không tồn tại trong hệ thống"
 */
router.post('/resend-verification-otp', validate(resendOtpSchema), authController.resendVerificationOtp);

// ─── Login / Token ────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/v1/auth/login:
 *   post:
 *     summary: Đăng nhập vào hệ thống
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: an@gmail.com
 *               password:
 *                 type: string
 *                 example: "Abc@1234"
 *     responses:
 *       200:
 *         description: Đăng nhập thành công
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               data:
 *                 accessToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *                 refreshToken: "a3f9b2c1d4e5..."
 *                 user:
 *                   userId: "64f1a2b3c4d5e6f7a8b9c0d1"
 *                   email: "an@gmail.com"
 *                   displayName: "Nguyễn Văn An"
 *                   role: "USER"
 *                   status: "ACTIVE"
 *       401:
 *         description: Sai email hoặc mật khẩu
 *         content:
 *           application/json:
 *             example:
 *               success: false
 *               message: "Email hoặc mật khẩu không đúng"
 *       403:
 *         description: Tài khoản chưa xác minh hoặc bị khóa
 *         content:
 *           application/json:
 *             examples:
 *               notVerified:
 *                 value:
 *                   success: false
 *                   message: "Tài khoản chưa được xác minh email"
 *               suspended:
 *                 value:
 *                   success: false
 *                   message: "Tài khoản đã bị khóa"
 */
router.post('/login', validate(loginSchema), authController.login);

/**
 * @swagger
 * /api/v1/auth/refresh:
 *   post:
 *     summary: Cấp accessToken mới (Refresh Token Rotation)
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken:
 *                 type: string
 *                 example: "a3f9b2c1d4e5..."
 *     responses:
 *       200:
 *         description: Token mới được cấp (token cũ bị revoke)
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               data:
 *                 accessToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *                 refreshToken: "b4g0c3d5e6f7..."
 *       401:
 *         description: Refresh token không hợp lệ hoặc đã hết hạn
 *         content:
 *           application/json:
 *             example:
 *               success: false
 *               message: "Refresh token không hợp lệ hoặc đã hết hạn"
 */
router.post('/refresh', authController.refresh);

/**
 * @swagger
 * /api/v1/auth/logout:
 *   post:
 *     summary: Đăng xuất — revoke refresh token hiện tại
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               refreshToken:
 *                 type: string
 *                 description: Nếu không cung cấp, toàn bộ sessions sẽ bị revoke
 *                 example: "a3f9b2c1d4e5..."
 *     responses:
 *       200:
 *         description: Đăng xuất thành công
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: "Đăng xuất thành công"
 *       401:
 *         description: Chưa xác thực
 *         content:
 *           application/json:
 *             example:
 *               success: false
 *               message: "Authorization token required"
 */
router.post('/logout', authenticate, authController.logout);

/**
 * @swagger
 * /api/v1/auth/verify:
 *   get:
 *     summary: Xác thực accessToken (dùng nội bộ bởi API Gateway)
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Token hợp lệ
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               data:
 *                 id: "64f1a2b3c4d5e6f7a8b9c0d1"
 *                 email: "an@gmail.com"
 *                 role: "USER"
 *                 iat: 1700000000
 *                 exp: 1700000900
 *       401:
 *         description: Token không hợp lệ
 *         content:
 *           application/json:
 *             example:
 *               success: false
 *               message: "Token không hợp lệ hoặc đã hết hạn"
 */
router.get('/verify', authController.verifyToken);

// ─── Password Reset flow ──────────────────────────────────────────────────────

/**
 * @swagger
 * /api/v1/auth/forgot-password:
 *   post:
 *     summary: Yêu cầu OTP để reset mật khẩu (Bước 1)
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: an@gmail.com
 *     responses:
 *       200:
 *         description: Phản hồi luôn thành công (không tiết lộ email tồn tại hay không)
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               data:
 *                 message: "Nếu email tồn tại, OTP sẽ được gửi đến hộp thư của bạn"
 *                 expiresAt: "2024-01-15T08:10:00.000Z"
 */
router.post('/forgot-password', validate(forgotPasswordSchema), authController.forgotPassword);

/**
 * @swagger
 * /api/v1/auth/verify-reset-otp:
 *   post:
 *     summary: Xác minh OTP reset password (Bước 2) — trả về resetToken
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, otp]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: an@gmail.com
 *               otp:
 *                 type: string
 *                 example: "193847"
 *     responses:
 *       200:
 *         description: OTP hợp lệ, trả về resetToken (hiệu lực 15 phút)
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               data:
 *                 resetToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *       400:
 *         description: OTP không đúng hoặc hết hạn
 *         content:
 *           application/json:
 *             example:
 *               success: false
 *               message: "OTP không hợp lệ hoặc đã hết hạn"
 */
router.post('/verify-reset-otp', validate(verifyResetOtpSchema), authController.verifyResetOtp);

/**
 * @swagger
 * /api/v1/auth/reset-password:
 *   post:
 *     summary: Đặt mật khẩu mới bằng resetToken (Bước 3)
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [resetToken, newPassword]
 *             properties:
 *               resetToken:
 *                 type: string
 *                 example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *               newPassword:
 *                 type: string
 *                 minLength: 6
 *                 example: "NewPass@456"
 *     responses:
 *       200:
 *         description: Mật khẩu đã được đặt lại thành công
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               data:
 *                 message: "Mật khẩu đã được đặt lại thành công"
 *       401:
 *         description: Reset token không hợp lệ hoặc đã hết hạn
 *         content:
 *           application/json:
 *             example:
 *               success: false
 *               message: "Reset token không hợp lệ hoặc đã hết hạn"
 */
router.post('/reset-password', validate(resetPasswordSchema), authController.resetPassword);

module.exports = router;
