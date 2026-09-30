const { Router } = require('express');
const { authenticate } = require('../middlewares/auth');
const { validate } = require('../middlewares/validate');
const visitController = require('../controllers/visit.controller');
const { manualMarkSchema } = require('../validators/checkin.validator');

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Visits
 *   description: Lịch sử ghé thăm tỉnh/thành phố và địa điểm trekking
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     ProvinceWithVisitStatus:
 *       type: object
 *       description: Province data merged với trạng thái visit của user
 *       properties:
 *         provinceId:
 *           type: string
 *           example: "6849a1b2c3d4e5f6a7b8c9d0"
 *         code:
 *           type: string
 *           example: "lam_dong"
 *         name:
 *           type: string
 *           example: "Lâm Đồng"
 *         region:
 *           type: string
 *           enum: [NORTH, CENTRAL, SOUTH]
 *           example: "SOUTH"
 *         mapFeatureId:
 *           type: string
 *           description: ID dùng để match với GeoJSON feature trong Flutter map
 *           example: "VN-LD"
 *         center:
 *           type: object
 *           properties:
 *             type:
 *               type: string
 *               example: "Point"
 *             coordinates:
 *               type: array
 *               items:
 *                 type: number
 *               example: [108.4419, 11.9465]
 *         visitStatus:
 *           type: string
 *           enum: [UNVISITED, SELF_REPORTED, VERIFIED]
 *           description: |
 *             UNVISITED = chưa đánh dấu và chưa có check-in
 *             SELF_REPORTED = user tự tick thủ công
 *             VERIFIED = đã xác minh bằng GPS check-in
 *           example: "VERIFIED"
 *         manualMarked:
 *           type: boolean
 *           example: false
 *         visitCount:
 *           type: integer
 *           example: 2
 *         firstVisitedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         lastVisitedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *
 *     ProvinceListResponse:
 *       type: object
 *       properties:
 *         summary:
 *           type: object
 *           properties:
 *             totalProvinces:
 *               type: integer
 *               description: Tổng số tỉnh trong collection (34 với dataset hiện tại)
 *               example: 34
 *             visitedCount:
 *               type: integer
 *               description: Số tỉnh có SELF_REPORTED hoặc VERIFIED
 *               example: 10
 *             verifiedCount:
 *               type: integer
 *               description: Số tỉnh VERIFIED bằng GPS check-in
 *               example: 4
 *             selfReportedCount:
 *               type: integer
 *               description: Số tỉnh SELF_REPORTED (chưa VERIFIED)
 *               example: 6
 *         provinces:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/ProvinceWithVisitStatus'
 *
 *     PlaceVisit:
 *       type: object
 *       properties:
 *         placeVisitId:
 *           type: string
 *           example: "64f1a2b3c4d5e6f7a8b9c0d3"
 *         trekkingPlaceId:
 *           type: string
 *           example: "place_langbiang"
 *         provinceId:
 *           type: string
 *           example: "6849a1b2c3d4e5f6a7b8c9d0"
 *         firstVisitedAt:
 *           type: string
 *           format: date-time
 *         lastVisitedAt:
 *           type: string
 *           format: date-time
 *         visitCount:
 *           type: integer
 *           example: 3
 *         verificationStatus:
 *           type: string
 *           enum: [VERIFIED]
 *           example: "VERIFIED"
 *         source:
 *           type: string
 *           enum: [CHECKIN]
 *           example: "CHECKIN"
 *
 *     VisitSummary:
 *       type: object
 *       properties:
 *         visitedProvinceCount:
 *           type: integer
 *           description: Thống nhất với ProvinceListResponse.summary.visitedCount
 *           example: 10
 *         verifiedProvinceCount:
 *           type: integer
 *           example: 4
 *         visitedPlaceCount:
 *           type: integer
 *           example: 15
 *         checkinCount:
 *           type: integer
 *           example: 57
 */

// ─── Summary ──────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/v1/visits/me/summary:
 *   get:
 *     summary: Tổng hợp số liệu ghé thăm của user
 *     description: |
 *       Dùng cho màn hình Profile/Statistics.
 *       `visitedProvinceCount` thống nhất với `GET /visits/provinces/me → summary.visitedCount`.
 *     tags: [Visits]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Summary
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               data:
 *                 visitedProvinceCount: 10
 *                 verifiedProvinceCount: 4
 *                 visitedPlaceCount: 15
 *                 checkinCount: 57
 *       401:
 *         description: Chưa xác thực
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/me/summary', authenticate, visitController.getMySummary);

