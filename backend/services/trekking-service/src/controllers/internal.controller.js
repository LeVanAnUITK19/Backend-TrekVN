'use strict';

const Milestone = require('../models/Milestone');
const TrekkingRoute = require('../models/TrekkingRoute');
const TrekkingPlace = require('../models/TrekkingPlace');

/**
 * Internal endpoint cho checkin-service.
 * GET /internal/v1/milestones/:milestoneId/checkin-context
 *
 * Response phải match contract HttpTrekkingProvider expects:
 * {
 *   success: true,
 *   data: {
 *     milestoneId, trekkingRouteId, trekkingPlaceId, provinceId,
 *     name, type, location, checkinRadiusMeters, qualifiesPlaceVisit
 *   }
 * }
 */
const getMilestoneCheckinContext = async (req, res, next) => {
  try {
    const milestone = await Milestone.findById(req.params.milestoneId);
    if (!milestone) {
      return res.status(404).json({ success: false, error: { code: 'MILESTONE_NOT_FOUND', message: 'Milestone not found' } });
    }

    const route = await TrekkingRoute.findById(milestone.trekkingRouteId);
    if (!route || route.status !== 'ACTIVE') {
      return res.status(404).json({ success: false, error: { code: 'ROUTE_NOT_FOUND', message: 'Route not found or inactive' } });
    }

    const place = await TrekkingPlace.findById(route.trekkingPlaceId);

    // qualifiesPlaceVisit = true nếu milestone type là SUMMIT hoặc FINISH
    const { QUALIFYING_MILESTONE_TYPES } = require('../constants/milestone');
    const qualifiesPlaceVisit = QUALIFYING_MILESTONE_TYPES.includes(milestone.type);

    res.json({
      success: true,
      data: {
        milestoneId: String(milestone._id),
        trekkingRouteId: String(milestone.trekkingRouteId),
        trekkingPlaceId: String(route.trekkingPlaceId),
        provinceId: place ? place.provinceId : null,
        name: milestone.name,
        type: milestone.type,
        altitudeMeters: milestone.altitude || 0,
        location: milestone.location,
        checkinRadiusMeters: milestone.checkinRadiusMeters,
        qualifiesPlaceVisit,
      },
    });
  } catch (err) { next(err); }
};

module.exports = { getMilestoneCheckinContext };
