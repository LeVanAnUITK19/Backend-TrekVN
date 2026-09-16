/**
 * Test: GET/PATCH /api/v1/users/me — Profile & Settings
 */

const request = require('supertest');
const db = require('../setup/db');
const createApp = require('../../src/app');
const { createActiveUser, createSettings } = require('../helpers/factory');

jest.mock('../../src/config/mailer', () => ({
  sendMail: jest.fn().mockResolvedValue({ messageId: 'test-msg-id' }),
}));

let app;

beforeAll(async () => {
  await db.connect();
  app = createApp();
});

afterEach(async () => {
  await db.clearCollections();
});

afterAll(async () => {
  await db.disconnect();
});

const loginAs = async (email, password = 'Pass@123') => {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password });
  return res.body.data;
};

// ─── GET /me ──────────────────────────────────────────────────────────────────

describe('GET /api/v1/users/me', () => {
  it('token hợp lệ → 200, trả về profile (không có passwordHash)', async () => {
    await createActiveUser({ email: 'me@example.com', password: 'Pass@123' });
    const { accessToken } = await loginAs('me@example.com');

    const res = await request(app)
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe('me@example.com');
    expect(res.body.data.passwordHash).toBeUndefined();
    expect(res.body.data.userId).toBeDefined();
  });

  it('không có token → 401', async () => {
    const res = await request(app).get('/api/v1/users/me');
    expect(res.status).toBe(401);
  });

  it('token hết hạn / sai → 401', async () => {
    const res = await request(app)
      .get('/api/v1/users/me')
      .set('Authorization', 'Bearer invalid.token.here');
    expect(res.status).toBe(401);
  });
});

// ─── PATCH /me ────────────────────────────────────────────────────────────────

describe('PATCH /api/v1/users/me', () => {
  it('cập nhật displayName + bio → 200', async () => {
    await createActiveUser({ email: 'update@example.com', password: 'Pass@123' });
    const { accessToken } = await loginAs('update@example.com');

    const res = await request(app)
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ displayName: 'Updated Name', bio: 'Yêu trekking' });

    expect(res.status).toBe(200);
    expect(res.body.data.displayName).toBe('Updated Name');
    expect(res.body.data.bio).toBe('Yêu trekking');
  });

  it('cập nhật avatarUrl hợp lệ → 200', async () => {
    await createActiveUser({ email: 'avatar@example.com', password: 'Pass@123' });
    const { accessToken } = await loginAs('avatar@example.com');

    const res = await request(app)
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ avatarUrl: 'https://example.com/avatar.jpg' });

    expect(res.status).toBe(200);
    expect(res.body.data.avatarUrl).toBe('https://example.com/avatar.jpg');
  });

  it('avatarUrl không phải URI → 400', async () => {
    await createActiveUser({ email: 'badurl@example.com', password: 'Pass@123' });
    const { accessToken } = await loginAs('badurl@example.com');

    const res = await request(app)
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ avatarUrl: 'not-a-url' });

    expect(res.status).toBe(400);
  });

  it('body rỗng → 400 (ít nhất 1 trường)', async () => {
    await createActiveUser({ email: 'empty@example.com', password: 'Pass@123' });
    const { accessToken } = await loginAs('empty@example.com');

    const res = await request(app)
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it('displayName < 2 ký tự → 400', async () => {
    await createActiveUser({ email: 'short@example.com', password: 'Pass@123' });
    const { accessToken } = await loginAs('short@example.com');

    const res = await request(app)
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ displayName: 'A' });

    expect(res.status).toBe(400);
  });
});

// ─── Settings ─────────────────────────────────────────────────────────────────

describe('GET /api/v1/users/me/settings', () => {
  it('trả về settings mặc định nếu chưa có', async () => {
    await createActiveUser({ email: 'settings@example.com', password: 'Pass@123' });
    const { accessToken } = await loginAs('settings@example.com');

    const res = await request(app)
      .get('/api/v1/users/me/settings')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.language).toBeDefined();
    expect(res.body.data.theme).toBeDefined();
  });

  it('không có token → 401', async () => {
    const res = await request(app).get('/api/v1/users/me/settings');
    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/v1/users/me/settings', () => {
  it('cập nhật theme + language → 200', async () => {
    await createActiveUser({ email: 'setsave@example.com', password: 'Pass@123' });
    const { accessToken } = await loginAs('setsave@example.com');

    const res = await request(app)
      .patch('/api/v1/users/me/settings')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ theme: 'light', language: 'en' });

    expect(res.status).toBe(200);
    expect(res.body.data.theme).toBe('light');
    expect(res.body.data.language).toBe('en');
  });

  it('theme không hợp lệ → 400', async () => {
    await createActiveUser({ email: 'badtheme@example.com', password: 'Pass@123' });
    const { accessToken } = await loginAs('badtheme@example.com');

    const res = await request(app)
      .patch('/api/v1/users/me/settings')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ theme: 'rainbow' });

    expect(res.status).toBe(400);
  });

  it('distanceUnit không hợp lệ → 400', async () => {
    await createActiveUser({ email: 'badunit@example.com', password: 'Pass@123' });
    const { accessToken } = await loginAs('badunit@example.com');

    const res = await request(app)
      .patch('/api/v1/users/me/settings')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ distanceUnit: 'meter' });

    expect(res.status).toBe(400);
  });

  it('body rỗng → 400', async () => {
    await createActiveUser({ email: 'emptyset@example.com', password: 'Pass@123' });
    const { accessToken } = await loginAs('emptyset@example.com');

    const res = await request(app)
      .patch('/api/v1/users/me/settings')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({});

    expect(res.status).toBe(400);
  });
});
