'use strict';

const { Router } = require('express');
const badgeCtrl = require('../controllers/badge.controller');
const { authenticate } = require('../middlewares/auth');

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Badges
 *   description: Huy hiệu thành tích
 */

/**
 * @swagger
 * /api/v1/badges:
 *   get:
 *     tags: [Badges]
 *     summary: Danh sách badges (ACTIVE)
 */
router.get('/', badgeCtrl.getBadges);

/**
 * @swagger
 * /api/v1/badges/me:
 *   get:
 *     tags: [Badges]
 *     summary: Badges của tôi
 *     security:
 *       - bearerAuth: []
 */
router.get('/me', authenticate, badgeCtrl.getMyBadges);

module.exports = router;
