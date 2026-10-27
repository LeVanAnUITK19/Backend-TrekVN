'use strict';

jest.mock('../../src/models/TrekkingPlace', () => ({ find: jest.fn(), countDocuments: jest.fn() }));
jest.mock('../../src/models/TrekkingRoute', () => ({ find: jest.fn() }));
const Place = require('../../src/models/TrekkingPlace');
const Route = require('../../src/models/TrekkingRoute');
const places = require('../../src/repositories/place.repository');
const routes = require('../../src/repositories/route.repository');

test('region, literal name search, popular sort and pagination are applied in MongoDB', async () => {
  const chain = { sort: jest.fn().mockReturnThis(), skip: jest.fn().mockReturnThis(), limit: jest.fn().mockResolvedValue([]) };
  Place.find.mockReturnValue(chain);
  Place.countDocuments.mockResolvedValue(0);
  await places.findAll({ mien: 'mien-bac', q: 'Núi (A)+', sort: 'popular', page: 2, limit: 10 });
  const filter = Place.find.mock.calls[0][0];
  expect(filter).toMatchObject({ status: 'ACTIVE', mien: 'mien-bac' });
  const search = filter.$or[0].name.$regex;
  expect(new RegExp(search).test('Núi (A)+')).toBe(true);
  expect(new RegExp(search).test('Núi AAAAA')).toBe(false);
  expect(chain.sort).toHaveBeenCalledWith({ ratingCount: -1, ratingAverage: -1, _id: -1 });
  expect(chain.skip).toHaveBeenCalledWith(10);
  expect(chain.limit).toHaveBeenCalledWith(10);
});

test('bundled routes include only active routes in the requested places', async () => {
  const sort = jest.fn().mockResolvedValue([]);
  Route.find.mockReturnValue({ sort });
  await routes.findByPlaces(['p1', 'p2']);
  expect(Route.find).toHaveBeenCalledWith({ trekkingPlaceId: { $in: ['p1', 'p2'] }, status: 'ACTIVE' });
});
