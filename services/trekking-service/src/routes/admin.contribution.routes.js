'use strict';

const { Router } = require('express');
const contributionCtrl = require('../controllers/contribution.controller');
const badgeCtrl = require('../controllers/badge.controller');
const { authenticate } = require('../middlewares/auth');
const { requireAdmin } = require('../middlewares/requireAdmin');
const { validate } = require('../middlewares/validate');
const contributionValidator = require('../validators/contribution.validator');
const badgeValidator = require('../validators/badge.validator');

const router = Router();

router.use(authenticate, requireAdmin);

/**
 * @swagger
 * tags:
 *   name: Admin Contributions
 *   description: Quản lý đóng góp của người dùng (ADMIN only)
 */

/**
 * @swagger
 * /api/v1/admin/contributions:
 *   get:
 *     tags: [Admin Contributions]
 *     summary: Danh sách contributions (filter by type/status/userId)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: type
 *         schema: { type: string, enum: [ROUTE_SUBMISSION, PLACE_SUGGESTION] }
 *       - in: query
 *         name: status
 *         schema: { type: string }
 *       - in: query
 *         name: userId
 *         schema: { type: string }
 */
router.get('/contributions', contributionCtrl.adminListContributions);

/**
 * @swagger
 * /api/v1/admin/contributions/{id}:
 *   get:
 *     tags: [Admin Contributions]
 *     summary: Chi tiết contribution + markers
 *     security:
 *       - bearerAuth: []
 */
router.get('/contributions/:id', contributionCtrl.adminGetContributionById);

/**
 * @swagger
 * /api/v1/admin/contributions/{id}/review:
 *   patch:
 *     tags: [Admin Contributions]
 *     summary: Duyệt contribution (APPROVED/REJECTED/NEEDS_REVISION)
 *     security:
 *       - bearerAuth: []
 */
router.patch(
  '/contributions/:id/review',
  validate(contributionValidator.adminReview),
  contributionCtrl.adminReviewContribution
);

/**
 * @swagger
 * /api/v1/admin/contributions/{submissionId}/markers:
 *   get:
 *     tags: [Admin Contributions]
 *     summary: Lấy danh sách Journey Markers đính kèm trong route submission (FR-ADM-21)
 *     description: |
 *       Trả về snapshot markers được copy khi user submit. Snapshot KHÔNG thay đổi
 *       khi user sửa marker gốc sau khi đã submit (BR-28).
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: submissionId
 *         required: true
 *         schema: { type: string }
 */
router.get('/contributions/:submissionId/markers', contributionCtrl.adminGetSubmissionMarkers);

/**
 * @swagger
 * /api/v1/admin/contributions/{submissionId}/markers/{markerId}/review:
 *   post:
 *     tags: [Admin Contributions]
 *     summary: Duyệt hoặc từ chối một Journey Marker (FR-ADM-21, BR-26)
 *     description: |
 *       Khi APPROVE: có thể tạo / link Official Milestone và trả về resultingMilestoneId.
 *       action: APPROVE | REJECT
 *     security:
 *       - bearerAuth: []
 */
router.post(
  '/contributions/:submissionId/markers/:markerId/review',
  validate(contributionValidator.adminReviewMarker),
  contributionCtrl.adminReviewSubmissionMarkerV2
);
router.patch(
  '/contributions/:submissionId/markers/:markerId/review',
  validate(contributionValidator.adminReviewMarker),
  contributionCtrl.adminReviewSubmissionMarkerV2
);
router.patch(
  '/contributions/routes/:submissionId/markers/:markerId/review',
  validate(contributionValidator.adminReviewMarker),
  contributionCtrl.adminReviewSubmissionMarkerV2
);

/**
 * @swagger
 * /api/v1/admin/contributions/{id}/review:
 *   patch:
 *     tags: [Admin Contributions]
 *     description: Giữ nguyên PATCH cho backward compat với existing code.
 */
// (đã khai báo ở trên — PATCH /contributions/:id/review)

// ─── Admin Badges ─────────────────────────────────────────────────────────────

/**
 * @swagger
 * tags:
 *   name: Admin Badges
 *   description: Quản lý badges (ADMIN only)
 */

router.get('/badges', badgeCtrl.adminGetBadges);
router.post('/badges', validate(badgeValidator.createBadge), badgeCtrl.adminCreateBadge);
router.put('/badges/:badgeId', validate(badgeValidator.updateBadge), badgeCtrl.adminUpdateBadge);
router.patch('/badges/:badgeId/status', validate(badgeValidator.updateStatus), badgeCtrl.adminUpdateBadgeStatus);

module.exports = router;
