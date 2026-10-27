'use strict';

const { createHash } = require('crypto');
const logger = require('../config/logger');

// Redis is optional: a cache outage must not make the public catalog unavailable.
class CatalogCache {
  constructor({ client, ttl = 30, prefix = 'trekvn:catalog:v2' } = {}) {
    this.client = client;
    this.ttl = ttl;
    this.prefix = prefix;
    this.pending = new Map();
    this.localEpoch = 0;
  }

  async remember(kind, params, load) {
    let epoch = String(this.localEpoch);
    let ready = this.client?.status === 'ready';
    if (ready) {
      try { epoch = await this.client.get(`${this.prefix}:epoch`) || '0'; }
      catch (_) { ready = false; }
    }
    const hash = createHash('sha256').update(JSON.stringify(params)).digest('hex');
    const key = `${this.prefix}:${epoch}:${kind}:${hash}`;
    if (this.pending.has(key)) { return this.pending.get(key); }
    const pending = (async () => {
      if (ready) {
        try {
          const cached = await this.client.get(key);
          if (cached !== null) { return JSON.parse(cached); }
        } catch (_) { ready = false; }
      }
      const data = await load();
      if (ready) {
        try { await this.client.set(key, JSON.stringify(data), 'EX', this.ttl); }
        catch (_) { /* Returning database data is still successful. */ }
      }
      return data;
    })();
    this.pending.set(key, pending);
    try { return await pending; }
    finally { if (this.pending.get(key) === pending) { this.pending.delete(key); } }
  }

  async invalidate() {
    this.localEpoch++;
    if (this.client?.status === 'ready') {
      try { await this.client.incr(`${this.prefix}:epoch`); }
      catch (_) { /* Existing keys expire within the short TTL. */ }
    }
  }
}

let singleton;
function getCatalogCache() {
  if (singleton) { return singleton; }
  let client;
  if (process.env.REDIS_URL && process.env.NODE_ENV !== 'test') {
    const Redis = require('ioredis');
    client = new Redis(process.env.REDIS_URL, {
      lazyConnect: true, enableOfflineQueue: false, maxRetriesPerRequest: 0,
      connectTimeout: 1000, commandTimeout: 800,
      retryStrategy: (attempt) => Math.min(attempt * 1000, 30000),
    });
    // Do not log connection URLs, credentials, or raw provider errors.
    client.on('error', () => logger.warn('[CatalogCache] Redis unavailable; using MongoDB'));
    client.on('ready', () => logger.info('[CatalogCache] Redis connected (TLS enabled by rediss URL)'));
    client.connect().catch(() => {});
  }
  singleton = new CatalogCache({
    client,
    ttl: Math.max(1, parseInt(process.env.CATALOG_CACHE_TTL_SECONDS, 10) || 30),
    prefix: process.env.CATALOG_CACHE_PREFIX || 'trekvn:catalog:v2',
  });
  return singleton;
}

module.exports = { CatalogCache, getCatalogCache };
