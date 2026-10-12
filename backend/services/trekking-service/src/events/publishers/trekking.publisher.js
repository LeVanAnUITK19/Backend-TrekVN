'use strict';

const amqplib = require('amqplib');
const { randomUUID: uuidv4 } = require('node:crypto');
const logger = require('../../config/logger');

const EXCHANGE = process.env.RABBITMQ_EXCHANGE || 'trekvn.events';
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost:5672';
const ENABLED = process.env.RABBITMQ_ENABLED === 'true';

let _connection = null;
let _channel = null;
let _connecting = false;

/**
 * Lazy-connect và tạo channel.
 * Nếu RABBITMQ_ENABLED=false thì không kết nối (dùng khi dev/test).
 */
const _getChannel = async () => {
  if (!ENABLED) { return null; }
  if (_channel) { return _channel; }
  if (_connecting) {
    // Chờ tối đa 3s
    await new Promise((resolve) => setTimeout(resolve, 500));
    return _channel;
  }

  _connecting = true;
  try {
    _connection = await amqplib.connect(RABBITMQ_URL);
    _channel = await _connection.createChannel();
    await _channel.assertExchange(EXCHANGE, 'topic', { durable: true });
    logger.info(`[RabbitMQ] Connected to ${RABBITMQ_URL}, exchange: ${EXCHANGE}`);

    _connection.on('error', (err) => {
      logger.error(`[RabbitMQ] Connection error: ${err.message}`);
      _connection = null;
      _channel = null;
    });
    _connection.on('close', () => {
      logger.warn('[RabbitMQ] Connection closed');
      _connection = null;
      _channel = null;
    });
  } catch (err) {
    logger.error(`[RabbitMQ] Failed to connect: ${err.message}`);
    _connection = null;
    _channel = null;
  } finally {
    _connecting = false;
  }

  return _channel;
};

/**
 * Publish event lên RabbitMQ.
 * Publish CHỈ sau khi dữ liệu business đã persist thành công.
 * Nếu publish thất bại: log và tiếp tục — không làm fail request chính.
 *
 * Message format:
 * {
 *   eventId,
 *   eventType,
 *   eventVersion: 1,
 *   occurredAt,
 *   payload
 * }
 *
 * @param {string} eventType  - Từ constants/events.js
 * @param {object} payload    - Business payload
 */
const publish = async (eventType, payload) => {
  if (process.env.GAMIFICATION_HTTP_ENABLED === 'true') {
    return require('../../repositories/eventOutbox.repository').enqueue(eventType, payload);
  }
  const message = {
    eventId: uuidv4(),
    eventType,
    eventVersion: 1,
    occurredAt: new Date().toISOString(),
    payload,
  };

  if (!ENABLED) {
    logger.info(`[RabbitMQ] (disabled) Would publish: ${eventType}`, { eventId: message.eventId });
    return;
  }

  try {
    const channel = await _getChannel();
    if (!channel) {
      logger.warn(`[RabbitMQ] No channel available, skipping publish: ${eventType}`);
      return;
    }

    const routingKey = eventType.toLowerCase().replace(/_/g, '.');
    channel.publish(
      EXCHANGE,
      routingKey,
      Buffer.from(JSON.stringify(message)),
      {
        persistent: true,
        contentType: 'application/json',
        messageId: message.eventId,
        timestamp: Date.now(),
      }
    );

    logger.info(`[RabbitMQ] Published: ${eventType}`, { eventId: message.eventId });
  } catch (err) {
    // Publish failure KHÔNG làm fail request chính (document failure strategy)
    logger.error(`[RabbitMQ] Publish failed for ${eventType}: ${err.message}`, {
      eventType,
      payload,
    });
    // Reset channel để lần sau retry connect
    _channel = null;
  }
};

/**
 * Graceful shutdown — đóng connection khi server tắt.
 */
const close = async () => {
  try {
    if (_channel) { await _channel.close(); }
    if (_connection) { await _connection.close(); }
    logger.info('[RabbitMQ] Connection closed gracefully');
  } catch (err) {
    logger.warn(`[RabbitMQ] Error during close: ${err.message}`);
  } finally {
    _channel = null;
    _connection = null;
  }
};

/**
 * Exposed for OutboxWorker — returns the channel (or null).
 * Internal use only; not part of public API.
 */
const _getChannelForOutbox = async () => _getChannel();

module.exports = { publish, close, _getChannelForOutbox };
