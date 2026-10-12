'use strict';

const { Router } = require('express');
const provinceRepo = require('../repositories/province.repository');

const router = Router();
router.get('/users/:userId/stats', require('../middlewares/authenticateService').authenticateService, async (req, res, next) => {
  try {
    const userId = req.params.userId;
    const Checkin = require('../models/MilestoneCheckin');
    const [totalCheckins, summitCheckins, visitedProvinces, visitedPlaces, altitude, visitedPlaceIds] = await Promise.all([
      Checkin.countDocuments({ userId, 'verification.status': 'VERIFIED' }),
      Checkin.distinct('milestoneId', { userId, milestoneType: 'SUMMIT', 'verification.status': 'VERIFIED' }),
      require('../models/ProvinceVisit').countDocuments({ userId, verificationStatus: 'VERIFIED' }),
      require('../models/PlaceVisit').countDocuments({ userId }),
      Checkin.aggregate([{ $match: { userId, 'verification.status': 'VERIFIED' } }, { $group: { _id: null, maxAltitude: { $max: '$altitudeMeters' } } }]),
      require('../models/PlaceVisit').distinct('trekkingPlaceId', { userId }),
    ]);
    res.json({ success: true, data: { totalCheckins, summitCheckins: summitCheckins.length, visitedProvinces, visitedPlaces, visitedPlaceIds, maxAltitude: altitude[0]?.maxAltitude || 0 } });
  } catch (err) { next(err); }
});

router.get('/dashboard', require('../middlewares/auth').authenticate, async (req, res, next) => {
  if (req.user.role !== 'ADMIN') {return res.status(403).json({ success: false, message: 'Admin only' });}
  try {
    const Checkin = require('../models/MilestoneCheckin');
    const days = { '7d': 7, '30d': 30, '90d': 90 }[req.query.range] || 7;
    const start = new Date(Date.now() - days * 86400000);
    const previousStart = new Date(start - days * 86400000);
    const [total, recent, previous, activity] = await Promise.all([
      Checkin.countDocuments(),
      Checkin.countDocuments({ createdAt: { $gte: start } }),
      Checkin.countDocuments({ createdAt: { $gte: previousStart, $lt: start } }),
      Checkin.aggregate([
        { $match: { createdAt: { $gte: start } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'Asia/Ho_Chi_Minh' } }, checkins: { $sum: 1 } } },
      ]),
    ]);
    res.json({ success: true, data: {
      stats: { totalCheckins: total, checkinGrowthPercent: previous > 0 ? Math.round((recent - previous) / previous * 1000) / 10 : recent > 0 ? 100 : 0 },
      activityChart: activity.map((row) => ({ date: row._id, checkins: row.checkins })),
    } });
  } catch (err) { next(err); }
});

/**
 * GET /internal/v1/provinces?region=SOUTH
 * Internal endpoint: trekking-service dùng để lấy danh sách provinceId theo region.
 * Không qua API Gateway, không cần auth.
 */
router.get('/provinces', async (req, res, next) => {
  try {
    const { region } = req.query;
    const filter = {};
    if (region) { filter.region = region.toUpperCase(); }

    const provinces = await provinceRepo.findByFilter(filter);
    res.json({
      success: true,
      data: provinces.map((p) => ({
        provinceId: String(p._id),
        code: p.code,
        name: p.name,
        region: p.region,
      })),
    });
  } catch (err) { next(err); }
});

module.exports = router;
