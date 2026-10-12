'use strict';

jest.mock('../../src/config/env', () => ({ TREKKING_SERVICE_URL: 'http://trekking', AUTH_SERVICE_URL: 'http://auth', CHECKIN_SERVICE_URL: 'http://checkins', AGENT_SERVICE_URL: 'http://agent' }));
jest.mock('http-proxy', () => ({
  createProxyServer: options => ({
    on: jest.fn(),
    web: (req, res) => res.json({ timeout: options.proxyTimeout, originalUrl: req.originalUrl, target: options.target }),
  }),
}));
const express = require('express');
const request = require('supertest');
const { trekkingRouter } = require('../../src/routes/proxy');
const app = express();
app.use('/api/v1/admin/trekking', trekkingRouter);

test('ZIP streaming gets enough time and preserves the complete published-place path', async () => {
  const url = '/api/v1/admin/trekking/places/p/offline-map/file?version=3';
  const response = await request(app).get(url);
  expect(response.body).toEqual({ timeout: 120000, originalUrl: url, target: 'http://trekking' });
});
test.each(['/api/v1/admin/trekking/places/p/offline-map', '/api/v1/admin/trekking/routes/r'])('normal metadata requests keep their usual timeout (%s)', async url => {
  expect((await request(app).get(url)).body.timeout).toBe(30000);
});
