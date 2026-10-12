const express = require('express');
const router = express.Router();
const gamificationController = require('../controllers/gamification.controller');
const { authenticate } = require('../middlewares/auth');

/**
 * @swagger
 * tags:
 *   name: Gamification
 *   description: Hệ thống rank, XP và thống kê trekking của người dùng
 */

// ════════════════════════════════════════════════════════════════════
// PUBLIC — Không yêu cầu xác thực
// ════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/v1/gamification/ranks:
 *   get:
 *     summary: Lấy danh sách toàn bộ rank
 *     tags: [Gamification]
 *     responses:
 *       200:
 *         description: Danh sách rank sắp xếp theo level tăng dần
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       code:         { type: string, example: NEWBIE }
 *                       name:         { type: string, example: Newbie }
 *                       level:        { type: integer, example: 1 }
 *                       description:  { type: string }
 *                       minXp:        { type: integer, example: 0 }
 *                       iconUrl:      { type: string, nullable: true }
 *                       requirements:
 *                         type: object
 *                         properties:
 *                           completedJourneys:    { type: integer }
 *                           visitedProvinces:     { type: integer }
 *                           badges:               { type: integer }
 *                           distanceMeters:       { type: integer }
 *                           approvedContributions: { type: integer }
 */
router.get('/ranks', gamificationController.getAllRanks);

/**
 * @swagger
 * /api/v1/gamification/ranks/{rankCode}:
 *   get:
 *     summary: Lấy chi tiết một rank theo code
 *     tags: [Gamification]
 *     parameters:
 *       - in: path
 *         name: rankCode
 *         required: true
 *         schema:
 *           type: string
 *           enum: [NEWBIE, HIKER, EXPLORER, TREKKER, PATHFINDER, MOUNTAINEER, ADVENTURER, ELITE_TREKKER, TREK_MASTER, TREK_LEGEND]
 *         example: MOUNTAINEER
 *     responses:
 *       200:
 *         description: Chi tiết rank
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     code:         { type: string, example: MOUNTAINEER }
 *                     name:         { type: string, example: Mountaineer }
 *                     level:        { type: integer, example: 6 }
 *                     description:  { type: string }
 *                     iconUrl:      { type: string, nullable: true }
 *                     requirements:
 *                       type: object
 *                       properties:
 *                         minXp:                    { type: integer }
 *                         minCompletedJourneys:     { type: integer }
 *                         minVisitedProvinces:      { type: integer }
 *                         minBadgeCount:            { type: integer }
 *                         minDistanceMeters:        { type: integer }
 *                         minApprovedContributions: { type: integer }
 *       404:
 *         description: Rank không tồn tại
 */
router.get('/ranks/:rankCode', gamificationController.getRankByCode);

/**
 * @swagger
 * /api/v1/gamification/users/{userId}:
 *   get:
 *     summary: Xem gamification profile công khai của user khác
 *     tags: [Gamification]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         example: 64f1a2b3c4d5e6f7a8b9c0d1
 *     responses:
 *       200:
 *         description: Profile công khai (chỉ có thông tin public)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     userId:   { type: string }
 *                     rank:
 *                       type: object
 *                       properties:
 *                         code:    { type: string }
 *                         name:    { type: string }
 *                         level:   { type: integer }
 *                         iconUrl: { type: string, nullable: true }
 *                     totalXp: { type: integer }
 *                     statistics:
 *                       type: object
 *                       properties:
 *                         completedJourneys: { type: integer }
 *                         distanceMeters:    { type: integer }
 *                         visitedProvinces:  { type: integer }
 *                         badgeCount:        { type: integer }
 *       404:
 *         description: Người dùng không tồn tại
 */
router.get('/users/:userId', gamificationController.getUserPublicProfile);

