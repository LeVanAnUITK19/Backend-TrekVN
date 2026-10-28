'use strict';
// Exercise the Redis fan-out contract without depending on a deployed broker.
jest.mock('ioredis', () => {
  const { EventEmitter } = require('events');
  const clients = new Set();
  class Redis extends EventEmitter {
    constructor() { super(); clients.add(this); }
    async connect() {}
    async subscribe(channel) { this.channel = channel; }
    async publish(channel, message) {
      for (const client of clients) if (client.channel === channel) client.emit('message', channel, message);
      return clients.size;
    }
    disconnect() { clients.delete(this); }
  }
  return Redis;
});
const { createEventBus } = require('../src/realtime/eventBus');
const Redis = require('ioredis');

test('two instances receive each invalidation once, including the publishing instance', async () => {
  process.env.REDIS_URL = 'redis://fixture.invalid:6379';
  const a = createEventBus(), b = createEventBus();
  try {
    await a.start(); await b.start();
    const atA = [], atB = [];
    a.on((event) => atA.push(event)); b.on((event) => atB.push(event));
    a.publish({ type: 'post.created', postId: 'p', authorId: 'u', public: true });
    expect(atA).toHaveLength(1);
    expect(atB).toHaveLength(1);
    expect(atA[0].eventId).toBe(atB[0].eventId);
    expect(atB[0]).toMatchObject({ postId: 'p', public: true });
  } finally { await a.close(); await b.close(); delete process.env.REDIS_URL; }
});

test('Redis delivery failure does not undo local committed invalidation delivery', async () => {
  process.env.REDIS_URL = 'redis://fixture.invalid:6379';
  const bus = createEventBus();
  const failure = jest.spyOn(Redis.prototype, 'publish').mockRejectedValue(new Error('Redis disconnected'));
  try {
    await bus.start();
    const local = [];
    bus.on((event) => local.push(event));
    expect(() => bus.publish({ type: 'post.updated', postId: 'p' })).not.toThrow();
    await Promise.resolve();
    expect(local).toHaveLength(1);
  } finally { failure.mockRestore(); await bus.close(); delete process.env.REDIS_URL; }
});
