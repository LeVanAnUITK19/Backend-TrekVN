'use strict';

const { Router } = require('express');
const reviewCtrl = require('../controllers/review.controller');
const placeCtrl = require('../controllers/place.controller');
const routeCtrl = require('../controllers/route.controller');
const journeyCtrl = require('../controllers/journey.controller');
const offlineMapCtrl = require('../controllers/offlineMap.controller');
const { authenticate } = require('../middlewares/auth');
const { requireAdmin } = require('../middlewares/requireAdmin');
const { authenticateOrService } = require('../middlewares/authenticateOrService');
const { validate } = require('../middlewares/validate');
const { upload } = require('../middlewares/upload');
const placeValidator = require('../validators/place.validator');
const routeValidator = require('../validators/route.validator');
const {
  auditPlaceCreate,
  auditPlaceUpdate,
  auditPlaceDelete,
  auditPlaceStatusUpdate,
  auditRouteCreate,
  auditRouteUpdate,
  auditRouteDelete,
  auditRouteStatusUpdate,
  auditMilestoneCreate,
  auditMilestoneUpdate,
  auditMilestoneDelete,
  auditOfflineMapUpdate,
  auditOfflineMapPublish,
} = require('../middlewares/auditLog');

const router = Router();

// ─── Agent Service endpoints ───────────────────────────────────────────────────
//
// Định nghĩa TRƯỚC router.use() để không bị override bởi middleware chung.
// Cho phép cả 2 cách auth:
//   - X-Service-Token (Agent Service gọi sau khi Admin approve)
//   - Bearer JWT + ADMIN role (Admin Web gọi thủ công)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /places — tạo place. Agent Service dùng sau approve Place Builder.
 */
router.post(
  '/places',
  authenticateOrService,
  requireAdmin,
  validate(placeValidator.createPlace),
  auditPlaceCreate,
  placeCtrl.adminCreatePlace,
);

/**
 * PUT /places/:id — cập nhật place. Agent Service dùng sau approve UPDATE.
 */
router.put(
  '/places/:id',
  authenticateOrService,
  requireAdmin,
  validate(placeValidator.updatePlace),
  auditPlaceUpdate,
  placeCtrl.adminUpdatePlace,
);

/**
 * PUT /places/:id/offline-map — cập nhật offline map sau khi R2 upload xong.
 */
router.put(
  '/places/:id/offline-map',
  authenticateOrService,
  requireAdmin,
  validate(placeValidator.updateOfflineMap),
  auditOfflineMapUpdate,
  placeCtrl.adminUpdatePlaceOfflineMap,
);

/**
 * PUT /routes/:routeId/offline-map — cập nhật route offline map sau R2 upload.
 */
router.put(
  '/routes/:routeId/offline-map',
  authenticateOrService,
  requireAdmin,
  validate(routeValidator.updateOfflineMap),
  auditOfflineMapUpdate,
  routeCtrl.adminUpdateOfflineMap,
);

// ─── Standard admin routes (Admin Web — Bearer JWT + ADMIN role) ───────────────
// Tất cả routes bên dưới đây chỉ dành cho Admin Web (không cần service token).
router.use(authenticate, requireAdmin);
router.get('/places/:id/reviews', reviewCtrl.adminGetReviews);
router.delete('/places/:id/reviews/:reviewId', reviewCtrl.adminDeleteReview);

/**
 * @swagger
 * tags:
 *   name: Admin Trekking
 *   description: Quản trị dữ liệu trekking (ADMIN only)
 */

// ─── Places ───────────────────────────────────────────────────────────────────

router.get('/places', placeCtrl.adminGetPlaces);
router.get('/places/:id', placeCtrl.adminGetPlaceById);

/**
 * GET /places-offline-maps — danh sách places có offlineMap.available = true
 * Dùng cho tab "Bản đồ địa điểm" trong Admin, phân biệt với OfflineMapPackage.
 */
router.get('/places-offline-maps', placeCtrl.adminListPlacesWithOfflineMap);
router.patch('/places/:id/status', validate(placeValidator.updateStatus), auditPlaceStatusUpdate, placeCtrl.adminUpdatePlaceStatus);
router.delete('/places/:id', auditPlaceDelete, placeCtrl.adminDeletePlace);
router.get('/places/:id/offline-map', placeCtrl.adminGetPlaceOfflineMap);
router.get('/places/:id/offline-map/file', placeCtrl.adminDownloadPlaceOfflineMap);

/**
 * POST /places/:id/images — upload ảnh địa điểm lên Cloudinary (tối đa 10 file)
 */
router.post('/places/:id/images', upload.array('images', 10), placeCtrl.adminUploadPlaceImages);

/**
 * POST /places/:id/map-image — upload ảnh bản đồ địa điểm lên Cloudinary (1 file)
 */
router.post('/places/:id/map-image', upload.single('image'), placeCtrl.adminUploadPlaceMapImage);

/**
 * POST /routes/:id/image — upload ảnh cung đường lên Cloudinary (1 file)
 */
router.post('/routes/:id/image', upload.single('image'), routeCtrl.adminUploadRouteImage);

