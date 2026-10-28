'use strict';
const logger = require('../config/logger');
const { AppError } = require('../utils/errors');

async function request(baseUrl, path, options = {}) {
  try {
    const response = await fetch(`${baseUrl}${path}`, { ...options, signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new AppError(response.status === 404 ? 400 : 503, 'UPSTREAM_ERROR', 'Không lấy được dữ liệu liên kết');
    return (await response.json()).data;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(503, 'UPSTREAM_UNAVAILABLE', 'Dịch vụ liên kết tạm thời không khả dụng');
  }
}
async function lookupUsers(ids) {
  const unique = [...new Set(ids)].slice(0, 100);
  const token = process.env.TREKVIET_INTERNAL_TOKEN || process.env.SERVICE_TOKEN;
  if (!unique.length || !token) return new Map();
  try {
    const users = await request(process.env.AUTH_SERVICE_URL || 'http://localhost:3001', '/internal/v1/users/lookup', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-service-token': token },
      body: JSON.stringify({ userIds: unique }),
    });
    // Never forward email or other internal user fields to community clients.
    return new Map(users.map((u) => [u.id, { name: u.name, avatarUrl: u.avatarUrl }]));
  } catch (err) {
    logger.warn({ message: 'Author lookup unavailable', reason: err.message });
    return new Map();
  }
}
async function validateLinks(body, authorization) {
  const base = process.env.TREKKING_SERVICE_URL || 'http://localhost:3003';
  if (body.type === 'JOURNEY_SHARE' && !body.journeyId) {
    throw new AppError(400, 'JOURNEY_REQUIRED', 'Bài chia sẻ hành trình cần journeyId');
  }
  if (body.journeyId) {
    // Existing owner-scoped trekking endpoint validates ownership with the caller's JWT.
    const journey = await request(base, `/api/v1/journeys/${body.journeyId}`, { headers: { authorization } });
    if (!/^[a-fA-F0-9]{24}$/.test(journey?.trekkingPlaceId || '')) {
      throw new AppError(503, 'INVALID_UPSTREAM_RESPONSE', 'Không lấy được địa điểm của hành trình');
    }
    if (body.trekkingPlaceId && body.trekkingPlaceId !== String(journey.trekkingPlaceId)) {
      throw new AppError(400, 'PLACE_MISMATCH', 'Địa điểm không khớp với hành trình');
    }
    body.trekkingPlaceId = String(journey.trekkingPlaceId);
  } else if (body.trekkingPlaceId) {
    await request(base, `/api/v1/places/${body.trekkingPlaceId}`);
  }
}
module.exports = { lookupUsers, validateLinks };
