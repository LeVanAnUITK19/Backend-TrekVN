'use strict';

/**
 * GamificationConsumer — consumes RabbitMQ events and awards Trek XP.
 *
 * Consumed events:
 *   TREKKING_JOURNEY_COMPLETED  → JOURNEY_COMPLETED XP + JOURNEY_DISTANCE XP + JOURNEY_ELEVATION XP
 *   CHECKIN_VERIFIED            → MILESTONE_CHECKIN XP (per milestone type)
 *   PROVINCE_FIRST_VISITED      → PROVINCE_VISITED XP (first-discovery, once per user+province)
 *   PLACE_FIRST_VISITED         → PLACE_VISITED XP (first-discovery, once per user+place)
 *   TREKKING_BADGE_EARNED       → BADGE_EARNED XP (by rarity)
 *   TREKKING_CONTRIBUTION_APPROVED → ROUTE_APPROVED / PLACE_APPROVED XP
 *
 * All handlers are IDEMPOTENT via:
 *   - ProcessedEvent dedup (per eventId + consumerName)
 *   - xp_transactions.idempotencyKey unique index
 *
 * XP values per SRS v4.0 FR-RANK-15 / FR-RANK-07.
 *
 * After XP change: evaluate rank and promote if eligible (supports multi-rank jump).
 * The app observes committed XP/rank changes and displays in-app notifications.
 */

const amqplib = require('amqplib');
const logger = require('../../config/logger');
const { handleEvent: _dispatch } = require('../../services/gamificationEvent.service');

const EXCHANGE = process.env.RABBITMQ_EXCHANGE || 'trekvn.events';
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost:5672';
const ENABLED = process.env.RABBITMQ_ENABLED === 'true';
const QUEUE = 'auth.gamification.events';
let _connection = null;
let _channel = null;

// Node may return an AggregateError with an empty message for localhost
// connection failures. Preserve the IPv4/IPv6 causes in the log.
const describeConnectionError = (err) => {
  const causes = err.errors?.length ? err.errors : [err];
  return causes.map((cause) => cause.message || cause.code || cause.name || 'Unknown error').join('; ');
};

const _connect = async () => {
  if (_connection) { return; }
  try {
    _connection = await amqplib.connect(RABBITMQ_URL);
    _channel = await _connection.createChannel();
    await _channel.assertExchange(EXCHANGE, 'topic', { durable: true });
    await _channel.assertQueue(QUEUE, { durable: true });

    // Bind routing keys
    const bindings = [
      'trekking.journey.completed',
      'checkin.verified',
      'province.first.visited',
      'place.first.visited',
      'trekking.badge.earned',
      'trekking.contribution.approved',
    ];
    for (const key of bindings) {
      await _channel.bindQueue(QUEUE, EXCHANGE, key);
    }

    _channel.prefetch(5);

    _channel.consume(QUEUE, async (msg) => {
      if (!msg) { return; }
      try {
        const event = JSON.parse(msg.content.toString());
        await _dispatch(event);
        _channel.ack(msg);
      } catch (err) {
        logger.error(`[GamificationConsumer] Handler error: ${err.message}`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
        if (_channel) {_channel.nack(msg, false, true);}
      }
    });

    logger.info(`[GamificationConsumer] Consuming queue: ${QUEUE}`);

    _connection.on('error', (err) => {
      logger.error(`[GamificationConsumer] Connection error: ${describeConnectionError(err)}`);
      _connection = null; _channel = null;
    });
    _connection.on('close', () => {
      logger.warn('[GamificationConsumer] Connection closed — retry in 10s');
      _connection = null; _channel = null;
      setTimeout(_connect, 10000);
    });
  } catch (err) {
    logger.error(`[GamificationConsumer] Failed to connect: ${describeConnectionError(err)}`);
    _connection = null; _channel = null;
    setTimeout(_connect, 10000);
  }
};

// ─── Public API ───────────────────────────────────────────────────────────────

const start = async () => {
  if (!ENABLED) {
    logger.info('[GamificationConsumer] RabbitMQ disabled — consumer not started');
    return;
  }
  await _connect();
};

const close = async () => {
  try {
    if (_channel) { await _channel.close(); }
    if (_connection) { await _connection.close(); }
  } catch (err) {
    logger.warn(`[GamificationConsumer] Error during close: ${err.message}`);
  }
};

module.exports = { start, close };