// ─── Routes ───────────────────────────────────────────────────────────────────

router.get('/routes', routeCtrl.adminGetRoutes);
router.post('/routes', validate(routeValidator.createRoute), auditRouteCreate, routeCtrl.adminCreateRoute);
router.get('/routes/:id', routeCtrl.adminGetRouteById);
router.put('/routes/:id', validate(routeValidator.updateRoute), auditRouteUpdate, routeCtrl.adminUpdateRoute);
router.patch('/routes/:id/status', validate(routeValidator.updateStatus), auditRouteStatusUpdate, routeCtrl.adminUpdateRouteStatus);
router.delete('/routes/:id', auditRouteDelete, routeCtrl.adminDeleteRoute);
router.get('/routes/:routeId/offline-map', routeCtrl.adminGetOfflineMap);

// ─── Milestones (nested under route) ─────────────────────────────────────────

router.get('/routes/:routeId/milestones', routeCtrl.adminGetMilestones);
router.post('/routes/:routeId/milestones', validate(routeValidator.createMilestone), auditMilestoneCreate, routeCtrl.adminCreateMilestone);
router.put('/routes/:routeId/milestones/:milestoneId', validate(routeValidator.updateMilestone), auditMilestoneUpdate, routeCtrl.adminUpdateMilestone);
router.delete('/routes/:routeId/milestones/:milestoneId', auditMilestoneDelete, routeCtrl.adminDeleteMilestone);

// ─── Milestones (flat — spec: GET /admin/milestones, GET/PUT/DELETE /admin/milestones/:id) ──

/**
 * @swagger
 * /api/v1/admin/trekking/milestones:
 *   get:
 *     tags: [Admin Trekking]
 *     summary: Danh sách tất cả milestones (flat, có thể filter theo routeId)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: routeId
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 */
router.get('/milestones', routeCtrl.adminListMilestones);

/**
 * @swagger
 * /api/v1/admin/trekking/milestones/{milestoneId}:
 *   get:
 *     tags: [Admin Trekking]
 *     summary: Chi tiết milestone
 *   put:
 *     tags: [Admin Trekking]
 *     summary: Cập nhật milestone
 *   delete:
 *     tags: [Admin Trekking]
 *     summary: Xóa milestone (soft delete)
 */
router.get('/milestones/:milestoneId', routeCtrl.adminGetMilestoneById);
router.put('/milestones/:milestoneId', validate(routeValidator.updateMilestone), auditMilestoneUpdate, routeCtrl.adminUpdateMilestoneById);
router.delete('/milestones/:milestoneId', auditMilestoneDelete, routeCtrl.adminDeleteMilestoneById);

// ─── Journeys (read-only — FR-ADM-12) ────────────────────────────────────────

/**
 * @swagger
 * /api/v1/admin/trekking/journeys:
 *   get:
 *     tags: [Admin Trekking]
 *     summary: Danh sách hành trình (read-only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: userId
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string }
 */
router.get('/journeys', journeyCtrl.adminGetJourneys);

/**
 * @swagger
 * /api/v1/admin/trekking/journeys/{id}:
 *   get:
 *     tags: [Admin Trekking]
 *     summary: Chi tiết hành trình (read-only)
 */
router.get('/journeys/:id', journeyCtrl.adminGetJourneyById);

// ─── Offline Map Packages ─────────────────────────────────────────────────────

/**
 * @swagger
 * /api/v1/admin/trekking/offline-maps:
 *   get:
 *     tags: [Admin Trekking]
 *     summary: Danh sách gói bản đồ offline
 *     security:
 *       - bearerAuth: []
 *   post:
 *     tags: [Admin Trekking]
 *     summary: Tạo gói bản đồ offline mới (trạng thái DRAFT)
 */
router.get('/offline-maps', offlineMapCtrl.adminListOfflineMaps);
router.post('/offline-maps', offlineMapCtrl.adminCreateOfflineMap);

/**
 * @swagger
 * /api/v1/admin/trekking/offline-maps/{id}:
 *   get:
 *     tags: [Admin Trekking]
 *     summary: Chi tiết gói bản đồ
 *   put:
 *     tags: [Admin Trekking]
 *     summary: Cập nhật thông tin gói bản đồ
 *   delete:
 *     tags: [Admin Trekking]
 *     summary: Xóa gói bản đồ (không thể xóa khi đang PUBLISHED)
 */
router.get('/offline-maps/:id', offlineMapCtrl.adminGetOfflineMapById);
router.put('/offline-maps/:id', offlineMapCtrl.adminUpdateOfflineMap);
router.delete('/offline-maps/:id', offlineMapCtrl.adminDeleteOfflineMap);

/**
 * @swagger
 * /api/v1/admin/trekking/offline-maps/{id}/publish:
 *   post:
 *     tags: [Admin Trekking]
 *     summary: Xuất bản gói bản đồ (status → PUBLISHED, ghi publishedAt)
 */
router.post('/offline-maps/:id/publish', auditOfflineMapPublish, offlineMapCtrl.adminPublishOfflineMap);

module.exports = router;
