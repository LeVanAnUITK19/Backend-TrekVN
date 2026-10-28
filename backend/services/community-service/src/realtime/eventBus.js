'use strict';
const { EventEmitter } = require('events');
const { randomUUID } = require('crypto');
const logger = require('../config/logger');

function createEventBus() {
  const local = new EventEmitter();
  let publisher, subscriber;
  const channel = process.env.COMMUNITY_REDIS_CHANNEL || 'trekvn:community:events';
  const instanceId = randomUUID();
  return {
    on: (handler) => { local.on('event', handler); return () => local.off('event', handler); },
    publish(event) {
      const envelope = { ...event, eventId: randomUUID(), occurredAt: new Date().toISOString(), instanceId };
      local.emit('event', envelope);
      if (publisher) publisher.publish(channel, JSON.stringify(envelope)).catch((err) => logger.warn({ message: 'Realtime Redis publish failed', reason: err.message }));
    },
    async start() {
      if (!process.env.REDIS_URL) return;
      const Redis = require('ioredis');
      const options = { lazyConnect: true, maxRetriesPerRequest: 1, enableOfflineQueue: false };
      publisher = new Redis(process.env.REDIS_URL, options);
      subscriber = new Redis(process.env.REDIS_URL, options);
      for (const client of [publisher, subscriber]) client.on('error', (err) => logger.warn({ message: 'Realtime Redis error', reason: err.message }));
      subscriber.on('message', (_channel, message) => {
        try {
          const event = JSON.parse(message);
          if (event.instanceId !== instanceId) local.emit('event', event);
        } catch { logger.warn({ message: 'Invalid realtime Redis event' }); }
      });
      await publisher.connect();
      await subscriber.connect();
      await subscriber.subscribe(channel);
    },
    async close() {
      publisher?.disconnect();
      subscriber?.disconnect();
      local.removeAllListeners();
    },
  };
}
module.exports = { createEventBus };
