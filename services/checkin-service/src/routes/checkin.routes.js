const { Router } = require('express');
const { authenticate } = require('../middlewares/auth');
const { validate } = require('../middlewares/validate');
const checkinController = require('../controllers/checkin.controller');
const { createCheckinSchema, syncCheckinSchema } = require('../validators/checkin.validator');

const router = Router();

/**
 * @swagger
 * tags:
 *   name: CheckIn
 *   description: Check-in GPS tại milestone trekking — online và offline sync
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     MilestoneCheckin:
 *       type: object
 *       properties:
 *         milestoneCheckinId:
 *           type: string
 *           example: "64f1a2b3c4d5e6f7a8b9c0d1"
 *         journeyId:
 *           type: string
 *           example: "journey_langbiang_2026"
 *         userId:
 *           type: string
 *           example: "user_abc123"
 *         milestoneId:
 *           type: string
 *           example: "milestone_langbiang_summit"
 *         milestoneType:
 *           type: string
 *           example: "SUMMIT"
 *         trekkingPlaceId:
 *           type: string
 *           example: "place_langbiang"
 *         trekkingRouteId:
 *           type: string
 *           example: "route_langbiang_01"
 *         provinceId:
 *           type: string
 *           example: "6849a1b2c3d4e5f6a7b8c9d0"
 *         qualifiesPlaceVisit:
 *           type: boolean
 *           example: true
 *         location:
 *           type: object
 *           properties:
 *             type:
 *               type: string
 *               example: "Point"
 *             coordinates:
 *               type: array
 *               items:
 *                 type: number
 *               example: [108.441, 12.05]
 *         accuracyMeters:
 *           type: number
 *           example: 8
 *         distanceToMilestoneMeters:
 *           type: number
 *           example: 3.14
 *         verification:
 *           type: object
 *           properties:
 *             method:
 *               type: string
 *               example: "GPS"
 *             status:
 *               type: string
 *               enum: [VERIFIED, REJECTED, PENDING_VERIFICATION]
 *               example: "VERIFIED"
 *             reason:
 *               type: string
 *               nullable: true
 *         syncSource:
 *           type: string
 *           enum: [ONLINE, OFFLINE_SYNC]
 *           example: "ONLINE"
 *         checkedAt:
 *           type: string
 *           format: date-time
 *           example: "2026-09-21T07:00:00.000Z"
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *
 *     PaginatedCheckins:
 *       type: object
 *       properties:
 *         items:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/MilestoneCheckin'
 *         total:
 *           type: integer
 *           example: 57
 *         page:
 *           type: integer
 *           example: 1
 *         limit:
 *           type: integer
 *           example: 20
 *
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: false
 *         error:
 *           type: object
 *           properties:
 *             code:
 *               type: string
 *               example: "CHECKIN_OUT_OF_RADIUS"
 *             message:
 *               type: string
 *               example: "Bạn đang ở ngoài bán kính check-in"
 *             details:
 *               type: object
 */

// ─── Tuyến cố định đặt TRƯỚC /:checkinId ─────────────────────────────────────

