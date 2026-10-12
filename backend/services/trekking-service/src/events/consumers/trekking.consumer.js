'use strict';

/**
 * TrekkingConsumer — consumes events from RabbitMQ.
 *
 * Subscribed events:
 *   CHECKIN_VERIFIED   → update Journey.checkinCount (idempotent)
 *   TREKKING_JOURNEY_COMPLETED → trigger BadgeEvaluator
 *
 * All handlers are IDEMPOTENT via ProcessedEvent dedup.
 */

const amqplib = require('amqplib');
const logger = require('../../config/logger');
const ProcessedEvent = require('../../models/ProcessedEvent');
const { getUserBadgeStats } = require('../../services/badgeStats.service');
const badgeEvaluator = require('../../services/badgeEvaluator.service');
const mongoose = require('mongoose');

const EXCHANGE = process.env.RABBITMQ_EXCHANGE || 'trekvn.events';
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost:5672';
const ENABLED = process.env.RABBITMQ_ENABLED === 'true';
const QUEUE_TREKKING = 'trekking.service.events';
const CONSUMER_NAME_CHECKIN = 'trekking.checkinCount';
const CONSUMER_NAME_BADGE = 'trekking.badge';

let _connection = null;
let _channel = null;

const _connect = async () => {
  if (_connection) { return; }
  try {
    _connection = await amqplib.connect(RABBITMQ_URL);
    _channel = await _connection.createChannel();
    await _channel.assertExchange(EXCHANGE, 'topic', { durable: true });
    await _channel.assertQueue(QUEUE_TREKKING, { durable: true });

    // Bind to relevant routing keys
    await _channel.bindQueue(QUEUE_TREKKING, EXCHANGE, 'checkin.verified');
    await _channel.bindQueue(QUEUE_TREKKING, EXCHANGE, 'province.first.visited');
    await _channel.bindQueue(QUEUE_TREKKING, EXCHANGE, 'place.first.visited');
    await _channel.bindQueue(QUEUE_TREKKING, EXCHANGE, 'trekking.journey.completed');
    await _channel.bindQueue(QUEUE_TREKKING, EXCHANGE, 'trekking.contribution.approved');

    _channel.prefetch(10);

    _channel.consume(QUEUE_TREKKING, async (msg) => {
      if (!msg) { return; }
      try {
        const event = JSON.parse(msg.content.toString());
        await _handleEvent(event);
        _channel.ack(msg);
      } catch (err) {
        logger.error(`[TrekkingConsumer] Failed to process message: ${err.message}`);
        // nack with requeue=false → goes to dead-letter if configured
        _channel.nack(msg, false, false);
      }
    });

    logger.info(`[TrekkingConsumer] Consuming queue: ${QUEUE_TREKKING}`);

    _connection.on('error', (err) => {
      logger.error(`[TrekkingConsumer] Connection error: ${err.message}`);
      _connection = null;
      _channel = null;
    });
    _connection.on('close', () => {
      logger.warn('[TrekkingConsumer] Connection closed — will retry on next start');
      _connection = null;
      _channel = null;
    });
  } catch (err) {
    logger.error(`[TrekkingConsumer] Failed to connect: ${err.message}`);
    _connection = null;
    _channel = null;
    // Retry after 10s
    setTimeout(_connect, 10000);
  }
};

const _handleEvent = async (event) => {
  const { eventId, eventType, payload } = event;
  if (!eventId || !eventType || !payload) {
    logger.warn('[TrekkingConsumer] Malformed event, skipping');
    return;
  }

  switch (eventType) {
    case 'CHECKIN_VERIFIED':
      await _handleCheckinVerified(eventId, payload);
      break;
    case 'TREKKING_JOURNEY_COMPLETED':
      await _handleJourneyCompleted(eventId, payload);
      break;
    case 'TREKKING_CONTRIBUTION_APPROVED':
    case 'PROVINCE_FIRST_VISITED':
    case 'PLACE_FIRST_VISITED':
      await _evaluateUserBadges(payload);
      break;
    default:
      // ignore unknown events
      break;
  }
};

/**
 * CHECKIN_VERIFIED → increment Journey.checkinCount once per checkin.
 */
const _handleCheckinVerified = async (eventId, payload) => {
  const { journeyId, checkinId } = payload;
  if (!journeyId || !checkinId) {throw new Error('Missing check-in identifiers');}
  const receiptId = `checkin:${checkinId}`;
  await mongoose.connection.transaction(async (session) => {
    if (await ProcessedEvent.findOne({ eventId: receiptId, consumerName: CONSUMER_NAME_CHECKIN }).session(session)) {return;}
    const updated = await require('../../models/Journey').findOneAndUpdate(
      { _id: journeyId, userId: payload.userId }, { $inc: { checkinCount: 1 } }, { session, new: true }
    );
    if (!updated) {throw new Error('Check-in journey was not found for this user');}
    await ProcessedEvent.create([{ eventId: receiptId, consumerName: CONSUMER_NAME_CHECKIN }], { session });
  });
  await _evaluateUserBadges(payload);
  logger.info(`[TrekkingConsumer] checkinCount incremented for journey ${journeyId} (checkin ${checkinId})`);
};

/**
 * TREKKING_JOURNEY_COMPLETED → evaluate badges.
 */
const _handleJourneyCompleted = async (eventId, payload) => {
  if (await ProcessedEvent.exists({ eventId, consumerName: CONSUMER_NAME_BADGE })) {
    logger.info(`[TrekkingConsumer] JOURNEY_COMPLETED badge eval already done: ${eventId}`);
    return;
  }

  const {
    userId,
    journeyId,
  } = payload;

  if (!userId || !journeyId) { return; }

  await _evaluateUserBadges(payload);
  try { await ProcessedEvent.create({ eventId, consumerName: CONSUMER_NAME_BADGE }); }
  catch (err) { if (err.code !== 11000) {throw err;} }
};

const _evaluateUserBadges = async ({ userId, journeyId }) => {
  const stats = await getUserBadgeStats(userId);

  await badgeEvaluator.evaluateBadges(userId, stats, journeyId);
};

const start = async () => {
  if (!ENABLED) {
    logger.info('[TrekkingConsumer] RabbitMQ disabled — consumer not started');
    return;
  }
  await _connect();
};

const close = async () => {
  try {
    if (_channel) { await _channel.close(); }
    if (_connection) { await _connection.close(); }
    logger.info('[TrekkingConsumer] Connection closed');
  } catch (err) {
    logger.warn(`[TrekkingConsumer] Error during close: ${err.message}`);
  }
};

module.exports = { start, close, handleEvent: _handleEvent };
