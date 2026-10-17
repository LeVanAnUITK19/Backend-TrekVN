'use strict';

/**
 * RabbitMQ event types checkin-service publish.
 * These are consumed by auth-service (gamification) and trekking-service.
 */
const EVENT_TYPES = {
  CHECKIN_VERIFIED: 'CHECKIN_VERIFIED',
  PROVINCE_FIRST_VISITED: 'PROVINCE_FIRST_VISITED',
  PLACE_FIRST_VISITED: 'PLACE_FIRST_VISITED',
};

module.exports = { EVENT_TYPES };
