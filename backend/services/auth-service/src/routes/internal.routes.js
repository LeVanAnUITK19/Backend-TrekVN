'use strict';

const { Router } = require('express');
const auditLogRepo = require('../repositories/auditLog.repository');
const { authenticateService } = require('../middlewares/authenticateService');

const router = Router();
// Exact email discovery and active identities for Community. Never expose this
// route through Gateway or return password, tokenVersion or private settings.
/**
 * @swagger
 * /internal/v1/users/community-lookup:
 *   post:
 *     summary: Community-only active user discovery (exact email or IDs)
 *     security:
 *       - serviceToken: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties: false
 *             properties:
 *               email: { type: string, format: email, maxLength: 254 }
 *               userIds: { type: array, minItems: 1, maxItems: 50, items: { type: string } }
 *             oneOf:
 *               - required: [email]
 *               - required: [userIds]
 *     responses:
 *       200:
 *         description: Only ACTIVE users; no email or sensitive account fields
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: string }
 *                       name: { type: string }
 *                       avatarUrl: { type: string, nullable: true }
 *       400: { description: Exactly one valid email or ID list required }
 *       401: { description: Service token required }
 *       403: { description: Invalid service token }
 */
router.post('/users/community-lookup', authenticateService, async (req, res, next) => {
  try {
    const Joi = require('joi');
    const result = Joi.object({
      email: Joi.string().email().max(254).trim().lowercase(),
      userIds: Joi.array().items(Joi.string().hex().length(24)).min(1).max(50),
    }).xor('email', 'userIds').validate(req.body);
    if (result.error) { return res.status(400).json({ success: false, message: 'Invalid discovery input' }); }
    const filter = result.value.email ? { email: result.value.email } : { _id: { $in: result.value.userIds } };
    const users = await require('../models/User').find({ ...filter, status: 'ACTIVE' }).select('displayName avatarUrl').lean();
    res.json({ success: true, data: users.map(u => ({ id: String(u._id), name: u.displayName, avatarUrl: u.avatarUrl })) });
  } catch (err) { next(err); }
});
router.post('/users/lookup', authenticateService, async (req, res, next) => {
  try {
    if (!Array.isArray(req.body.userIds) || req.body.userIds.length > 100) {return res.status(400).json({ success: false });}
    const ids = req.body.userIds.filter((id) => require('mongoose').isValidObjectId(id));
    const users = await require('../models/User').find({ _id: { $in: ids } }).select('displayName email avatarUrl').lean();
    res.json({ success: true, data: users.map((user) => ({ id: String(user._id), name: user.displayName, email: user.email, avatarUrl: user.avatarUrl })) });
  } catch (err) { next(err); }
});
router.post('/gamification/events', authenticateService, async (req, res, next) => {
  try {
    const event = req.body;
    const { handleEvent, EVENTS } = require('../services/gamificationEvent.service');
    if (!event.eventId || !EVENTS.has(event.eventType) || !event.payload?.userId) {
      return res.status(400).json({ success: false, message: 'Invalid gamification event' });
    }
    await handleEvent(event);
    res.json({ success: true });
  } catch (err) { next(err); }
});

/**
 * Internal API - Service-to-service communication only
 * Sử dụng X-Service-Token để authenticate
 */

/**
 * POST /internal/v1/audit-logs
 * Cho phép các service khác (trekking, community, checkin) ghi audit log.
 * 
 * Body: {
 *   adminId, adminName, adminEmail,
 *   action, entityType, entityId,
 *   beforeSummary, afterSummary,
 *   result, ipAddress, note
 * }
 */
router.post('/audit-logs', authenticateService, async (req, res, next) => {
  try {
    const logData = {
      timestamp: new Date(),
      adminId: req.body.adminId,
      adminName: req.body.adminName,
      adminEmail: req.body.adminEmail || null,
      action: req.body.action,
      entityType: req.body.entityType,
      entityId: req.body.entityId || null,
      beforeSummary: req.body.beforeSummary || null,
      afterSummary: req.body.afterSummary || null,
      result: req.body.result || 'SUCCESS',
      ipAddress: req.body.ipAddress || null,
      note: req.body.note || null,
    };

    await auditLogRepo.create(logData);
    res.status(201).json({ success: true, message: 'Audit log recorded' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
