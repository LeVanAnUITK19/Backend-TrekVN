'use strict';

const { Router } = require('express');
const routeCtrl = require('../controllers/route.controller');

const router = Router();

// Public, paginated route cards. No route geometry or milestones.
router.get('/', routeCtrl.getRoutes);

/**
 * @swagger
 * tags:
 *   name: Routes
 *   description: Tuyến đường trekking
 */

/**
 * @swagger
 * /api/v1/routes/{routeId}:
 *   get:
 *     tags: [Routes]
 *     summary: Chi tiết tuyến đường (chỉ ACTIVE)
 */
router.get('/:routeId', routeCtrl.getRouteById);

/**
 * @swagger
 * /api/v1/routes/{routeId}/milestones:
 *   get:
 *     tags: [Routes]
 *     summary: Danh sách cột mốc (sorted by sequence)
 */
router.get('/:routeId/milestones', routeCtrl.getRouteMilestones);

/**
 * @swagger
 * /api/v1/routes/{routeId}/offline-package:
 *   get:
 *     tags: [Offline]
 *     summary: Gói dữ liệu offline (place + route + milestones + map manifest)
 */
router.get('/:routeId/offline-package', routeCtrl.getOfflinePackage);

/**
 * @swagger
 * /api/v1/routes/{routeId}/offline-package/check:
 *   get:
 *     tags: [Offline]
 *     summary: Kiểm tra version offline package
 *     parameters:
 *       - in: query
 *         name: version
 *         schema: { type: integer }
 */
router.get('/:routeId/offline-package/check', routeCtrl.checkOfflinePackage);

module.exports = router;
