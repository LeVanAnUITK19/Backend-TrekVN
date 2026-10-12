'use strict';
const AUTH_EVENTS = new Set(['TREKKING_JOURNEY_COMPLETED', 'CHECKIN_VERIFIED', 'PROVINCE_FIRST_VISITED', 'PLACE_FIRST_VISITED', 'TREKKING_BADGE_EARNED', 'TREKKING_CONTRIBUTION_APPROVED']);
const TREKKING_EVENTS = new Set(['TREKKING_CONTRIBUTION_APPROVED', 'CHECKIN_VERIFIED', 'TREKKING_JOURNEY_COMPLETED', 'PROVINCE_FIRST_VISITED', 'PLACE_FIRST_VISITED']);
const deliver = async (event) => {
  const token = process.env.TREKVIET_INTERNAL_TOKEN || process.env.SERVICE_TOKEN;
  if (!token) {throw new Error('Internal service token is required for event delivery');}
  const targets = [];
  if (AUTH_EVENTS.has(event.eventType)) {targets.push(`${process.env.AUTH_SERVICE_URL || 'http://localhost:3001'}/internal/v1/gamification/events`);}
  if (TREKKING_EVENTS.has(event.eventType)) {targets.push(`${process.env.TREKKING_SERVICE_URL || 'http://localhost:3003'}/internal/v1/events`);}
  for (const url of targets) {
    const response = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Service-Token': token },
      body: JSON.stringify(event), signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      const error = new Error(`Event delivery returned ${response.status} for ${url}`);
      error.retryable = response.status >= 500 || response.status === 429;
      throw error;
    }
    if (!(await response.json()).success) {throw new Error('Event delivery was not acknowledged');}
  }
};
module.exports = { deliver };
