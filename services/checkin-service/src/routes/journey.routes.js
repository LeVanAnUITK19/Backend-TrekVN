const { Router } = require('express');
const { authenticate } = require('../middlewares/auth');
const checkinController = require('../controllers/checkin.controller');

const router = Router({ mergeParams: true });

/**
 * @swagger
 * tags:
 *   name: Journeys
 *   description: Check-in trong một hành trình trekking
 */

/**
 * @swagger
 * /api/v1/journeys/{journeyId}/checkins:
 *   get:
 *     summary: Danh sách check-in trong một Journey
 *     description: |
 *       Lấy tất cả milestone check-in của user trong một hành trình trekking cụ thể.
 *       Kết quả sắp xếp theo `checkedAt` tăng dần (thứ tự thời gian thực hiện).
 *       Chỉ trả về check-in của user đang đăng nhập — không trả về check-in của user khác trong cùng journey.
 *     tags: [Journeys]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: journeyId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID hành trình trekking
 *         example: "journey_langbiang_2026"
 *     responses:
 *       200:
 *         description: Danh sách milestone check-in trong journey (có thể rỗng)
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               data:
 *                 - milestoneCheckinId: "64f1a2b3c4d5e6f7a8b9c0d1"
 *                   milestoneId: "milestone_langbiang_start"
 *                   milestoneType: "START"
 *                   checkedAt: "2026-09-21T06:00:00.000Z"
 *                   verification:
 *                     status: "VERIFIED"
 *                   distanceToMilestoneMeters: 15
 *                 - milestoneCheckinId: "64f1a2b3c4d5e6f7a8b9c0d2"
 *                   milestoneId: "milestone_langbiang_summit"
 *                   milestoneType: "SUMMIT"
 *                   checkedAt: "2026-09-21T09:00:00.000Z"
 *                   verification:
 *                     status: "VERIFIED"
 *                   distanceToMilestoneMeters: 0
 *                 - milestoneCheckinId: "64f1a2b3c4d5e6f7a8b9c0d3"
 *                   milestoneId: "milestone_langbiang_finish"
 *                   milestoneType: "FINISH"
 *                   checkedAt: "2026-09-21T11:30:00.000Z"
 *                   verification:
 *                     status: "VERIFIED"
 *                   distanceToMilestoneMeters: 8
 *       401:
 *         description: Chưa xác thực
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               error:
 *                 code: "AUTH_REQUIRED"
 *                 message: "Authorization token required"
 *                 details: {}
 */
router.get('/:journeyId/checkins', authenticate, checkinController.getJourneyCheckins);

module.exports = router;