/**
 * @swagger
 * /api/v1/checkins/me:
 *   get:
 *     summary: Lịch sử check-in của user
 *     description: |
 *       Trả về danh sách tất cả milestone check-in của user đang đăng nhập.
 *       Hỗ trợ filter theo journey, place, route và status. Kết quả được phân trang.
 *     tags: [CheckIn]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, maximum: 100 }
 *       - in: query
 *         name: journeyId
 *         schema: { type: string }
 *         example: "journey_langbiang_2026"
 *       - in: query
 *         name: placeId
 *         schema: { type: string }
 *         example: "place_langbiang"
 *       - in: query
 *         name: routeId
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [VERIFIED, REJECTED, PENDING_VERIFICATION] }
 *     responses:
 *       200:
 *         description: Danh sách check-in có pagination
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               data:
 *                 items:
 *                   - milestoneCheckinId: "64f1a2b3c4d5e6f7a8b9c0d1"
 *                     milestoneId: "milestone_langbiang_summit"
 *                     verification: { status: "VERIFIED" }
 *                     checkedAt: "2026-09-21T07:00:00.000Z"
 *                 total: 57
 *                 page: 1
 *                 limit: 20
 *       401:
 *         description: Chưa xác thực
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/me', authenticate, checkinController.getMyCheckins);

/**
 * @swagger
 * /api/v1/checkins/sync:
 *   post:
 *     summary: Đồng bộ offline check-ins (idempotent)
 *     description: |
 *       **Used by:** SQLite offline check-in synchronization.
 *
 *       Xử lý batch check-in được tạo offline (Flutter SQLite) và gửi lên khi có mạng.
 *
 *       - Mỗi item trong batch xử lý **độc lập** — một item lỗi không làm toàn bộ batch fail.
 *       - **Idempotent**: gửi lại cùng `clientCheckinId` trả về `serverCheckinId` cũ, không tạo bản ghi mới.
 *       - `clientCheckinId` **bắt buộc** cho mỗi item.
 *       - GPS validation, radius check, PlaceVisit và ProvinceVisit update vẫn áp dụng đầy đủ.
 *     tags: [CheckIn]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [items]
 *             properties:
 *               items:
 *                 type: array
 *                 minItems: 1
 *                 maxItems: 100
 *                 items:
 *                   type: object
 *                   required: [clientCheckinId, journeyId, milestoneId, latitude, longitude, accuracyMeters, checkedAt]
 *                   properties:
 *                     clientCheckinId:
 *                       type: string
 *                       example: "local_checkin_001"
 *                     journeyId:
 *                       type: string
 *                       example: "journey_langbiang_2026"
 *                     milestoneId:
 *                       type: string
 *                       example: "milestone_langbiang_summit"
 *                     latitude:
 *                       type: number
 *                       example: 12.05
 *                     longitude:
 *                       type: number
 *                       example: 108.441
 *                     accuracyMeters:
 *                       type: number
 *                       example: 10
 *                     checkedAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2026-09-21T07:00:00.000Z"
 *     responses:
 *       200:
 *         description: Kết quả từng item (batch không bao giờ fail toàn bộ)
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               data:
 *                 results:
 *                   - clientCheckinId: "local_checkin_001"
 *                     serverCheckinId: "64f1a2b3c4d5e6f7a8b9c0d1"
 *                     status: "VERIFIED"
 *                   - clientCheckinId: "local_bad"
 *                     status: "FAILED"
 *                     error:
 *                       code: "MILESTONE_NOT_FOUND"
 *                       message: "Milestone \"milestone_xyz\" không tồn tại"
 *       400:
 *         description: Validation lỗi
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Chưa xác thực
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/sync', authenticate, validate(syncCheckinSchema), checkinController.sync);

/**
 * @swagger
 * /api/v1/checkins:
 *   post:
 *     summary: Tạo check-in online
 *     description: |
 *       **Used by:** online GPS milestone check-in.
 *       Automatically verifies ProvinceVisit (UNVISITED/SELF_REPORTED → VERIFIED).
 *       Creates/updates PlaceVisit when `qualifiesPlaceVisit = true`.
 *
 *       **Luồng xử lý:**
 *       1. Xác thực JWT → `userId` từ token (client không được gửi userId).
 *       2. Lấy metadata milestone từ TrekkingProvider (server-side, không tin client).
 *       3. Kiểm tra `accuracyMeters ≤ CHECKIN_MAX_GPS_ACCURACY_METERS`.
 *       4. Tính Haversine distance userGPS ↔ milestoneGPS.
 *       5. Nếu distance > `checkinRadiusMeters` → `422 CHECKIN_OUT_OF_RADIUS`.
 *       6. Kiểm tra duplicate `(journeyId, milestoneId, userId)`.
 *       7. Lưu `MilestoneCheckin` VERIFIED.
 *       8. Nếu `qualifiesPlaceVisit=true` → cập nhật `PlaceVisit`.
 *       9. Cập nhật `ProvinceVisit` thành VERIFIED.
 *     tags: [CheckIn]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [journeyId, milestoneId, latitude, longitude, accuracyMeters, checkedAt]
 *             properties:
 *               journeyId:
 *                 type: string
 *                 example: "journey_langbiang_2026"
 *               milestoneId:
 *                 type: string
 *                 example: "milestone_langbiang_summit"
 *               latitude:
 *                 type: number
 *                 minimum: -90
 *                 maximum: 90
 *                 example: 12.05
 *               longitude:
 *                 type: number
 *                 minimum: -180
 *                 maximum: 180
 *                 example: 108.441
 *               accuracyMeters:
 *                 type: number
 *                 description: "Phải ≤ CHECKIN_MAX_GPS_ACCURACY_METERS (mặc định 50m)"
 *                 example: 8
 *               checkedAt:
 *                 type: string
 *                 format: date-time
 *                 example: "2026-09-21T07:00:00.000Z"
 *     responses:
 *       201:
 *         description: Check-in thành công — VERIFIED
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: "Check-in thành công"
 *               data:
 *                 milestoneCheckinId: "64f1a2b3c4d5e6f7a8b9c0d1"
 *                 journeyId: "journey_langbiang_2026"
 *                 milestoneId: "milestone_langbiang_summit"
 *                 milestoneType: "SUMMIT"
 *                 trekkingPlaceId: "place_langbiang"
 *                 provinceId: "6849a1b2c3d4e5f6a7b8c9d0"
 *                 qualifiesPlaceVisit: true
 *                 distanceToMilestoneMeters: 0
 *                 verification:
 *                   method: "GPS"
 *                   status: "VERIFIED"
 *                 syncSource: "ONLINE"
 *                 checkedAt: "2026-09-21T07:00:00.000Z"
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
 *         description: Milestone không tồn tại
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example:
 *               success: false
 *               error:
 *                 code: "MILESTONE_NOT_FOUND"
 *                 message: "Milestone \"milestone_xyz\" không tồn tại"
 *                 details: {}
 *       409:
 *         description: Đã check-in milestone này trong journey này rồi
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example:
 *               success: false
 *               error:
 *                 code: "CHECKIN_ALREADY_EXISTS"
 *                 message: "Bạn đã check-in milestone này trong hành trình này rồi"
 *                 details:
 *                   checkinId: "64f1a2b3c4d5e6f7a8b9c0d1"
 *       422:
 *         description: Vi phạm business rule
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             examples:
 *               outOfRadius:
 *                 summary: Ngoài bán kính
 *                 value:
 *                   success: false
 *                   error:
 *                     code: "CHECKIN_OUT_OF_RADIUS"
 *                     message: "Bạn đang ở ngoài bán kính check-in (342m > 50m)"
 *                     details:
 *                       distanceMeters: 342
 *                       radiusMeters: 50
 *               gpsAccuracy:
 *                 summary: GPS không đủ chính xác
 *                 value:
 *                   success: false
 *                   error:
 *                     code: "GPS_ACCURACY_TOO_LOW"
 *                     message: "Độ chính xác GPS quá thấp (120m). Tối đa cho phép: 50m"
 *                     details:
 *                       provided: 120
 *                       maximum: 50
 *       503:
 *         description: Không kết nối được trekking-service (khi TREKKING_PROVIDER=http)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post('/', authenticate, validate(createCheckinSchema), checkinController.create);

/**
 * @swagger
 * /api/v1/checkins/{checkinId}:
 *   get:
 *     summary: Chi tiết một check-in (chỉ chủ sở hữu)
 *     description: |
 *       User chỉ được xem check-in của chính mình.
 *       Trả về 403 nếu checkin thuộc user khác.
 *     tags: [CheckIn]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: checkinId
 *         required: true
 *         schema: { type: string }
 *         example: "64f1a2b3c4d5e6f7a8b9c0d1"
 *     responses:
 *       200:
 *         description: Chi tiết check-in
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               data:
 *                 milestoneCheckinId: "64f1a2b3c4d5e6f7a8b9c0d1"
 *                 milestoneId: "milestone_langbiang_summit"
 *                 verification: { status: "VERIFIED" }
 *       401:
 *         description: Chưa xác thực
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       403:
 *         description: Check-in thuộc về user khác
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example:
 *               success: false
 *               error:
 *                 code: "FORBIDDEN"
 *                 message: "Bạn không có quyền xem check-in này"
 *                 details: {}
 *       404:
 *         description: Không tìm thấy check-in
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example:
 *               success: false
 *               error:
 *                 code: "CHECKIN_NOT_FOUND"
 *                 message: "Không tìm thấy check-in"
 *                 details: {}
 */
router.get('/:checkinId', authenticate, checkinController.getById);

module.exports = router;