// ─── Province Visits ──────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/v1/visits/provinces/me:
 *   get:
 *     summary: Toàn bộ 34 tỉnh với trạng thái visit của user
 *     description: |
 *       **Used by:**
 *       - Home Vietnam map (tô màu tỉnh theo visitStatus)
 *       - Counter "10 / 34 tỉnh" trên Home
 *       - Province selector bottom sheet ("Tỉnh thành đã đi")
 *       - Xác định màu UNVISITED / SELF_REPORTED / VERIFIED cho từng tỉnh
 *
 *       Trả về **TOÀN BỘ** tỉnh trong collection provinces, không chỉ các tỉnh đã visit.
 *       Mỗi tỉnh được merge với ProvinceVisit của user hiện tại.
 *       Nếu user chưa visit → `visitStatus = UNVISITED`, `visitCount = 0`, dates = null.
 *
 *       **Performance:** chỉ 2 queries (provinces + province_visits) rồi merge trong memory.
 *
 *       **mapFeatureId** dùng để Flutter match với GeoJSON polygon:
 *       ```
 *       GET /visits/provinces/me → mapFeatureId → match GeoJSON feature → visitStatus → tô màu
 *       ```
 *     tags: [Visits]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Toàn bộ 34 tỉnh với visitStatus của user
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/ProvinceListResponse'
 *             example:
 *               success: true
 *               data:
 *                 summary:
 *                   totalProvinces: 34
 *                   visitedCount: 10
 *                   verifiedCount: 4
 *                   selfReportedCount: 6
 *                 provinces:
 *                   - provinceId: "6849a1b2c3d4e5f6a7b8c9d0"
 *                     code: "lam_dong"
 *                     name: "Lâm Đồng"
 *                     region: "SOUTH"
 *                     mapFeatureId: "VN-LD"
 *                     center:
 *                       type: "Point"
 *                       coordinates: [108.4419, 11.9465]
 *                     visitStatus: "VERIFIED"
 *                     manualMarked: false
 *                     visitCount: 2
 *                     firstVisitedAt: "2026-09-21T07:00:00.000Z"
 *                     lastVisitedAt: "2026-09-21T09:30:00.000Z"
 *                   - provinceId: "6849a1b2c3d4e5f6a7b8c9d3"
 *                     code: "da_nang"
 *                     name: "Đà Nẵng"
 *                     region: "CENTRAL"
 *                     mapFeatureId: "VN-DN"
 *                     center:
 *                       type: "Point"
 *                       coordinates: [108.2022, 16.0544]
 *                     visitStatus: "SELF_REPORTED"
 *                     manualMarked: true
 *                     visitCount: 0
 *                     firstVisitedAt: null
 *                     lastVisitedAt: null
 *                   - provinceId: "6849a1b2c3d4e5f6a7b8c9d4"
 *                     code: "ha_noi"
 *                     name: "Hà Nội"
 *                     region: "NORTH"
 *                     mapFeatureId: "VN-HN"
 *                     center:
 *                       type: "Point"
 *                       coordinates: [105.8412, 21.0245]
 *                     visitStatus: "UNVISITED"
 *                     manualMarked: false
 *                     visitCount: 0
 *                     firstVisitedAt: null
 *                     lastVisitedAt: null
 *       401:
 *         description: Chưa xác thực
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/provinces/me', authenticate, visitController.getMyProvinceVisits);

