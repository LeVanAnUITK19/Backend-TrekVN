'use strict';

const { Router } = require('express');
const badgeCtrl = require('../controllers/badge.controller');
const { authenticate } = require('../middlewares/auth');
const { requireAdmin } = require('../middlewares/requireAdmin');
const { validate } = require('../middlewares/validate');
const badgeValidator = require('../validators/badge.validator');
const {
  auditBadgeCreate,
  auditBadgeUpdate,
  auditBadgeStatusUpdate,
} = require('../middlewares/auditLog');

const router = Router();

// ─── All admin badge routes require authentication + ADMIN role ───────────────
router.use(authenticate, requireAdmin);

/**
 * @swagger
 * tags:
 *   name: Admin Badges
 *   description: Quản trị huy hiệu (ADMIN only)
 */

/**
 * @swagger
 * /api/v1/admin/badges:
 *   get:
 *     tags: [Admin Badges]
 *     summary: Danh sách tất cả badges (bao gồm INACTIVE/DISABLED)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [ACTIVE, INACTIVE, DISABLED] }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Danh sách badges
 */
router.get('/', badgeCtrl.adminGetBadges);

/**
 * @swagger
 * /api/v1/admin/badges:
 *   post:
 *     tags: [Admin Badges]
 *     summary: Tạo badge mới
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, description, condition]
 *             properties:
 *               name: { type: string }
 *               description: { type: string }
 *               iconUrl: { type: string }
 *               condition:
 *                 type: object
 *                 required: [type]
 *                 properties:
 *                   type: { type: string }
 *                   value: { type: number }
 *                   placeId: { type: string }
 *               rarity: { type: string, enum: [COMMON, RARE, EPIC, LEGENDARY] }
 *               category: { type: string }
 *               status: { type: string, enum: [ACTIVE, INACTIVE] }
 *     responses:
 *       201:
 *         description: Badge đã tạo
 */
router.post(
  '/',
  validate(badgeValidator.createBadge),
  auditBadgeCreate,
  badgeCtrl.adminCreateBadge
);

/**
 * @swagger
 * /api/v1/admin/badges/{badgeId}:
 *   get:
 *     tags: [Admin Badges]
 *     summary: Chi tiết badge
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: badgeId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Chi tiết badge
 */
router.get('/:badgeId', badgeCtrl.adminGetBadgeById);

/**
 * @swagger
 * /api/v1/admin/badges/{badgeId}:
 *   patch:
 *     tags: [Admin Badges]
 *     summary: Cập nhật badge (không bao gồm status)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: badgeId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               description: { type: string }
 *               iconUrl: { type: string }
 *               condition:
 *                 type: object
 *                 properties:
 *                   type: { type: string }
 *                   value: { type: number }
 *                   placeId: { type: string }
 *               rarity: { type: string }
 *               category: { type: string }
 *     responses:
 *       200:
 *         description: Badge đã cập nhật
 */
router.patch(
  '/:badgeId',
  validate(badgeValidator.updateBadge),
  auditBadgeUpdate,
  badgeCtrl.adminUpdateBadge
);

/**
 * @swagger
 * /api/v1/admin/badges/{badgeId}/status:
 *   patch:
 *     tags: [Admin Badges]
 *     summary: Cập nhật status badge (ACTIVE/INACTIVE/DISABLED)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: badgeId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status: { type: string, enum: [ACTIVE, INACTIVE, DISABLED] }
 *     responses:
 *       200:
 *         description: Status đã cập nhật
 */
router.patch(
  '/:badgeId/status',
  validate(badgeValidator.updateStatus),
  auditBadgeStatusUpdate,
  badgeCtrl.adminUpdateBadgeStatus
);

module.exports = router;
