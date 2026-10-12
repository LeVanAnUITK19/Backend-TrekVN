'use strict';

/**
 * Official milestone types theo SRS v4.0.
 */
const MILESTONE_TYPES = [
  'START',
  'CHECKPOINT',
  'VIEWPOINT',
  'REST_POINT',
  'WATER_POINT',
  'CAMP',
  'SUMMIT',
  'FINISH',
];

/**
 * Milestone types có thể qualify place visit theo checkin-service logic.
 */
const QUALIFYING_MILESTONE_TYPES = ['SUMMIT', 'FINISH'];

module.exports = { MILESTONE_TYPES, QUALIFYING_MILESTONE_TYPES };
