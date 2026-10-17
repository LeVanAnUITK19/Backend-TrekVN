'use strict';

const { Router } = require('express');
const contributionCtrl = require('../controllers/contribution.controller');
const { authenticate } = require('../middlewares/auth');
const { validate } = require('../middlewares/validate');
const contributionValidator = require('../validators/contribution.validator');

const router = Router();

router.use(authenticate);

/**
 * @swagger
 * tags:
 *   name: Contributions
 *   description: Đóng góp dữ liệu trekking từ người dùng
 */

/**
 * @swagger
 * /api/v1/contributions/routes:
 *   post:
 *     tags: [Contributions]
 *     summary: Gửi route contribution từ Journey COMPLETED
 *     security:
 *       - bearerAuth: []
 */
router.post('/routes', validate(contributionValidator.submitRoute), contributionCtrl.submitRoute);

/**
 * @swagger
 * /api/v1/contributions/places:
 *   post:
 *     tags: [Contributions]
 *     summary: Gửi đề xuất địa điểm mới
 *     security:
 *       - bearerAuth: []
 */
router.post('/places', validate(contributionValidator.submitPlace), contributionCtrl.submitPlace);

/**
 * @swagger
 * /api/v1/contributions/me:
 *   get:
 *     tags: [Contributions]
 *     summary: Lịch sử đóng góp của tôi
 *     security:
 *       - bearerAuth: []
 */
router.get('/me', contributionCtrl.getMyContributions);

/**
 * @swagger
 * /api/v1/contributions/me/{id}:
 *   get:
 *     tags: [Contributions]
 *     summary: Chi tiết đóng góp của tôi
 *     security:
 *       - bearerAuth: []
 */
router.get('/me/:id', contributionCtrl.getMyContributionById);

/**
 * @swagger
 * /api/v1/contributions/me/{id}/resubmit:
 *   post:
 *     tags: [Contributions]
 *     summary: Gửi lại contribution (NEEDS_REVISION → PENDING_REVIEW)
 *     security:
 *       - bearerAuth: []
 */
router.post('/me/:id/resubmit', contributionCtrl.resubmitContribution);

/**
 * @swagger
 * /api/v1/contributions/me/{id}/cancel:
 *   post:
 *     tags: [Contributions]
 *     summary: Hủy contribution
 *     security:
 *       - bearerAuth: []
 */
router.post('/me/:id/cancel', contributionCtrl.cancelContribution);

module.exports = router;