/**
 * @swagger
 * /api/v1/visits/provinces/me/{provinceId}:
 *   get:
 *     summary: Chi tiết trạng thái user với một tỉnh
 *     description: |
 *       Trả về thông tin Province kèm trạng thái visit của user.
 *       `visit` = null nếu user chưa đến/tick tỉnh này.
 *     tags: [Visits]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: provinceId
 *         required: true
 *         schema: { type: string }
 *         example: "6849a1b2c3d4e5f6a7b8c9d0"
 *     responses:
 *       200:
 *         description: Chi tiết province + visit status
 *         content:
 *           application/json:
 *             examples:
 *               visited:
 *                 summary: User đã visit
 *                 value:
 *                   success: true
 *                   data:
 *                     province:
 *                       provinceId: "6849a1b2c3d4e5f6a7b8c9d0"
 *                       code: "lam_dong"
 *                       name: "Lâm Đồng"
 *                       region: "SOUTH"
 *                       mapFeatureId: "VN-LD"
 *                     visit:
 *                       verificationStatus: "VERIFIED"
 *                       visitCount: 2
 *                       firstVisitedAt: "2026-09-21T07:00:00.000Z"
 *               notVisited:
 *                 summary: User chưa visit
 *                 value:
 *                   success: true
 *                   data:
 *                     province:
 *                       provinceId: "6849a1b2c3d4e5f6a7b8c9d0"
 *                       code: "lam_dong"
 *                       name: "Lâm Đồng"
 *                     visit: null
 *       401:
 *         description: Chưa xác thực
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: Không tìm thấy tỉnh
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example:
 *               success: false
 *               error:
 *                 code: "PROVINCE_NOT_FOUND"
 *                 message: "Không tìm thấy tỉnh"
 *                 details: {}
 *   patch:
 *     summary: Tick/bỏ tick tỉnh thủ công (self-reported)
 *     description: |
 *       Cho phép user đánh dấu tỉnh họ đã từng ghé thăm nhưng chưa có check-in GPS.
 *
 *       **Rules:**
 *       - `visited: true` → `manualMarked=true`, `verificationStatus=SELF_REPORTED` (nếu chưa VERIFIED)
 *       - `visited: false` + SELF_REPORTED → **xóa** record, trả về `data: null`
 *       - `visited: false` + VERIFIED → **giữ** record, chỉ set `manualMarked=false`
 *         (VERIFIED không thể downgrade)
 *     tags: [Visits]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: provinceId
 *         required: true
 *         schema: { type: string }
 *         example: "6849a1b2c3d4e5f6a7b8c9d0"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [visited]
 *             properties:
 *               visited:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *         content:
 *           application/json:
 *             examples:
 *               ticked:
 *                 summary: Đã tick → SELF_REPORTED
 *                 value:
 *                   success: true
 *                   message: "Đã đánh dấu tỉnh"
 *                   data:
 *                     manualMarked: true
 *                     verificationStatus: "SELF_REPORTED"
 *               untickSelfReported:
 *                 summary: Bỏ tick SELF_REPORTED → record xóa
 *                 value:
 *                   success: true
 *                   message: "Đã bỏ đánh dấu tỉnh"
 *                   data: null
 *               untickVerified:
 *                 summary: Bỏ tick VERIFIED → record giữ nguyên
 *                 value:
 *                   success: true
 *                   message: "Đã bỏ đánh dấu tỉnh"
 *                   data:
 *                     manualMarked: false
 *                     verificationStatus: "VERIFIED"
 *       400:
 *         description: Validation lỗi
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         description: Chưa xác thực
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: Không tìm thấy tỉnh
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get('/provinces/me/:provinceId', authenticate, visitController.getProvinceVisitDetail);
router.patch(
  '/provinces/me/:provinceId',
  authenticate,
  validate(manualMarkSchema),
  visitController.setProvinceManualMark
);

// ─── Place Visits ─────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/v1/visits/places/me/recent:
 *   get:
 *     summary: Địa điểm đến gần đây (Home screen)
 *     description: |
 *       **Used by:** Home screen widget "Địa điểm đến gần đây".
 *
 *       Trả về danh sách địa điểm trekking user đến gần đây nhất.
 *       Chỉ bao gồm địa điểm có PlaceVisit được tạo bởi check-in VERIFIED.
 *       User không thể tự manually mark trekking place.
 *     tags: [Visits]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 5, maximum: 20 }
 *     responses:
 *       200:
 *         description: Danh sách place visits gần đây
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               data:
 *                 - placeVisitId: "64f1a2b3c4d5e6f7a8b9c0d3"
 *                   trekkingPlaceId: "place_langbiang"
 *                   provinceId: "6849a1b2c3d4e5f6a7b8c9d0"
 *                   lastVisitedAt: "2026-09-21T09:30:00.000Z"
 *                   visitCount: 2
 *                   verificationStatus: "VERIFIED"
 *       401:
 *         description: Chưa xác thực
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get('/places/me/recent', authenticate, visitController.getRecentPlaceVisits);

/**
 * @swagger
 * /api/v1/visits/places/me:
 *   get:
 *     summary: Danh sách tất cả địa điểm đã đến (pagination)
 *     description: |
 *       Trả về tất cả địa điểm trekking user đã ghé thăm, sắp xếp theo `lastVisitedAt` mới nhất.
 *       Địa điểm chỉ xuất hiện khi user có ít nhất 1 check-in VERIFIED `qualifiesPlaceVisit=true` tại đó.
 *     tags: [Visits]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, maximum: 100 }
 *     responses:
 *       200:
 *         description: Danh sách place visits có pagination
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               data:
 *                 items:
 *                   - placeVisitId: "64f1a2b3c4d5e6f7a8b9c0d3"
 *                     trekkingPlaceId: "place_langbiang"
 *                     provinceId: "6849a1b2c3d4e5f6a7b8c9d0"
 *                     firstVisitedAt: "2026-08-10T06:00:00.000Z"
 *                     lastVisitedAt: "2026-09-21T07:00:00.000Z"
 *                     visitCount: 2
 *                 total: 15
 *                 page: 1
 *                 limit: 20
 *       401:
 *         description: Chưa xác thực
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get('/places/me', authenticate, visitController.getMyPlaceVisits);

/**
 * @swagger
 * /api/v1/visits/places/me/{placeId}:
 *   get:
 *     summary: Trạng thái visit của một địa điểm cụ thể
 *     description: |
 *       Kiểm tra user đã đến địa điểm này chưa.
 *       Trả về `null` nếu chưa từng đến.
 *     tags: [Visits]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: placeId
 *         required: true
 *         schema: { type: string }
 *         description: "trekkingPlaceId (string, không phải ObjectId)"
 *         example: "place_langbiang"
 *     responses:
 *       200:
 *         description: Trạng thái visit (null nếu chưa đến)
 *         content:
 *           application/json:
 *             examples:
 *               visited:
 *                 summary: Đã đến
 *                 value:
 *                   success: true
 *                   data:
 *                     trekkingPlaceId: "place_langbiang"
 *                     visitCount: 2
 *                     firstVisitedAt: "2026-08-10T06:00:00.000Z"
 *                     lastVisitedAt: "2026-09-21T07:00:00.000Z"
 *               notVisited:
 *                 summary: Chưa đến
 *                 value:
 *                   success: true
 *                   data: null
 *       401:
 *         description: Chưa xác thực
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get('/places/me/:placeId', authenticate, visitController.getPlaceVisitDetail);

module.exports = router;
