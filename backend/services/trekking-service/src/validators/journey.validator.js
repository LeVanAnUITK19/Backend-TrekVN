'use strict';

const Joi = require('joi');

const createJourney = Joi.object({
  trekkingPlaceId: Joi.string().required(),
  trekkingRouteId: Joi.string().required(),
  provinceId: Joi.string().allow('', null),
  clientJourneyId: Joi.string().max(100).allow('', null),
  name: Joi.string().trim().min(1).max(200).required(),
  note: Joi.string().max(2000).allow('', null),
  participantCount: Joi.number().integer().min(1).default(1),
  plannedStartAt: Joi.date().iso().allow(null),
  plannedEndAt: Joi.date().iso().allow(null),
});

const startJourney = Joi.object({
  startedAt: Joi.date().iso().allow(null),
});

const completeJourney = Joi.object({
  completedAt: Joi.date().iso().allow(null),
  statistics: Joi.object({
    distanceMeters: Joi.number().min(0).allow(null),
    durationSeconds: Joi.number().min(0).allow(null),
    elevationGain: Joi.number().min(0).allow(null),
    maxAltitude: Joi.number().allow(null),
    averageSpeed: Joi.number().min(0).allow(null),
  }).allow(null),
  track: Joi.object({
    encodedPolyline: Joi.string().allow('', null),
  }).allow(null),
});

module.exports = { createJourney, startJourney, completeJourney };
