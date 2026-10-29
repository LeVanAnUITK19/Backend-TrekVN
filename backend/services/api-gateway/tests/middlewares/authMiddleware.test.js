'use strict';

/**
 * Unit tests for src/middlewares/authMiddleware.js
 *
 * Requirements covered: 1.4, 1.5, 1.6
 *
 * Strategy: mock global `fetch` so the tests run without a live Auth Service.
 */

const { authMiddleware, isProtectedPath, PROTECTED_PATHS } = require('../../src/middlewares/authMiddleware');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal Express-like req object. */
function makeReq({ method = 'GET', path = '/', headers = {} } = {}) {
  return { method, path, headers };
}

/** Build a minimal Express-like res object that records what was sent. */
function makeRes() {
  const res = {
    _status: null,
    _body: null,
    status(code) { this._status = code; return this; },
    json(body) { this._body = body; return this; },
  };
  return res;
}

// ---------------------------------------------------------------------------
// isProtectedPath — unit tests
// ---------------------------------------------------------------------------

describe('isProtectedPath()', () => {
  test.each(PROTECTED_PATHS)('returns true for %s', (entry) => {
    const [method, path] = entry.split(' ');
    expect(isProtectedPath(method, path)).toBe(true);
  });

  test('returns false for an unprotected path', () => {
    expect(isProtectedPath('POST', '/api/v1/auth/login')).toBe(false);
  });

  test('returns false for wrong method on a protected path', () => {
    expect(isProtectedPath('DELETE', '/api/v1/users/me')).toBe(false);
  });

  test('is case-insensitive for method', () => {
    expect(isProtectedPath('get', '/api/v1/auth/verify')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// authMiddleware — integration-style unit tests
// ---------------------------------------------------------------------------

describe('authMiddleware()', () => {
  let next;

  beforeEach(() => {
    next = jest.fn();
    // Reset any mock set by previous tests
    if (global.fetch && global.fetch.mockRestore) global.fetch.mockRestore();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ---- Non-protected paths -----------------------------------------------

  test('calls next() immediately for non-protected paths', async () => {
    const req = makeReq({ method: 'POST', path: '/api/v1/auth/login' });
    const res = makeRes();

    await authMiddleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res._status).toBeNull();
  });

  test('calls next() for health check path', async () => {
    const req = makeReq({ method: 'GET', path: '/health' });
    const res = makeRes();

    await authMiddleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  // ---- Missing / malformed Authorization header --------------------------

  test('returns 401 when Authorization header is absent on protected path (Req 1.4)', async () => {
    const req = makeReq({ method: 'GET', path: '/api/v1/users/me' });
    const res = makeRes();

    await authMiddleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(401);
    expect(res._body).toEqual({ success: false, message: 'Thiếu token xác thực' });
  });

  test('returns 401 when Authorization header is not Bearer on protected path', async () => {
    const req = makeReq({
      method: 'GET',
      path: '/api/v1/users/me',
      headers: { authorization: 'Basic dXNlcjpwYXNz' },
    });
    const res = makeRes();

    await authMiddleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(401);
    expect(res._body.message).toBe('Thiếu token xác thực');
  });

  // ---- Successful token verification ------------------------------------

  test('calls next() when Auth Service returns 200 (Req 1.5)', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200,
      json: async () => ({ success: true, data: { id: 'user-a', role: 'USER' } }),
    });

    const req = makeReq({
      method: 'GET',
      path: '/api/v1/users/me',
      headers: { authorization: 'Bearer valid.token.here' },
    });
    const res = makeRes();

    await authMiddleware(req, res, next);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res._status).toBeNull();
    expect(req.user.id).toBe('user-a');
    expect(req.rateLimitUserId).toBe('user-a');
  });

  test('passes Authorization header to verify call', async () => {
    const capturedHeaders = {};
    global.fetch = jest.fn().mockImplementation((_url, options) => {
      Object.assign(capturedHeaders, options.headers);
      return Promise.resolve({ ok: true, status: 200,
        json: async () => ({ success: true, data: { id: 'user-a', role: 'USER' } }),
      });
    });

    const req = makeReq({
      method: 'GET',
      path: '/api/v1/auth/verify',
      headers: { authorization: 'Bearer my.jwt.token' },
    });
    const res = makeRes();

    await authMiddleware(req, res, next);

    expect(capturedHeaders.authorization).toBe('Bearer my.jwt.token');
  });

  // ---- Failed token verification (4xx) ----------------------------------

  test('returns 401 when Auth Service returns 401 (Req 1.6)', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401 });

    const req = makeReq({
      method: 'POST',
      path: '/api/v1/auth/logout',
      headers: { authorization: 'Bearer expired.token' },
    });
    const res = makeRes();

    await authMiddleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(401);
    expect(res._body).toEqual({
      success: false,
      message: 'Token không hợp lệ hoặc đã hết hạn',
    });
  });

  test('returns 401 when Auth Service returns 403', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 403 });

    const req = makeReq({
      method: 'GET',
      path: '/api/v1/users/me/settings',
      headers: { authorization: 'Bearer bad.token' },
    });
    const res = makeRes();

    await authMiddleware(req, res, next);

    expect(res._status).toBe(401);
    expect(res._body.message).toBe('Token không hợp lệ hoặc đã hết hạn');
  });

  // ---- Auth Service 5xx / unavailable -----------------------------------

  test('returns 503 when Auth Service returns 500', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });

    const req = makeReq({
      method: 'PATCH',
      path: '/api/v1/users/me',
      headers: { authorization: 'Bearer some.token' },
    });
    const res = makeRes();

    await authMiddleware(req, res, next);

    expect(res._status).toBe(503);
    expect(res._body.success).toBe(false);
  });

  // ---- Timeout (AbortError) -----------------------------------------------

  test('returns 503 when verify call times out (AbortError)', async () => {
    global.fetch = jest.fn().mockRejectedValue(
      Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })
    );

    const req = makeReq({
      method: 'PATCH',
      path: '/api/v1/users/me/password',
      headers: { authorization: 'Bearer slow.token' },
    });
    const res = makeRes();

    await authMiddleware(req, res, next);

    expect(res._status).toBe(503);
    expect(res._body.message).toBe('Dịch vụ tạm thời không khả dụng');
  });

  // ---- Network error (non-AbortError) -----------------------------------

  test('calls next(err) on unexpected network errors', async () => {
    const networkErr = new Error('ECONNREFUSED');
    global.fetch = jest.fn().mockRejectedValue(networkErr);

    const req = makeReq({
      method: 'GET',
      path: '/api/v1/users/me',
      headers: { authorization: 'Bearer some.token' },
    });
    const res = makeRes();

    await authMiddleware(req, res, next);

    expect(next).toHaveBeenCalledWith(networkErr);
    expect(res._status).toBeNull();
  });

  // ---- All protected paths are actually protected -----------------------

  test.each(PROTECTED_PATHS)(
    'returns 401 (no header) for protected path %s',
    async (entry) => {
      const [method, path] = entry.split(' ');
      const req = makeReq({ method, path, headers: {} });
      const res = makeRes();

      await authMiddleware(req, res, next);

      expect(res._status).toBe(401);
      expect(res._body.message).toBe('Thiếu token xác thực');
    }
  );
});

