'use strict';

const Joi = require('joi');

const geoPoint = Joi.object({
  type: Joi.string().valid('Point').required(),
  coordinates: Joi.array().items(Joi.number()).length(2).required(),
});

const offlineMapBounds = Joi.object({
  minLat: Joi.number().min(-90).max(90),
  minLon: Joi.number().min(-180).max(180),
  maxLat: Joi.number().min(-90).max(90),
  maxLon: Joi.number().min(-180).max(180),
}).allow(null);

const offlineMap = Joi.object({
  available: Joi.boolean().required(),
  version: Joi.number().integer().min(0).required(),
  objectKey: Joi.string().allow(null, ''),
  sizeBytes: Joi.number().integer().min(0).allow(null),
  checksum: Joi.string().allow(null, ''),
  minZoom: Joi.number().integer().min(0).max(22).allow(null),
  maxZoom: Joi.number().integer().min(0).max(22).allow(null),
  bounds: offlineMapBounds,
}).allow(null);

const createPlace = Joi.object({
  name: Joi.string().trim().min(2).max(200).required(),
  provinceId: Joi.string().required(),
  mien: Joi.string().valid('mien-bac', 'mien-trung', 'mien-nam').allow(null),
  address: Joi.string().max(500).allow('', null),
  location: geoPoint.required(),
  description: Joi.string().max(5000).allow('', null),
  difficulty: Joi.string().valid('EASY', 'MODERATE', 'HARD', 'EXPERT').allow(null),
  averageDurationMinutes: Joi.number().integer().min(0).allow(null),
  elevationMeters: Joi.number().integer().min(0).allow(null),
  images: Joi.array().items(Joi.string().uri()).max(20).default([]),
  imageMapUrl: Joi.string().uri().allow('', null),
  tags: Joi.array().items(Joi.string().max(50)).max(20).default([]),
  dataOrigin: Joi.string().valid('MANUAL', 'USER_CONTRIBUTION', 'AI_AGENT').default('MANUAL'),
  externalRefs: Joi.object().allow(null),
  lastVerifiedAt: Joi.date().iso().allow(null),
  offlineMap: offlineMap,
  status: Joi.string().valid('ACTIVE', 'INACTIVE', 'DISABLED').default('ACTIVE'),
});

const updatePlace = Joi.object({
  name: Joi.string().trim().min(2).max(200),
  provinceId: Joi.string(),
  mien: Joi.string().valid('mien-bac', 'mien-trung', 'mien-nam').allow(null),
  address: Joi.string().max(500).allow('', null),
  location: geoPoint,
  description: Joi.string().max(5000).allow('', null),
  difficulty: Joi.string().valid('EASY', 'MODERATE', 'HARD', 'EXPERT').allow(null),
  averageDurationMinutes: Joi.number().integer().min(0).allow(null),
  elevationMeters: Joi.number().integer().min(0).allow(null),
  images: Joi.array().items(Joi.string().uri()).max(20),
  imageMapUrl: Joi.string().uri().allow('', null),
  tags: Joi.array().items(Joi.string().max(50)).max(20),
  dataOrigin: Joi.string().valid('MANUAL', 'USER_CONTRIBUTION', 'AI_AGENT'),
  externalRefs: Joi.object().allow(null),
  lastVerifiedAt: Joi.date().iso().allow(null),
  offlineMap: offlineMap,
  status: Joi.string().valid('ACTIVE', 'INACTIVE', 'DISABLED'),
}).min(1);

const updateStatus = Joi.object({
  status: Joi.string().valid('ACTIVE', 'INACTIVE', 'DISABLED').required(),
});

/**
 * Validator cho PUT /api/v1/admin/trekking/places/:id/offline-map
 * Được Agent Service gọi sau khi Admin approve Map Builder job + R2 upload xong.
 * Chỉ lưu objectKey, không lưu downloadUrl (backend build runtime).
 */
const updateOfflineMap = Joi.object({
  available: Joi.boolean().required(),
  version: Joi.number().integer().min(0).required(),
  // objectKey là R2 key, e.g. "maps/nui-ba-den/v1/nui-ba-den-v1-flutter.zip"
  // downloadUrl được build runtime: R2_PUBLIC_BASE_URL + "/" + objectKey
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
  }).and('minLat', 'minLon', 'maxLat', 'maxLon').allow(null),
}).custom((value, helpers) => {
  if (typeof value.minZoom === 'number' && typeof value.maxZoom === 'number' && value.minZoom > value.maxZoom) {return helpers.message('Min zoom phải nhỏ hơn hoặc bằng max zoom');}
  if (value.bounds && (value.bounds.minLat >= value.bounds.maxLat || value.bounds.minLon >= value.bounds.maxLon)) {return helpers.message('Giới hạn vùng bản đồ không hợp lệ');}
  return value;
});

module.exports = { createPlace, updatePlace, updateStatus, updateOfflineMap };
