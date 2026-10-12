'use strict';

const { randomUUID: uuidv4 } = require('node:crypto');
const EventOutbox = require('../models/EventOutbox');
const logger = require('../config/logger');

/**
 * Write an event to the outbox.
 * Call this after persisting domain data.
 * On failure: log and continue — domain request must not fail because of outbox write.
 *
 * @param {string} eventType
 * @param {object} payload
 * @returns {Promise<string|null>} eventId or null if failed
 */
const enqueue = async (eventType, payload, eventId = uuidv4()) => {
  try {
    await EventOutbox.create({
      eventId,
      eventType,
      eventVersion: 1,
      payload,
      status: 'PENDING',
      nextRetryAt: new Date(),
    });
    return eventId;
  } catch (err) {
    // Duplicate eventId is safe to ignore (idempotent)
    if (err.code === 11000) {
      logger.warn(`[EventOutbox] Duplicate eventId ${eventId} — skipping`);
      return eventId;
    }
    logger.error(`[EventOutbox] Failed to enqueue ${eventType}: ${err.message}`);
    throw err;
  }
};

/**
 * Check if an eventId already exists (idempotency guard for consumer).
 */
const existsByEventId = (eventId) => EventOutbox.exists({ eventId });

module.exports = { enqueue, existsByEventId };
