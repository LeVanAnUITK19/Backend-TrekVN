'use strict';

const { Router } = require('express');
const uploadCtrl = require('../controllers/upload.controller');
const { authenticate } = require('../middlewares/auth');
const Joi = require('joi');
const { validate } = require('../middlewares/validate');

const router = Router();

const presignSchema = Joi.object({
  purpose: Joi.string()
    .valid('COMMUNITY_POST', 'JOURNEY_MARKER', 'PLACE_REVIEW', 'ROUTE_CONTRIBUTION', 'PLACE_SUGGESTION', 'GPX')
    .required(),
  fileName: Joi.string().max(255).required(),
  contentType: Joi.string().max(100).required(),
  fileSizeBytes: Joi.number().integer().min(1).required(),
});

/**
 * @swagger
 * /api/v1/uploads/presign:
 *   post:
 *     tags: [Uploads]
 *     summary: Lấy presigned upload params từ Cloudinary
 *     description: |
 *       Client dùng `uploadUrl` + `uploadParams` để upload trực tiếp lên Cloudinary.
 *       Sau khi upload xong, lấy `publicUrl` và gửi về server để cập nhật marker/review/contribution.
 *
 *       **Purpose** quyết định folder và giới hạn file:
 *       - `JOURNEY_MARKER` — ảnh marker, tối đa 10MB
 *       - `PLACE_REVIEW`   — ảnh đánh giá, tối đa 10MB
 *       - `COMMUNITY_POST` — ảnh bài viết cộng đồng, tối đa 10MB
 *       - `ROUTE_CONTRIBUTION` — ảnh cung đường, tối đa 20MB
 *       - `PLACE_SUGGESTION`   — ảnh đề xuất địa điểm, tối đa 20MB
 *       - `GPX`            — file GPX/XML, tối đa 50MB
 *
 *       **Security:**
 *       - `objectKey` (public_id) do backend sinh — client không tự chọn path
 *       - Signature hết hạn sau 15 phút
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [purpose, fileName, contentType, fileSizeBytes]
 *             properties:
 *               purpose:
 *                 type: string
 *                 enum: [COMMUNITY_POST, JOURNEY_MARKER, PLACE_REVIEW, ROUTE_CONTRIBUTION, PLACE_SUGGESTION, GPX]
 *                 example: JOURNEY_MARKER
 *               fileName:
 *                 type: string
 *                 example: marker_photo.jpg
 *               contentType:
 *                 type: string
 *                 example: image/jpeg
 *               fileSizeBytes:
 *                 type: integer
 *                 example: 2048000
 *     responses:
 *       200:
 *         description: Upload credentials
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               data:
 *                 uploadUrl: "https://api.cloudinary.com/v1_1/mycloud/image/upload"
 *                 objectKey: "trekvn/markers/userId/1234_marker_photo.jpg"
 *                 publicUrl: "https://res.cloudinary.com/mycloud/image/upload/trekvn/markers/..."
 *                 expiresIn: 900
 *                 uploadParams:
 *                   api_key: "659664438156848"
 *                   timestamp: 1700000000
 *                   signature: "abc123..."
 *                   folder: "trekvn/markers"
 *                   public_id: "trekvn/markers/userId/1234_marker_photo.jpg"
 *       400:
 *         description: Validation error, invalid purpose, or file too large
 *       401:
 *         description: Chưa xác thực
 */
router.post('/presign', authenticate, validate(presignSchema), uploadCtrl.presign);

module.exports = router;
