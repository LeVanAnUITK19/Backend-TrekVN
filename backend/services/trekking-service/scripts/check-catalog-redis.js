'use strict';
require('dotenv').config();
const Redis = require('ioredis');
const client = new Redis(process.env.REDIS_URL, {
  lazyConnect: true, enableOfflineQueue: false, retryStrategy: null,
  connectTimeout: 5000, commandTimeout: 5000,
});
client.on('error', () => {});
(async () => {
  try {
    await client.connect();
    if (await client.ping() !== 'PONG') { throw new Error('PING_FAILED'); }
    const key = `trekvn:connection-check:${require('crypto').randomUUID()}`;
    await client.set(key, 'ok', 'EX', 5);
    if (await client.get(key) !== 'ok') { throw new Error('READ_FAILED'); }
    const ttl = await client.ttl(key);
    await client.del(key);
    if (ttl < 1 || ttl > 5) { throw new Error('TTL_FAILED'); }
    process.stdout.write('Redis TLS: PONG; temporary SET/GET/TTL/DEL passed.\n');
  } catch (error) {
    process.stderr.write(`Redis connection check failed (${error.code || error.name}); credentials hidden.\n`);
    process.exitCode = 1;
  } finally { client.disconnect(); }
})();
