'use strict';

const Joi = require('joi');
const { MARKER_TYPES, MARKER_TYPE_ALIASES } = require('../constants/marker');

const allMarkerTypes = [...MARKER_TYPES, ...Object.keys(MARKER_TYPE_ALIASES)];

const geoPoint = Joi.object({
  type: Joi.string().valid('Point').required(),
  coordinates: Joi.array()
    .items(Joi.number())
    .length(2)
    .custom((value, helpers) => {
      const [lng, lat] = value;
      if (lng < -180 || lng > 180) {
        return helpers.error('any.invalid', { message: 'longitude phải trong [-180, 180]' });
      }
      if (lat < -90 || lat > 90) {
        return helpers.error('any.invalid', { message: 'latitude phải trong [-90, 90]' });
      }
      return value;
    })
    .required(),
});

const createMarker = Joi.object({
  clientMarkerId: Joi.string().max(100).allow('', null),
  name: Joi.string().trim().min(1).max(200).required(),
  type: Joi.string().uppercase().valid(...allMarkerTypes).required(),
  note: Joi.string().max(2000).allow('', null),
  location: geoPoint.required(),
  altitude: Joi.number().allow(null),
  accuracyMeters: Joi.number().min(0).allow(null),
  images: Joi.array().items(Joi.string().uri()).max(10).default([]),
  markedAt: Joi.date().iso().allow(null),
});

const updateMarker = Joi.object({
  name: Joi.string().trim().min(1).max(200),
  type: Joi.string().uppercase().valid(...allMarkerTypes),
  note: Joi.string().max(2000).allow('', null),
  images: Joi.array().items(Joi.string().uri()).max(10),
  location: geoPoint,
  altitude: Joi.number().allow(null),
}).min(1);

module.exports = { createMarker, updateMarker };