// ---------------------------------------------------------------------------
// Trekking-service prefix-based protection — added when trekking-service
// was integrated into the gateway.
// ---------------------------------------------------------------------------

describe('isProtectedPath() — trekking prefix protection', () => {
  const protectedTrekkingPaths = [
    ['POST', '/api/v1/places/p/reviews'],
    ['GET', '/api/v1/places/p/reviews/me'],
    ['GET', '/api/v1/places/p/reviews/eligibility'],
    ['POST', '/api/v1/journeys'],
    ['GET', '/api/v1/journeys/some-id'],
    ['POST', '/api/v1/journeys/some-id/start'],
    ['POST', '/api/v1/journeys/some-id/markers'],
    ['DELETE', '/api/v1/journeys/some-id/markers/marker-id'],
    ['POST', '/api/v1/contributions/routes'],
    ['POST', '/api/v1/contributions/places'],
    ['GET', '/api/v1/me/contributions'],
    ['GET', '/api/v1/me/badges'],
    ['GET', '/api/v1/admin/trekking/places'],
    ['POST', '/api/v1/admin/contributions/123/review'],
    ['GET', '/api/v1/admin/badges'],
  ];

  test.each(protectedTrekkingPaths)(
    '%s %s is protected (requires auth)',
    (method, path) => {
      expect(isProtectedPath(method, path)).toBe(true);
    }
  );

  const publicTrekkingPaths = [
    ['GET', '/api/v1/places'],
    ['GET', '/api/v1/places/some-id'],
    ['GET', '/api/v1/places/some-id/routes'],
    ['GET', '/api/v1/places/some-id/reviews'],
    ['GET', '/api/v1/routes/some-id'],
    ['GET', '/api/v1/routes/some-id/milestones'],
    ['GET', '/api/v1/routes/some-id/offline-package'],
    ['GET', '/api/v1/badges'],
  ];

  test.each(publicTrekkingPaths)(
    '%s %s is public (no auth required)',
    (method, path) => {
      expect(isProtectedPath(method, path)).toBe(false);
    }
  );
});
