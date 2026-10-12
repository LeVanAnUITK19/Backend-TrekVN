const request = require('supertest');
const db = require('../setup/db');
const createApp = require('../../src/app');
const User = require('../../src/models/User');
const { createActiveUser } = require('../helpers/factory');

let app;
beforeAll(async () => { await db.connect(); app = createApp(); });
afterEach(db.clearCollections);
afterAll(db.disconnect);

const session = async (role = 'USER') => {
  const user = await createActiveUser({ email: 'security@example.com', password: 'Pass@123', role });
  const login = await request(app).post('/api/v1/auth/login').send({ email: user.email, password: 'Pass@123' });
  return { ...login.body.data, user };
};

test('blocked accounts cannot verify an already issued access token', async () => {
  const { user, accessToken } = await session();
  await User.findByIdAndUpdate(user._id, { status: 'BLOCKED' });
  const response = await request(app).get('/api/v1/auth/verify').auth(accessToken, { type: 'bearer' });
  expect(response.status).toBe(401);
});

test('demoted admins lose admin privileges before their JWT expires', async () => {
  const { user, accessToken } = await session('ADMIN');
  await User.findByIdAndUpdate(user._id, { role: 'USER' });
  const response = await request(app).get('/api/v1/admin/audit-logs').auth(accessToken, { type: 'bearer' });
  expect(response.status).toBe(403);
  const verified = await request(app).get('/api/v1/auth/verify').auth(accessToken, { type: 'bearer' });
  expect(verified.body.data.role).toBe('USER');
});

test('only one concurrent request can rotate a refresh token', async () => {
  const { refreshToken } = await session();
  const responses = await Promise.all(Array.from({ length: 4 }, () =>
    request(app).post('/api/v1/auth/refresh').send({ refreshToken })));
  expect(responses.map((response) => response.status).sort()).toEqual([200, 401, 401, 401]);
});

test('blocked accounts cannot request a registration OTP to reactivate themselves', async () => {
  const { user } = await session();
  await User.findByIdAndUpdate(user._id, { status: 'BLOCKED' });
  const response = await request(app).post('/api/v1/auth/resend-verification-otp').send({ email: user.email });
  expect(response.status).toBe(400);
  expect((await User.findById(user._id)).status).toBe('BLOCKED');
});
