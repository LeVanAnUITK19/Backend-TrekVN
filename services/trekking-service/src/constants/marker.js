'use strict';

/**
 * Canonical marker types theo SRS v4.0 FR-MARK-13.
 */
const MARKER_TYPES = [
  'VIEWPOINT',
  'REST_POINT',
  'WATER_POINT',
  'DANGER',
  'INTERSECTION',
  'CAMP',
  'PHOTO_SPOT',
  'LANDMARK',
  'SUMMIT',
  'OTHER',
];

/**
 * Alias migration: legacy/UI type → canonical type (Phụ lục C SRS v4.0).
 */
const MARKER_TYPE_ALIASES = {
  WATER_SOURCE: 'WATER_POINT',
  JUNCTION: 'INTERSECTION',
  CAMPING: 'CAMP',
};

/**
 * Normalize marker type, áp dụng alias nếu cần.
 * @param {string} type
 * @returns {string} canonical type
 */
const normalizeMarkerType = (type) => {
  if (!type) { return 'OTHER'; }
  const upper = type.toUpperCase();
  return MARKER_TYPE_ALIASES[upper] || upper;
};

module.exports = { MARKER_TYPES, MARKER_TYPE_ALIASES, normalizeMarkerType };
