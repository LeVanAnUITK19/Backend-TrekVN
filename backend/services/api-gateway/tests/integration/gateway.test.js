'use strict';

/**
 * Integration tests for the API Gateway.
 *
 * Requirements covered: 1.1, 1.4, 1.7
 *
 * Test suite:
 *   1. Smoke — app module loads without errors
 *   2. GET /api/v1/auth/verify without Authorization header → 401
 *   3. Proxy to unreachable Auth Service → 503
 */

const request = require('supertest');

// ---------------------------------------------------------------------------
// Test 1 — Smoke: app module loads without errors (Req 1.1)
// ---------------------------------------------------------------------------
describe('Smoke test', () => {
  test('app module loads without errors', () => {
    // Clear any cached module from previous test suites to get a clean load
    jest.resetModules();
    const app = require('../../src/app');
    expect(app).toBeDefined();
    // Should be an Express application (has a `listen` method)
    expect(typeof app.listen).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// Test 2 — GET /api/v1/auth/verify without Authorization header → 401 (Req 1.4)
// ---------------------------------------------------------------------------
describe('Protected endpoint without Authorization header', () => {
  let app;

  beforeAll(() => {
    jest.resetModules();
    // Use a reachable AUTH_SERVICE_URL so that the auth middleware itself
    // (not the proxy) is the one rejecting the request before any proxy call.
    process.env.AUTH_SERVICE_URL = 'http://localhost:3001';
    app = require('../../src/app');
  });

  afterAll(() => {
    delete process.env.AUTH_SERVICE_URL;
  });

  test('GET /api/v1/auth/verify — no Authorization header → 401 (Req 1.4)', async () => {
    const res = await request(app)
      .get('/api/v1/auth/verify')
      // Deliberately omit the Authorization header
      .expect('Content-Type', /json/)
      .expect(401);

    expect(res.body).toEqual({
      success: false,
      message: 'Thiếu token xác thực',
    });
  });
});

// ---------------------------------------------------------------------------
// Test 3 — Auth Service down → 503 (Req 1.7)
//
// Strategy: set AUTH_SERVICE_URL to an address where nothing is listening
// (port 19999) before requiring app.js so the proxy target is unreachable.
// We send a request to an UNPROTECTED endpoint (/api/v1/auth/login) so the
// auth middleware passes through and the proxy actually attempts a connection,
// which then fails with ECONNREFUSED → 503.
// ---------------------------------------------------------------------------
describe('Auth Service unavailable', () => {
  let app;

  beforeAll(() => {
    jest.resetModules();
    // Point to a port where nothing is listening
    process.env.AUTH_SERVICE_URL = 'http://localhost:19999';
    app = require('../../src/app');
  });

  afterAll(() => {
    delete process.env.AUTH_SERVICE_URL;
    // Clean up all modules so subsequent test runs start fresh
    jest.resetModules();
  });

  test('proxy to unreachable Auth Service returns 503 (Req 1.7)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'test@example.com', password: 'password123' })
      .set('Content-Type', 'application/json');

    // Debug: log what we actually got
    console.log('Status:', res.status);
    console.log('Headers:', res.headers);
    console.log('Body:', res.body);
    console.log('Text:', res.text);

    expect(res.status).toBe(503);
  }, 35000);
});