// ════════════════════════════════════════════════════════════════════
// PROTECTED — Yêu cầu Bearer token
// ════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/v1/gamification/me:
 *   get:
 *     summary: Lấy hồ sơ rank hiện tại của bản thân (dùng cho màn Profile)
 *     tags: [Gamification]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Hồ sơ rank đầy đủ kèm thống kê
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     rank:
 *                       type: object
 *                       properties:
 *                         code:    { type: string, example: PATHFINDER }
 *                         name:    { type: string, example: Pathfinder }
 *                         level:   { type: integer, example: 5 }
 *                         iconUrl: { type: string, nullable: true }
 *                     totalXp: { type: integer, example: 7850 }
 *                     statistics:
 *                       type: object
 *                       properties:
 *                         completedJourneys:    { type: integer }
 *                         totalDistanceMeters:  { type: integer }
 *                         totalElevationGain:   { type: integer }
 *                         verifiedCheckins:     { type: integer }
 *                         visitedProvinces:     { type: integer }
 *                         visitedPlaces:        { type: integer }
 *                         badgeCount:           { type: integer }
 *                         approvedContributions: { type: integer }
 *                     nextRank:
 *                       type: object
 *                       nullable: true
 *                       properties:
 *                         code:   { type: string }
 *                         name:   { type: string }
 *                         level:  { type: integer }
 *                         minXp:  { type: integer }
 *                     updatedAt: { type: string, format: date-time }
 *       401:
 *         description: Chưa xác thực
 *       404:
 *         description: Hồ sơ gamification chưa được khởi tạo
 */
router.get('/me', authenticate, gamificationController.getMyRankProfile);

/**
 * @swagger
 * /api/v1/gamification/me/progress:
 *   get:
 *     summary: Lấy tiến trình lên rank tiếp theo
 *     tags: [Gamification]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Chi tiết từng điều kiện cần đạt để lên rank kế tiếp
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     currentRank:
 *                       type: object
 *                       properties:
 *                         code:  { type: string }
 *                         name:  { type: string }
 *                         level: { type: integer }
 *                     nextRank:
 *                       type: object
 *                       nullable: true
 *                       properties:
 *                         code:  { type: string }
 *                         name:  { type: string }
 *                         level: { type: integer }
 *                     requirements:
 *                       type: object
 *                       additionalProperties:
 *                         type: object
 *                         properties:
 *                           current:   { type: integer }
 *                           required:  { type: integer }
 *                           completed: { type: boolean }
 *                     overallProgressPercent: { type: integer, example: 82 }
 *       401:
 *         description: Chưa xác thực
 */
router.get('/me/progress', authenticate, gamificationController.getMyRankProgress);

/**
 * @swagger
 * /api/v1/gamification/me/xp-history:
 *   get:
 *     summary: Lịch sử XP (cursor-based pagination)
 *     tags: [Gamification]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 100
 *         description: Số lượng item mỗi trang
 *       - in: query
 *         name: cursor
 *         schema:
 *           type: string
 *         description: ISO date string của item cuối cùng trang trước (để lấy trang tiếp theo)
 *     responses:
 *       200:
 *         description: Danh sách giao dịch XP theo thứ tự mới nhất trước
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       xpTransactionId: { type: string }
 *                       transactionType: { type: string, enum: [EARN, REVERSAL, ADMIN_ADJUSTMENT] }
 *                       sourceType:      { type: string }
 *                       sourceId:        { type: string, nullable: true }
 *                       xpAmount:        { type: integer }
 *                       description:     { type: string, nullable: true }
 *                       createdAt:       { type: string, format: date-time }
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     nextCursor: { type: string, nullable: true }
 *       401:
 *         description: Chưa xác thực
 */
router.get('/me/xp-history', authenticate, gamificationController.getMyXpHistory);

/**
 * @swagger
 * /api/v1/gamification/me/rank-history:
 *   get:
 *     summary: Lịch sử thay đổi rank
 *     tags: [Gamification]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách các lần thay đổi rank theo thứ tự mới nhất trước
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       previousRank:
 *                         type: object
 *                         nullable: true
 *                         properties:
 *                           code: { type: string }
 *                           name: { type: string }
 *                       newRank:
 *                         type: object
 *                         properties:
 *                           code: { type: string }
 *                           name: { type: string }
 *                       xpAtChange:  { type: integer }
 *                       changeType:  { type: string, enum: [PROMOTION, DEMOTION, RECALCULATION] }
 *                       changedAt:   { type: string, format: date-time }
 *       401:
 *         description: Chưa xác thực
 */
router.get('/me/rank-history', authenticate, gamificationController.getMyRankHistory);

module.exports = router;
