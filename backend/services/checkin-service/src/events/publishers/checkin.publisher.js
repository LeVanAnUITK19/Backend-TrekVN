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
 * Nếu RABBITMQ_ENABLED=false thì không kết nối.
 */
const _getChannel = async () => {
  if (!ENABLED) { return null; }
  if (_channel) { return _channel; }
  if (_connecting) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    return _channel;
  }

  _connecting = true;
  try {
    _connection = await amqplib.connect(RABBITMQ_URL);
    _channel = await _connection.createChannel();
    await _channel.assertExchange(EXCHANGE, 'topic', { durable: true });
    logger.info(`[CheckIn RabbitMQ] Connected to ${RABBITMQ_URL}, exchange: ${EXCHANGE}`);

    _connection.on('error', (err) => {
      logger.error(`[CheckIn RabbitMQ] Connection error: ${err.message}`);
      _connection = null;
      _channel = null;
    });
    _connection.on('close', () => {
      logger.warn('[CheckIn RabbitMQ] Connection closed');
      _connection = null;
      _channel = null;
    });
  } catch (err) {
    logger.error(`[CheckIn RabbitMQ] Failed to connect: ${err.message}`);
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
 */
const publish = async (eventType, payload, eventId) => {
  if (process.env.GAMIFICATION_HTTP_ENABLED === 'true') {
    return require('../../repositories/eventOutbox.repository').enqueue(eventType, payload, eventId);
  }
  const message = {
    eventId: uuidv4(),
    eventType,
    eventVersion: 1,
    occurredAt: new Date().toISOString(),
    payload,
  };

  if (!ENABLED) {
    logger.info(`[CheckIn RabbitMQ] (disabled) Would publish: ${eventType}`, { eventId: message.eventId });
    return message.eventId;
  }

  try {
    const channel = await _getChannel();
    if (!channel) {
      logger.warn(`[CheckIn RabbitMQ] No channel available, skipping publish: ${eventType}`);
      return null;
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

    logger.info(`[CheckIn RabbitMQ] Published: ${eventType}`, { eventId: message.eventId });
    return message.eventId;
  } catch (err) {
    logger.error(`[CheckIn RabbitMQ] Publish failed for ${eventType}: ${err.message}`, {
      eventType,
      payload,
    });
    _channel = null;
    return null;
  }
};

const close = async () => {
  try {
    if (_channel) { await _channel.close(); }
    if (_connection) { await _connection.close(); }
    logger.info('[CheckIn RabbitMQ] Connection closed gracefully');
  } catch (err) {
    logger.warn(`[CheckIn RabbitMQ] Error during close: ${err.message}`);
  } finally {
    _channel = null;
    _connection = null;
  }
};

module.exports = { publish, close, _getChannelForOutbox: _getChannel };
