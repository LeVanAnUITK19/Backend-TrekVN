'use strict';
const { CatalogCache } = require('../../src/services/catalogCache');
const fakeRedis = () => {
  const values = new Map();
  return { status: 'ready',
    get: jest.fn(async (key) => values.get(key) ?? null),
    set: jest.fn(async (key, value) => values.set(key, value)),
    incr: jest.fn(async (key) => values.set(key, String(Number(values.get(key) || 0) + 1))),
  };
};

test('caches successful pages for 30 seconds and separates all query parameters', async () => {
  const client = fakeRedis();
  const cache = new CatalogCache({ client });
  const load = jest.fn(async () => ({ items: ['p'] }));
  await cache.remember('places', { region: 'NORTH', page: 1 }, load);
  await cache.remember('places', { region: 'NORTH', page: 1 }, load);
  expect(load).toHaveBeenCalledTimes(1);
  expect(client.set).toHaveBeenCalledWith(expect.any(String), expect.any(String), 'EX', 30);
  await cache.remember('places', { region: 'SOUTH', page: 1 }, load);
  await cache.remember('places', { region: 'NORTH', page: 2 }, load);
  await cache.remember('routes', { region: 'NORTH', page: 1 }, load);
  expect(load).toHaveBeenCalledTimes(4);
});

test('concurrent misses share a load; invalidation moves to a new namespace', async () => {
  const cache = new CatalogCache({ client: fakeRedis() });
  const load = jest.fn(async () => ({ items: [] }));
  await Promise.all(Array.from({ length: 20 }, () => cache.remember('places', {}, load)));
  expect(load).toHaveBeenCalledTimes(1);
  await cache.invalidate();
  await cache.remember('places', {}, load);
  expect(load).toHaveBeenCalledTimes(2);
});

test('Redis errors fall back to MongoDB and failed DB reads are never cached', async () => {
  const client = fakeRedis();
  client.get.mockRejectedValue(new Error('unavailable'));
  client.set.mockRejectedValue(new Error('unavailable'));
  const cache = new CatalogCache({ client });
  await expect(cache.remember('places', {}, async () => ({ items: [] }))).resolves.toEqual({ items: [] });
  client.set.mockClear();
  await expect(cache.remember('places', {}, async () => { throw new Error('db'); })).rejects.toThrow('db');
  expect(client.set).not.toHaveBeenCalled();
});
