'use strict';

const { BadRequestError } = require('./errors');

/**
 * Validate GeoJSON Point.
 * longitude: [-180, 180], latitude: [-90, 90]
 */
const validateGeoPoint = (location, fieldName = 'location') => {
  if (!location || location.type !== 'Point') {
    throw new BadRequestError(
      `${fieldName} phải là GeoJSON Point { type: "Point", coordinates: [lng, lat] }`,
      'VALIDATION_ERROR'
    );
  }
  const [lng, lat] = location.coordinates || [];
  if (
    typeof lng !== 'number' || typeof lat !== 'number' ||
    lng < -180 || lng > 180 ||
    lat < -90 || lat > 90
  ) {
    throw new BadRequestError(
      `${fieldName}: longitude phải trong [-180, 180], latitude phải trong [-90, 90]`,
      'VALIDATION_ERROR',
      { longitude: lng, latitude: lat }
    );
  }
};

/**
 * Tạo GeoJSON Point từ longitude, latitude.
 */
const makePoint = (longitude, latitude) => ({
  type: 'Point',
  coordinates: [longitude, latitude],
});

module.exports = { validateGeoPoint, makePoint };
