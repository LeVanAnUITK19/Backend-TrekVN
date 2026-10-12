'use strict';

const { Router } = require('express');
const internalCtrl = require('../controllers/internal.controller');

const router = Router();
const { authenticateService } = require('../middlewares/authenticateService');
router.post('/events', authenticateService, async (req, res, next) => {
  try {
    const { eventId, eventType, payload } = req.body;
    if (!eventId || !['CHECKIN_VERIFIED', 'TREKKING_JOURNEY_COMPLETED', 'PROVINCE_FIRST_VISITED', 'PLACE_FIRST_VISITED', 'TREKKING_CONTRIBUTION_APPROVED'].includes(eventType) || !payload?.userId) {
      return res.status(400).json({ success: false, message: 'Invalid trekking event' });
    }
    await require('../events/consumers/trekking.consumer').handleEvent(req.body);
    res.json({ success: true });
  } catch (err) { next(err); }
});
router.get('/users/:userId/stats', authenticateService, async (req, res, next) => {
  try {
    const userId = req.params.userId;
    const [totalJourneys, routes, places] = await Promise.all([
      require('../models/Journey').countDocuments({ userId }),
      require('../models/RouteSubmission').countDocuments({ userId, status: { $nin: ['DRAFT', 'CANCELLED'] } }),
      require('../models/PlaceSuggestion').countDocuments({ userId, status: { $nin: ['DRAFT', 'CANCELLED'] } }),
    ]);
    res.json({ success: true, data: { totalJourneys, totalContributions: routes + places } });
  } catch (err) { next(err); }
});

router.get('/dashboard',
  require('../middlewares/auth').authenticate,
  require('../middlewares/requireAdmin').requireAdmin,
  async (req, res, next) => {
    try {
      res.json({ success: true, data: await require('../services/dashboard.service').getDashboard(req.query.range) });
    } catch (err) { next(err); }
  });

/**
 * Internal endpoints — chỉ cho service-to-service communication.
 * Không expose qua API Gateway.
 *
 * GET /internal/v1/milestones/:milestoneId/checkin-context
 * → Contract dùng bởi checkin-service HttpTrekkingProvider
 */
router.get('/milestones/:milestoneId/checkin-context', internalCtrl.getMilestoneCheckinContext);

module.exports = router;
