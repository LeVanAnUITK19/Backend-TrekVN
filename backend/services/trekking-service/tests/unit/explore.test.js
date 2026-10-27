'use strict';

jest.mock('../../src/repositories/place.repository', () => ({ findAll: jest.fn() }));
jest.mock('../../src/repositories/route.repository', () => ({ findByPlaces: jest.fn() }));
jest.mock('../../src/providers/checkin.provider', () => ({ getProvinceIdsByRegion: jest.fn() }));
const places = require('../../src/repositories/place.repository');
const routes = require('../../src/repositories/route.repository');
const provinces = require('../../src/providers/checkin.provider');
const service = require('../../src/services/place.service');

beforeEach(() => {
  jest.clearAllMocks();
  places.findAll.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });
});

test.each([['NORTH', 'mien-bac'], ['CENTRAL', 'mien-trung'], ['SOUTH', 'mien-nam']])(
  '%s filters by the place region without depending on checkin-service', async (region, mien) => {
    await service.getPlaces({ region, q: 'Núi', sort: 'popular', provinceId: 'province-code' });
    expect(places.findAll).toHaveBeenCalledWith(expect.objectContaining({ mien, q: 'Núi', sort: 'popular', provinceId: 'province-code' }));
    expect(provinces.getProvinceIdsByRegion).not.toHaveBeenCalled();
  }
);

test('all places and popular do not introduce a region filter', async () => {
  await service.getPlaces({ sort: 'popular' });
  expect(places.findAll).toHaveBeenCalledWith(expect.objectContaining({ mien: undefined, provinceId: undefined }));
});

test('Explore groups routes for one page in a single repository call', async () => {
  const doc = (id) => ({ _id: id, toJSON: () => ({ trekkingPlaceId: id, name: id }) });
  places.findAll.mockResolvedValue({ items: [doc('p1'), doc('p2')], total: 2 });
  const route = { trekkingPlaceId: 'p1', name: 'Trail' };
  routes.findByPlaces.mockResolvedValue([route]);
  const result = await service.getPlaces({ includeRoutes: 'true' });
  expect(routes.findByPlaces).toHaveBeenCalledTimes(1);
  expect(routes.findByPlaces).toHaveBeenCalledWith(['p1', 'p2']);
  expect(result.items).toEqual([
    { trekkingPlaceId: 'p1', name: 'p1', routes: [route] },
    { trekkingPlaceId: 'p2', name: 'p2', routes: [] },
  ]);
});

test('regular listing and empty pages do not fetch routes', async () => {
  await service.getPlaces({});
  await service.getPlaces({ includeRoutes: 'true' });
  expect(routes.findByPlaces).not.toHaveBeenCalled();
});
