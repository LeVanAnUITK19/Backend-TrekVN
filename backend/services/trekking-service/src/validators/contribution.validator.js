'use strict';

const Joi = require('joi');

const geoPoint = Joi.object({
  type: Joi.string().valid('Point').required(),
  coordinates: Joi.array()
    .items(Joi.number())
    .length(2)
    .custom((value, helpers) => {
      const [lng, lat] = value;
      if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
        return helpers.error('any.invalid');
      }
      return value;
    })
    .required(),
});

const statistics = Joi.object({
  distanceMeters: Joi.number().min(0).allow(null),
  durationSeconds: Joi.number().min(0).allow(null),
  elevationGain: Joi.number().min(0).allow(null),
  maxAltitude: Joi.number().allow(null),
  averageSpeed: Joi.number().min(0).allow(null),
}).allow(null);

const submitRoute = Joi.object({
  contributionKind: Joi.string().valid('ROUTE', 'MARKERS').default('ROUTE'),
  clientOperationId: Joi.string().max(100).allow('', null),
  sourceJourneyId: Joi.string().required(),
  trekkingPlaceId: Joi.string().allow('', null),
  proposedName: Joi.string().trim().max(200).allow('', null),
  description: Joi.string().max(5000).allow('', null),
  notes: Joi.string().max(2000).allow('', null),
  encodedPolyline: Joi.string().allow('', null),
  gpxUrl: Joi.string().uri().allow('', null),
  statistics,
  images: Joi.array().items(Joi.string().uri()).max(20).default([]),
  markerIds: Joi.array().items(Joi.string()).max(100).default([]),
});

const submitPlace = Joi.object({
  clientOperationId: Joi.string().max(100).allow('', null),
  provinceId: Joi.string().required(),
  proposedName: Joi.string().trim().min(2).max(200).required(),
  address: Joi.string().max(500).allow('', null),
  location: geoPoint.required(),
  description: Joi.string().min(10).max(5000).required(),
  difficulty: Joi.string().valid('EASY', 'MODERATE', 'HARD', 'EXPERT').allow(null),
  tags: Joi.array().items(Joi.string().max(50)).max(20).default([]),
  images: Joi.array().items(Joi.string().uri()).max(20).default([]),
});

const adminReview = Joi.object({
  decision: Joi.string().valid('APPROVED', 'REJECTED', 'NEEDS_REVISION').required(),
  adminNote: Joi.string().max(2000).allow('', null),
  resultingRouteId: Joi.string().allow('', null),
  resultingPlaceId: Joi.string().allow('', null),
});

const adminReviewMarker = Joi.object({
  decision: Joi.string().valid('APPROVED', 'REJECTED'),
  action: Joi.string().valid('APPROVE', 'REJECT'),
  adminNote: Joi.string().max(2000).allow('', null),
  createOfficialMilestone: Joi.boolean(),
  resultingMilestoneId: Joi.string().hex().length(24),
}).xor('decision', 'action');

module.exports = { submitRoute, submitPlace, adminReview, adminReviewMarker };
