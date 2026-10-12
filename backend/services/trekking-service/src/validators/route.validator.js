'use strict';

const Joi = require('joi');

const geoPoint = Joi.object({
  type: Joi.string().valid('Point').required(),
  coordinates: Joi.array().items(Joi.number()).length(2).required(),
});

const geoLineString = Joi.object({
  type: Joi.string().valid('LineString').required(),
  coordinates: Joi.array().items(Joi.array().items(Joi.number()).length(2)).min(2).required(),
});

const createRoute = Joi.object({
  trekkingPlaceId: Joi.string().required(),
  name: Joi.string().trim().min(2).max(200).required(),
  description: Joi.string().max(5000).allow('', null),
  difficulty: Joi.string().valid('EASY', 'MODERATE', 'HARD', 'EXPERT').allow(null),
  distanceMeters: Joi.number().integer().min(0).allow(null),
  estimatedDurationMinutes: Joi.number().integer().min(0).allow(null),
  elevationGain: Joi.number().integer().min(0).allow(null),
  maxElevation: Joi.number().integer().allow(null),
  imageUrl: Joi.string().uri().allow('', null),
  startLocation: geoPoint.allow(null),
  endLocation: geoPoint.allow(null),
  path: geoLineString.allow(null),
  status: Joi.string().valid('ACTIVE', 'INACTIVE', 'DISABLED').default('ACTIVE'),
});

const updateRoute = Joi.object({
  name: Joi.string().trim().min(2).max(200),
  description: Joi.string().max(5000).allow('', null),
  difficulty: Joi.string().valid('EASY', 'MODERATE', 'HARD', 'EXPERT').allow(null),
  distanceMeters: Joi.number().integer().min(0).allow(null),
  estimatedDurationMinutes: Joi.number().integer().min(0).allow(null),
  elevationGain: Joi.number().integer().min(0).allow(null),
  maxElevation: Joi.number().integer().allow(null),
  imageUrl: Joi.string().uri().allow('', null),
  startLocation: geoPoint.allow(null),
  endLocation: geoPoint.allow(null),
  path: geoLineString.allow(null),
}).min(1);

const updateStatus = Joi.object({
  status: Joi.string().valid('ACTIVE', 'INACTIVE', 'DISABLED').required(),
});

const updateOfflineMap = Joi.object({
  available: Joi.boolean().required(),
  version: Joi.number().integer().min(0).required(),
  // objectKey lưu trong DB — backend build downloadUrl từ R2_PUBLIC_BASE_URL + objectKey
  // Ví dụ: "ba-den/v1/ba-den-v1-flutter.zip"
  objectKey: Joi.string().allow(null, ''),
  sizeBytes: Joi.number().integer().min(0).allow(null),
  checksum: Joi.string().allow(null, ''),
  minZoom: Joi.number().integer().min(0).max(22).allow(null),
  maxZoom: Joi.number().integer().min(0).max(22).allow(null),
  bounds: Joi.object({
    minLat: Joi.number().min(-90).max(90),
    minLon: Joi.number().min(-180).max(180),
    maxLat: Joi.number().min(-90).max(90),
    maxLon: Joi.number().min(-180).max(180),
  }).allow(null),
});

const createMilestone = Joi.object({
  name: Joi.string().trim().min(1).max(200).required(),
  description: Joi.string().max(2000).allow('', null),
  type: Joi.string().valid('START', 'CHECKPOINT', 'VIEWPOINT', 'REST_POINT', 'WATER_POINT', 'CAMP', 'SUMMIT', 'FINISH').required(),
  sequence: Joi.number().integer().min(0).allow(null),
  location: Joi.object({
    type: Joi.string().valid('Point').required(),
    coordinates: Joi.array().items(Joi.number()).length(2).required(),
  }).required(),
  altitude: Joi.number().allow(null),
  checkinRadiusMeters: Joi.number().integer().min(1).default(50),
  required: Joi.boolean().default(true),
  imageUrl: Joi.string().uri().allow('', null),
});

const updateMilestone = Joi.object({
  name: Joi.string().trim().min(1).max(200),
  description: Joi.string().max(2000).allow('', null),
  type: Joi.string().valid('START', 'CHECKPOINT', 'VIEWPOINT', 'REST_POINT', 'WATER_POINT', 'CAMP', 'SUMMIT', 'FINISH'),
  sequence: Joi.number().integer().min(0),
  location: Joi.object({
    type: Joi.string().valid('Point').required(),
    coordinates: Joi.array().items(Joi.number()).length(2).required(),
  }),
  altitude: Joi.number().allow(null),
  checkinRadiusMeters: Joi.number().integer().min(1),
  required: Joi.boolean(),
  imageUrl: Joi.string().uri().allow('', null),
}).min(1);

module.exports = { createRoute, updateRoute, updateStatus, updateOfflineMap, createMilestone, updateMilestone };
