'use strict';

// DISTANCE_TOTAL uses kilometres in admin. METERS is available for explicit legacy rules.
const CONDITION_TYPES = [
  'CHECKIN_COUNT', 'JOURNEY_COUNT', 'PROVINCE_COUNT', 'CONTRIBUTION_APPROVED',
  'SPECIFIC_PLACE', 'ELEVATION_TOTAL', 'DISTANCE_TOTAL', 'JOURNEY_COMPLETED_COUNT',
  'SUMMIT_CHECKIN_COUNT', 'PROVINCE_VISITED_COUNT', 'ALTITUDE_REACHED',
  'PLACE_VISITED_COUNT', 'FIRST_JOURNEY',
];
const conditionProgress = (condition, stats) => {
  switch (condition?.type) {
    case 'CHECKIN_COUNT': return stats.totalCheckins || 0;
    case 'JOURNEY_COUNT':
    case 'JOURNEY_COMPLETED_COUNT':
    case 'FIRST_JOURNEY': return stats.completedJourneys || 0;
    case 'SUMMIT_CHECKIN_COUNT': return stats.summitCheckins || 0;
    case 'PROVINCE_COUNT':
    case 'PROVINCE_VISITED_COUNT': return stats.visitedProvinces || 0;
    case 'PLACE_VISITED_COUNT': return stats.visitedPlaces || 0;
    case 'CONTRIBUTION_APPROVED': return stats.approvedContributions || 0;
    case 'ELEVATION_TOTAL': return stats.totalElevationGain || 0;
    case 'ALTITUDE_REACHED': return stats.maxAltitude || 0;
    case 'DISTANCE_TOTAL': return (stats.totalDistanceMeters || 0) / (condition.unit === 'METERS' ? 1 : 1000);
    case 'SPECIFIC_PLACE': return (stats.visitedPlaceIds || []).map(String).includes(String(condition.placeId)) ? 1 : 0;
    default: return null;
  }
};
const isConditionMet = (condition, stats) => {
  const current = conditionProgress(condition, stats);
  const target = condition?.type === 'SPECIFIC_PLACE' ? 1 : Number(condition?.value ?? (condition?.type === 'FIRST_JOURNEY' ? 1 : undefined));
  return current !== null && Number.isFinite(target) && target > 0 && current >= target;
};
module.exports = { CONDITION_TYPES, conditionProgress, isConditionMet };
