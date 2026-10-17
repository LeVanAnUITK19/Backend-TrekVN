'use strict';

jest.mock('../../src/repositories/route.repository', () => ({ findById: jest.fn(), create: jest.fn() }));
jest.mock('../../src/repositories/milestone.repository', () => ({ findByRoute: jest.fn().mockResolvedValue([]) }));
jest.mock('../../src/models/TrekkingPlace', () => ({ findById: jest.fn() }));
process.env.R2_PUBLIC_BASE_URL = 'https://media.example';
process.env.MAP_R2_PUBLIC_BASE_URL = 'https://maps.example/';

const r2 = require('../../src/config/r2');
const service = require('../../src/services/route.service');
const routes = require('../../src/repositories/route.repository');
const places = require('../../src/models/TrekkingPlace');
const document = (data) => ({ ...data, toJSON: () => data });

test('map URLs use the agent bucket and preserve the media bucket', () => {
  expect(r2.buildMapR2Url('/maps/ba-den/v2/map.zip')).toBe('https://maps.example/maps/ba-den/v2/map.zip');
  expect(r2.buildR2Url('photo.jpg')).toBe('https://media.example/photo.jpg');
  expect(r2.buildMapR2Url(null)).toBeNull();
});

test('a route without its own map resolves the current place package', async () => {
  places.findById.mockResolvedValue(document({ _id: 'p', offlineMap: { available: true, version: 2, objectKey: 'maps/ba-den/v2/map.zip' } }));
  routes.findById.mockResolvedValue(document({ _id: 'r', trekkingPlaceId: 'p', status: 'ACTIVE' }));
  const pkg = await service.getOfflinePackage('r');
  expect(pkg.mapManifest).toMatchObject({ scope: 'PLACE', entityId: 'p', version: 2, downloadUrl: 'https://maps.example/maps/ba-den/v2/map.zip' });
});

test('a legacy copied v1 map follows the place v2 on download and update checks', async () => {
  places.findById.mockResolvedValue(document({ _id: 'p', offlineMap: { available: true, version: 2, objectKey: 'maps/ba-den/v2/map.zip' } }));
  routes.findById.mockResolvedValue(document({ _id: 'r', trekkingPlaceId: 'p', status: 'ACTIVE', offlineMap: { available: true, version: 1, objectKey: 'maps/ba-den/v1/map.zip' } }));
  expect((await service.getOfflinePackage('r')).mapManifest.version).toBe(2);
  expect(await service.checkOfflinePackage('r', 1)).toMatchObject({ hasUpdate: true, serverVersion: 2 });
});

test('even legacy separate route tiles resolve the current place basemap', async () => {
  places.findById.mockResolvedValue(document({ _id: 'p', offlineMap: { available: true, version: 9, objectKey: 'maps/ba-den/v9/map.zip' } }));
  routes.findById.mockResolvedValue(document({ _id: 'r', trekkingPlaceId: 'p', status: 'ACTIVE', offlineMap: { available: true, version: 1, objectKey: 'maps/route-r/v1/map.zip' } }));
  expect((await service.getOfflinePackage('r')).mapManifest).toMatchObject({ version: 9, scope: 'PLACE', entityId: 'p' });
});

test('a legacy route ZIP does not substitute a missing place map', async () => {
  places.findById.mockResolvedValue(document({ _id: 'p', offlineMap: { available: false } }));
  routes.findById.mockResolvedValue(document({ _id: 'r', trekkingPlaceId: 'p', status: 'ACTIVE', offlineMap: { available: true, version: 1, objectKey: 'route.zip' } }));
  expect((await service.getOfflinePackage('r')).mapManifest).toMatchObject({ available: false, scope: 'PLACE', entityId: 'p' });
});
