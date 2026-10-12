'use strict';

const { Router } = require('express');
const placeCtrl = require('../controllers/place.controller');
const reviewCtrl = require('../controllers/review.controller');
const { authenticate } = require('../middlewares/auth');
const { validate } = require('../middlewares/validate');
const reviewValidator = require('../validators/review.validator');

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Places
 *   description: Địa điểm trekking
 */

/**
 * @swagger
 * /api/v1/places:
 *   get:
 *     tags: [Places]
 *     summary: Danh sách địa điểm (chỉ ACTIVE)
 *     parameters:
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *       - in: query
 *         name: provinceId
 *         schema: { type: string }
 *       - in: query
 *         name: region
 *         schema: { type: string, enum: [NORTH, CENTRAL, SOUTH, HIGHLAND, NORTHEAST, NORTHWEST] }
 *         description: Lọc theo vùng địa lý (gọi checkin-service lấy provinceIds)
 *       - in: query
 *         name: difficulty
 *         schema: { type: string, enum: [EASY, MODERATE, HARD, EXPERT] }
 *       - in: query
 *         name: tags
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Thành công
 */
router.get('/', placeCtrl.getPlaces);

/**
 * @swagger
 * /api/v1/places/{placeId}:
 *   get:
 *     tags: [Places]
 *     summary: Chi tiết địa điểm
 *     security:
 *       - bearerAuth: []
 */
router.get('/:placeId', placeCtrl.getPlaceById);

/**
 * @swagger
 * /api/v1/places/{placeId}/routes:
 *   get:
 *     tags: [Places]
 *     summary: Danh sách tuyến đường của địa điểm
 */
router.get('/:placeId/routes', placeCtrl.getPlaceRoutes);

/**
 * @swagger
 * /api/v1/places/{placeId}/offline-package:
 *   get:
 *     tags: [Offline]
 *     summary: Gói dữ liệu offline cấp địa điểm (place + routes + map manifest)
 *     description: |
 *       Trả về place metadata, danh sách routes ACTIVE và offline map manifest.
 *       KHÔNG proxy file map lớn — client tải trực tiếp từ `mapManifest.downloadUrl` (R2/CDN).
 *       `downloadUrl` được build runtime từ R2_PUBLIC_BASE_URL + objectKey.
 */
router.get('/:placeId/offline-package', placeCtrl.getPlaceOfflinePackage);

/**
 * @swagger
 * /api/v1/places/{placeId}/offline-package/check:
 *   get:
 *     tags: [Offline]
 *     summary: Kiểm tra version offline package cấp địa điểm
 *     parameters:
 *       - in: query
 *         name: version
 *         schema: { type: integer }
 *         description: Version client đang có
 *     responses:
 *       200:
 *         description: Trạng thái version
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               data:
 *                 status: "UP_TO_DATE"  # UP_TO_DATE | OUTDATED | NOT_AVAILABLE
 *                 serverVersion: 2
 *                 available: true
 *                 downloadUrl: "https://pub-xxx.r2.dev/maps/nui-ba-den/v2/map.zip"
 *                 checksum: "sha256..."
 */
router.get('/:placeId/offline-package/check', placeCtrl.checkPlaceOfflinePackage);

// ─── Reviews ──────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/v1/places/{placeId}/reviews:
 *   get:
 *     tags: [Reviews]
 *     summary: Danh sách đánh giá
 */
router.get('/:placeId/reviews', reviewCtrl.getReviews);

/**
 * @swagger
 * /api/v1/places/{placeId}/reviews/me:
 *   get:
 *     tags: [Reviews]
 *     summary: Đánh giá của tôi cho địa điểm này
 *     security:
 *       - bearerAuth: []
 */
router.get('/:placeId/reviews/eligibility', authenticate, reviewCtrl.getReviewEligibility);
router.get('/:placeId/reviews/me', authenticate, reviewCtrl.getMyReview);

/**
 * @swagger
 * /api/v1/places/{placeId}/reviews:
 *   post:
 *     tags: [Reviews]
 *     summary: Tạo/cập nhật đánh giá
 *     security:
 *       - bearerAuth: []
 */
router.post('/:placeId/reviews', authenticate, validate(reviewValidator.createReview), reviewCtrl.createReview);

/**
 * @swagger
 * /api/v1/places/{placeId}/reviews/{reviewId}:
 *   put:
 *     tags: [Reviews]
 *     summary: Cập nhật đánh giá của tôi
 *     security:
 *       - bearerAuth: []
 */
router.put('/:placeId/reviews/:reviewId', authenticate, validate(reviewValidator.updateReview), reviewCtrl.updateReview);

/**
 * @swagger
 * /api/v1/places/{placeId}/reviews/{reviewId}:
 *   delete:
 *     tags: [Reviews]
 *     summary: Xóa đánh giá của tôi (soft delete)
 *     security:
 *       - bearerAuth: []
 */
router.delete('/:placeId/reviews/:reviewId', authenticate, reviewCtrl.deleteReview);

module.exports = router;
