'use strict';

const journeyRepo = require('../repositories/journey.repository');

const getUserBadgeStats = async (userId) => {
  const [journeys, routes, places, response] = await Promise.all([
    journeyRepo.getUserStatistics(userId),
    require('../models/RouteSubmission').countDocuments({ userId, status: 'APPROVED' }),
    require('../models/PlaceSuggestion').countDocuments({ userId, status: 'APPROVED' }),
    fetch(`${process.env.CHECKIN_SERVICE_URL || 'http://localhost:3002'}/internal/v1/users/${encodeURIComponent(userId)}/stats`, {
      headers: { 'X-Service-Token': process.env.TREKVIET_INTERNAL_TOKEN || process.env.SERVICE_TOKEN || '' },
      signal: AbortSignal.timeout(5000),
    }),
  ]);
  if (!response.ok) {throw new Error(`Check-in statistics returned ${response.status}`);}
  const { data } = await response.json();
  if (!data) {throw new Error('Check-in statistics missing');}
  return {
    completedJourneys: journeys.totalJourneys || 0,
    totalDistanceMeters: journeys.totalDistanceMeters || 0,
    totalElevationGain: journeys.totalElevationGain || 0,
    totalCheckins: data.totalCheckins || 0,
    visitedProvinces: data.visitedProvinces || 0,
    visitedPlaces: data.visitedPlaces || 0,
    visitedPlaceIds: data.visitedPlaceIds || [],
    maxAltitude: Math.max(journeys.maxAltitude || 0, data.maxAltitude || 0),
    summitCheckins: data.summitCheckins || 0,
    approvedContributions: routes + places,
  };
};

module.exports = { getUserBadgeStats };
