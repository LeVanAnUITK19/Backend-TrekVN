'use strict';

const { Router } = require('express');
const journeyCtrl = require('../controllers/journey.controller');
const markerCtrl = require('../controllers/marker.controller');
const { authenticate } = require('../middlewares/auth');
const { validate } = require('../middlewares/validate');
const journeyValidator = require('../validators/journey.validator');
const markerValidator = require('../validators/marker.validator');

const router = Router();

// Tất cả journey routes đều cần authenticate
router.use(authenticate);

/**
 * @swagger
 * tags:
 *   name: Journeys
 *   description: Hành trình trekking
 */

/**
 * @swagger
 * /api/v1/journeys:
 *   get:
 *     tags: [Journeys]
 *     summary: Danh sách hành trình của tôi
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [PLANNED, ACTIVE, PAUSED, COMPLETED, CANCELLED] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: sort
 *         schema: { type: string, default: '-createdAt' }
 */
router.get('/', journeyCtrl.getJourneys);

/**
 * @swagger
 * /api/v1/journeys/statistics:
 *   get:
 *     tags: [Journeys]
 *     summary: Thống kê hành trình của tôi
 *     security:
 *       - bearerAuth: []
 */
router.get('/statistics', journeyCtrl.getStatistics);

/**
 * @swagger
 * /api/v1/journeys:
 *   post:
 *     tags: [Journeys]
 *     summary: Tạo hành trình mới
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: Idempotency-Key
 *         schema: { type: string }
 *         description: Key để chống duplicate khi offline retry
 */
router.post('/', validate(journeyValidator.createJourney), journeyCtrl.createJourney);

/**
 * @swagger
 * /api/v1/journeys/{journeyId}:
 *   get:
 *     tags: [Journeys]
 *     summary: Chi tiết hành trình
 *     security:
 *       - bearerAuth: []
 */
router.get('/:journeyId', journeyCtrl.getJourneyById);

/**
 * @swagger
 * /api/v1/journeys/{journeyId}/start:
 *   post:
 *     tags: [Journeys]
 *     summary: Bắt đầu hành trình (PLANNED → ACTIVE)
 *     security:
 *       - bearerAuth: []
 */
router.post('/:journeyId/start', validate(journeyValidator.startJourney), journeyCtrl.startJourney);

/**
 * @swagger
 * /api/v1/journeys/{journeyId}/pause:
 *   post:
 *     tags: [Journeys]
 *     summary: Tạm dừng hành trình (ACTIVE → PAUSED)
 *     security:
 *       - bearerAuth: []
 */
router.post('/:journeyId/pause', journeyCtrl.pauseJourney);

/**
 * @swagger
 * /api/v1/journeys/{journeyId}/resume:
 *   post:
 *     tags: [Journeys]
 *     summary: Tiếp tục hành trình (PAUSED → ACTIVE)
 *     security:
 *       - bearerAuth: []
 */
router.post('/:journeyId/resume', journeyCtrl.resumeJourney);

/**
 * @swagger
 * /api/v1/journeys/{journeyId}/complete:
 *   post:
 *     tags: [Journeys]
 *     summary: Hoàn thành hành trình (ACTIVE → COMPLETED)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: Idempotency-Key
 *         schema: { type: string }
 */
router.post('/:journeyId/complete', validate(journeyValidator.completeJourney), journeyCtrl.completeJourney);

/**
 * @swagger
 * /api/v1/journeys/{journeyId}/cancel:
 *   post:
 *     tags: [Journeys]
 *     summary: Hủy hành trình
 *     security:
 *       - bearerAuth: []
 */
router.post('/:journeyId/cancel', journeyCtrl.cancelJourney);

// ─── Journey Markers ──────────────────────────────────────────────────────────

/**
 * @swagger
 * tags:
 *   name: Journey Markers
 *   description: Cột mốc do người dùng đánh dấu trong Journey
 */

/**
 * @swagger
 * /api/v1/journeys/{journeyId}/markers:
 *   get:
 *     tags: [Journey Markers]
 *     summary: Danh sách markers của hành trình
 *     security:
 *       - bearerAuth: []
 */
router.get('/:journeyId/markers', markerCtrl.getMarkers);

/**
 * @swagger
 * /api/v1/journeys/{journeyId}/markers:
 *   post:
 *     tags: [Journey Markers]
 *     summary: Tạo Journey Marker
 *     security:
 *       - bearerAuth: []
 */
router.post('/:journeyId/markers', validate(markerValidator.createMarker), markerCtrl.createMarker);

/**
 * @swagger
 * /api/v1/journeys/{journeyId}/markers/{markerId}:
 *   put:
 *     tags: [Journey Markers]
 *     summary: Cập nhật Journey Marker
 *     security:
 *       - bearerAuth: []
 */
router.put('/:journeyId/markers/:markerId', validate(markerValidator.updateMarker), markerCtrl.updateMarker);

/**
 * @swagger
 * /api/v1/journeys/{journeyId}/markers/{markerId}:
 *   delete:
 *     tags: [Journey Markers]
 *     summary: Xóa Journey Marker
 *     security:
 *       - bearerAuth: []
 */
router.delete('/:journeyId/markers/:markerId', markerCtrl.deleteMarker);

module.exports = router;
