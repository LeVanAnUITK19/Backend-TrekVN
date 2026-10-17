const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { authenticate } = require('../middlewares/auth');
const { validate } = require('../middlewares/validate');
const upload = require('../middlewares/upload');
const {
  updateProfileSchema,
  updateSettingsSchema,
  changePasswordSchema,
  updateBioSchema,
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

// ─── Avatar ───────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/v1/users/me/avatar:
 *   post:
 *     summary: Tải ảnh đại diện lên Cloudinary
 *     description: |
 *       Upload ảnh avatar lên Cloudinary. Ảnh được resize về 400×400, crop face,
 *       tối ưu chất lượng tự động. Mỗi user chỉ có 1 slot avatar — upload mới sẽ overwrite cũ.
 *
 *       **Giới hạn:** JPEG / PNG / WebP / GIF, tối đa 5 MB.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [avatar]
 *             properties:
 *               avatar:
 *                 type: string
 *                 format: binary
 *                 description: File ảnh (JPEG/PNG/WebP/GIF, tối đa 5MB)
 *     responses:
 *       200:
 *         description: Upload thành công — trả về user với avatarUrl mới
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               data:
 *                 userId: "64f1a2b3c4d5e6f7a8b9c0d1"
 *                 displayName: "Nguyễn Văn An"
 *                 avatarUrl: "https://res.cloudinary.com/dfp5hzdsy/image/upload/v1234/trekvn/avatars/user_64f1.jpg"
 *       400:
 *         description: Không có file hoặc loại file không hợp lệ
 *         content:
 *           application/json:
 *             example:
 *               success: false
 *               message: "Chỉ chấp nhận ảnh JPEG, PNG, WebP hoặc GIF"
 *       401:
 *         description: Chưa xác thực
 */
router.post('/me/avatar', authenticate, upload.single('avatar'), authController.uploadAvatar);

// ─── Bio ─────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/v1/users/me/bio:
 *   patch:
 *     summary: Cập nhật bio (giới thiệu bản thân)
 *     description: Cập nhật bio của user. Tối đa 500 ký tự. Truyền `null` hoặc `""` để xóa bio.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [bio]
 *             properties:
 *               bio:
 *                 type: string
 *                 maxLength: 500
 *                 nullable: true
 *                 example: "Yêu thích khám phá núi rừng Việt Nam 🏔️"
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               data:
 *                 userId: "64f1a2b3c4d5e6f7a8b9c0d1"
 *                 bio: "Yêu thích khám phá núi rừng Việt Nam 🏔️"
 *       400:
 *         description: Bio quá dài (>500 ký tự)
 *       401:
 *         description: Chưa xác thực
 */
router.patch('/me/bio', authenticate, validate(updateBioSchema), authController.updateBio);

module.exports = router;
