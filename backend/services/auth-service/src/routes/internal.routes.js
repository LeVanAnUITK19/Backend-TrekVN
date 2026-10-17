'use strict';

const { Router } = require('express');
const auditLogRepo = require('../repositories/auditLog.repository');
const { authenticateService } = require('../middlewares/authenticateService');

const router = Router();
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
