'use strict';

const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

// ─── JWT helpers ──────────────────────────────────────────────────────────────

const generateToken = (payload = {}) => {
  const defaults = {
    id: new mongoose.Types.ObjectId().toString(),
    email: 'test@trekvn.com',
    role: 'USER',
  };
  return jwt.sign({ ...defaults, ...payload }, process.env.JWT_SECRET, { expiresIn: '1h' });
};

const generateAdminToken = (overrides = {}) =>
  generateToken({ role: 'ADMIN', ...overrides });

// ─── DB Factories ─────────────────────────────────────────────────────────────

const createPlace = async (overrides = {}) => {
  const TrekkingPlace = require('../../src/models/TrekkingPlace');
  return TrekkingPlace.create({
    name: 'Núi Test',
    slug: `nui-test-${Date.now()}`,
    provinceId: 'province_test',
    location: { type: 'Point', coordinates: [108.441, 12.05] },
    description: 'Mô tả địa điểm test',
    difficulty: 'MODERATE',
    status: 'ACTIVE',
    ...overrides,
  });
};

const createRoute = async (placeId, overrides = {}) => {
  const TrekkingRoute = require('../../src/models/TrekkingRoute');
  return TrekkingRoute.create({
    trekkingPlaceId: placeId,
    name: 'Route Test',
    description: 'Mô tả route test',
    difficulty: 'MODERATE',
    distanceMeters: 10000,
    status: 'ACTIVE',
    ...overrides,
  });
};

const createMilestone = async (routeId, overrides = {}) => {
  const Milestone = require('../../src/models/Milestone');
  return Milestone.create({
    trekkingRouteId: routeId,
    name: 'Start Point',
    type: 'START',
    sequence: overrides.sequence || 1,
    location: { type: 'Point', coordinates: [108.441, 12.05] },
    checkinRadiusMeters: 50,
    ...overrides,
  });
};

const createJourney = async (userId, placeId, routeId, overrides = {}) => {
  const Journey = require('../../src/models/Journey');
  return Journey.create({
    userId,
    trekkingPlaceId: placeId,
    trekkingRouteId: routeId,
    provinceId: 'province_test',
    name: 'Test Journey',
    status: 'PLANNED',
    ...overrides,
  });
};

const createCompletedJourney = async (userId, placeId, routeId, overrides = {}) => {
  return createJourney(userId, placeId, routeId, {
    status: 'COMPLETED',
    startedAt: new Date(Date.now() - 3600000),
    completedAt: new Date(),
    statistics: { distanceMeters: 10000, durationSeconds: 3600, elevationGain: 500 },
    track: { encodedPolyline: 'test_polyline' },
    clientJourneyId: `completed_${userId}_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    ...overrides,
  });
};

const createMarker = async (journeyId, userId, overrides = {}) => {
  const JourneyMarker = require('../../src/models/JourneyMarker');
  return JourneyMarker.create({
    journeyId,
    userId,
    name: 'Test Marker',
    type: 'VIEWPOINT',
    location: { type: 'Point', coordinates: [108.441, 12.05] },
    markedAt: new Date(),
    ...overrides,
  });
};

// ─── Request helpers ──────────────────────────────────────────────────────────

const journeyPayload = (placeId, routeId, overrides = {}) => ({
  trekkingPlaceId: String(placeId),
  trekkingRouteId: String(routeId),
  name: 'Hành trình test',
  plannedStartAt: new Date().toISOString(),
  ...overrides,
});

const markerPayload = (overrides = {}) => ({
  name: 'Điểm ngắm cảnh đẹp',
  type: 'VIEWPOINT',
  location: { type: 'Point', coordinates: [108.441, 12.05] },
  markedAt: new Date().toISOString(),
  ...overrides,
});

const completePayload = (overrides = {}) => ({
  statistics: {
    distanceMeters: 12000,
    durationSeconds: 7200,
    elevationGain: 800,
    maxAltitude: 2000,
    averageSpeed: 1.7,
  },
  track: { encodedPolyline: '_p~iF~ps|U_ulLnnqC_mqNvxq`@' },
  ...overrides,
});

module.exports = {
  generateToken,
  generateAdminToken,
  createPlace,
  createRoute,
  createMilestone,
  createJourney,
  createCompletedJourney,
  createMarker,
  journeyPayload,
  markerPayload,
  completePayload,
};
