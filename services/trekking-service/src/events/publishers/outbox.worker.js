'use strict';

/**
 * OutboxWorker — polls EventOutbox collection và publish PENDING events lên RabbitMQ.
 *
 * Strategy:
 *   - Poll every OUTBOX_POLL_INTERVAL_MS (default 5000)
 *   - Batch lấy tối đa OUTBOX_BATCH_SIZE (default 20) PENDING events due
 *   - Publish từng event, on success mark PUBLISHED
 *   - On failure: exponential backoff, increment retryCount
 *   - Sau OUTBOX_MAX_RETRY (default 10) lần: mark FAILED (dead-letter)
 */

const EventOutbox = require('../../models/EventOutbox');
const publisher = require('./trekking.publisher');
const logger = require('../../config/logger');

const POLL_INTERVAL_MS = parseInt(process.env.OUTBOX_POLL_INTERVAL_MS) || 5000;
const BATCH_SIZE = parseInt(process.env.OUTBOX_BATCH_SIZE) || 20;
const MAX_RETRY = parseInt(process.env.OUTBOX_MAX_RETRY) || 10;

let _timer = null;
let _running = false;

/**
 * Exponential backoff: 2^retryCount * 1000ms, capped tại 5 phút.
 */
const backoffMs = (retryCount) =>
  Math.min(Math.pow(2, retryCount) * 1000, 5 * 60 * 1000);

/**
 * Process một batch PENDING events.
 */
const processBatch = async () => {
  // Disabled publishing must leave events pending for a later enabled run.
  if (process.env.RABBITMQ_ENABLED !== 'true' && process.env.GAMIFICATION_HTTP_ENABLED !== 'true') {return;}
  if (processBatch.busy) {return;}
  processBatch.busy = true;
  try {
  const now = new Date();
  // Recover delivery claims after a process crash; consumers deduplicate replay.
  await EventOutbox.updateMany({ status: 'PROCESSING', updatedAt: { $lt: new Date(Date.now() - 60000) } }, { $set: { status: 'PENDING' } });
  let events;
  try {
    events = await EventOutbox.find({
      status: 'PENDING',
      nextRetryAt: { $lte: now },
    })
      .sort({ createdAt: 1 })
      .limit(BATCH_SIZE);
  } catch (err) {
    logger.error(`[OutboxWorker] Failed to query outbox: ${err.message}`);
    return;
  }

  for (const event of events) {
    // Mark PROCESSING để không worker khác lấy lại (optimistic)
    try {
      const claimed = await EventOutbox.findOneAndUpdate(
        { _id: event._id, status: 'PENDING' },
        { $set: { status: 'PROCESSING' } }
      );
      if (!claimed) {continue;}
    } catch {
      continue; // race condition, skip
    }

    try {
      // Re-publish trực tiếp (không cần wrap lại trong eventId)
      if (process.env.GAMIFICATION_HTTP_ENABLED === 'true') {
        await require('./http.delivery').deliver({
          eventId: event.eventId, eventType: event.eventType, eventVersion: event.eventVersion,
          occurredAt: event.createdAt, payload: event.payload,
        });
      } else {
      const channel = await publisher._getChannelForOutbox();
      if (!channel) {throw new Error('RabbitMQ channel unavailable');}
      if (channel) {
        const EXCHANGE = process.env.RABBITMQ_EXCHANGE || 'trekvn.events';
        const message = {
          eventId: event.eventId,
          eventType: event.eventType,
          eventVersion: event.eventVersion,
          occurredAt: event.createdAt,
          payload: event.payload,
        };
        const routingKey = event.eventType.toLowerCase().replace(/_/g, '.');
        channel.publish(
          EXCHANGE,
          routingKey,
          Buffer.from(JSON.stringify(message)),
          { persistent: true, contentType: 'application/json', messageId: event.eventId }
        );
        logger.info(`[OutboxWorker] Published ${event.eventType} (eventId=${event.eventId})`);
      }
      }

      await EventOutbox.findByIdAndUpdate(event._id, {
        $set: { status: 'PUBLISHED', publishedAt: new Date() },
      });
    } catch (err) {
      const newRetry = event.retryCount + 1;
      const temporaryHttpFailure = process.env.GAMIFICATION_HTTP_ENABLED === 'true' && err.retryable !== false;
      const newStatus = !temporaryHttpFailure && newRetry >= MAX_RETRY ? 'FAILED' : 'PENDING';
      await EventOutbox.findByIdAndUpdate(event._id, {
        $set: {
          status: newStatus,
          retryCount: newRetry,
          nextRetryAt: new Date(Date.now() + backoffMs(newRetry)),
          lastError: err.message,
        },
      }).catch(() => {});
      logger.warn(`[OutboxWorker] Failed to publish ${event.eventType}: ${err.message} (retry ${newRetry}/${MAX_RETRY})`);
    }
  }
  } finally { processBatch.busy = false; }
};

const start = () => {
  if (_running) { return; }
  _running = true;
  logger.info(`[OutboxWorker] Starting, poll interval=${POLL_INTERVAL_MS}ms, maxRetry=${MAX_RETRY}`);
  const poll = async () => {
    try {
      await processBatch();
    } catch (err) {
      logger.error(`[OutboxWorker] Unexpected error: ${err.message}`);
    } finally {
      if (_running) {
        _timer = setTimeout(poll, POLL_INTERVAL_MS);
      }
    }
  };
  _timer = setTimeout(poll, POLL_INTERVAL_MS);
};

const stop = () => {
  _running = false;
  if (_timer) {
    clearTimeout(_timer);
    _timer = null;
  }
  logger.info('[OutboxWorker] Stopped');
};

module.exports = { start, stop, processBatch };
