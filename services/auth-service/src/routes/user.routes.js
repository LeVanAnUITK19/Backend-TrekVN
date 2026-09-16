const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { authenticate } = require('../middlewares/auth');
const { validate } = require('../middlewares/validate');
const {
  updateProfileSchema,
  updateSettingsSchema,
  changePasswordSchema,
} = require('../validators/auth.validator');

/**
 * @swagger
 * tags:
 *   name: Users
 *   description: Quản lý profile và settings của người dùng
 */

/**
 * @swagger
 * /api/v1/users/me:
 *   get:
 *     summary: Lấy thông tin profile của user hiện tại
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Thông tin profile
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               data:
 *                 userId: "64f1a2b3c4d5e6f7a8b9c0d1"
 *                 email: "an@gmail.com"
 *                 displayName: "Nguyễn Văn An"
 *                 avatarUrl: "https://example.com/avatar.jpg"
 *                 bio: "Yêu thích leo núi và khám phá"
 *                 role: "USER"
 *                 status: "ACTIVE"
 *                 emailVerifiedAt: "2024-01-15T08:05:00.000Z"
 *                 createdAt: "2024-01-15T08:00:00.000Z"
 *                 updatedAt: "2024-01-15T08:00:00.000Z"
 *       401:
 *         description: Chưa xác thực
 *         content:
 *           application/json:
 *             example:
 *               success: false
 *               message: "Authorization token required"
 */
router.get('/me', authenticate, authController.getMe);

/**
 * @swagger
 * /api/v1/users/me:
 *   patch:
 *     summary: Cập nhật profile
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               displayName:
 *                 type: string
 *                 example: "Nguyễn Văn An (updated)"
 *               avatarUrl:
 *                 type: string
 *                 format: uri
 *                 example: "https://example.com/new-avatar.jpg"
 *               bio:
 *                 type: string
 *                 example: "Yêu thích trekking và thiên nhiên Việt Nam"
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               data:
 *                 userId: "64f1a2b3c4d5e6f7a8b9c0d1"
 *                 email: "an@gmail.com"
 *                 displayName: "Nguyễn Văn An (updated)"
 *                 avatarUrl: "https://example.com/new-avatar.jpg"
 *                 bio: "Yêu thích trekking và thiên nhiên Việt Nam"
 *                 role: "USER"
 *                 status: "ACTIVE"
 *       400:
 *         description: Validation lỗi
 *         content:
 *           application/json:
 *             example:
 *               success: false
 *               message: "Validation error"
 *               errors: ["\"displayName\" length must be at least 2 characters long"]
 */
router.patch('/me', authenticate, validate(updateProfileSchema), authController.updateMe);

/**
 * @swagger
 * /api/v1/users/me/password:
 *   patch:
 *     summary: Đổi mật khẩu khi đang đăng nhập
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword]
 *             properties:
 *               currentPassword:
 *                 type: string
 *                 example: "Abc@1234"
 *               newPassword:
 *                 type: string
 *                 minLength: 6
 *                 example: "NewPass@456"
 *     responses:
 *       200:
 *         description: Đổi mật khẩu thành công, toàn bộ sessions bị revoke
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               data:
 *                 message: "Đổi mật khẩu thành công. Vui lòng đăng nhập lại"
 *       400:
 *         description: Mật khẩu hiện tại sai hoặc mật khẩu mới trùng cũ
 *         content:
 *           application/json:
 *             examples:
 *               wrongCurrent:
 *                 value:
 *                   success: false
 *                   message: "Mật khẩu hiện tại không đúng"
 *               samePassword:
 *                 value:
 *                   success: false
 *                   message: "Mật khẩu mới phải khác mật khẩu hiện tại"
 *       401:
 *         description: Chưa xác thực
 *         content:
 *           application/json:
 *             example:
 *               success: false
 *               message: "Authorization token required"
 */
router.patch('/me/password', authenticate, validate(changePasswordSchema), authController.changePassword);

/**
 * @swagger
 * /api/v1/users/me/settings:
 *   get:
 *     summary: Lấy cài đặt cá nhân
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cài đặt của user
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               data:
 *                 userSettingId: "64f1a2b3c4d5e6f7a8b9c0d2"
 *                 userId: "64f1a2b3c4d5e6f7a8b9c0d1"
 *                 language: "vi"
 *                 theme: "dark"
 *                 distanceUnit: "km"
 *                 notificationEnabled: true
 *                 createdAt: "2024-01-15T08:00:00.000Z"
 *                 updatedAt: "2024-01-15T08:00:00.000Z"
 */
router.get('/me/settings', authenticate, authController.getSettings);

/**
 * @swagger
 * /api/v1/users/me/settings:
 *   patch:
 *     summary: Cập nhật cài đặt cá nhân
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               language:
 *                 type: string
 *                 enum: [vi, en]
 *                 example: en
 *               theme:
 *                 type: string
 *                 enum: [light, dark]
 *                 example: light
 *               distanceUnit:
 *                 type: string
 *                 enum: [km, mi]
 *                 example: km
 *               notificationEnabled:
 *                 type: boolean
 *                 example: false
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               data:
 *                 userSettingId: "64f1a2b3c4d5e6f7a8b9c0d2"
 *                 userId: "64f1a2b3c4d5e6f7a8b9c0d1"
 *                 language: "en"
 *                 theme: "light"
 *                 distanceUnit: "km"
 *                 notificationEnabled: false
 *                 updatedAt: "2024-01-16T10:30:00.000Z"
 *       400:
 *         description: Validation lỗi
 *         content:
 *           application/json:
 *             example:
 *               success: false
 *               message: "Validation error"
 *               errors: ["\"theme\" must be one of [light, dark]"]
 */
router.patch('/me/settings', authenticate, validate(updateSettingsSchema), authController.updateSettings);

module.exports = router;
