'use strict';

/**
 * BadgeEvaluator — evaluates badge conditions and awards badges.
 *
 * Called after domain events:
 *   - Journey completed
 *   - Verified check-in (milestone type matters)
 *   - Province first visited
 *   - Place first visited
 *
 * Badge condition types:
 *   JOURNEY_COMPLETED_COUNT     — completedJourneys >= value
 *   SUMMIT_CHECKIN_COUNT        — summmitCheckins >= value  (needs checkin type tracking)
 *   DISTANCE_TOTAL              — totalDistanceMeters >= value
 *   PROVINCE_VISITED_COUNT      — visitedProvinces >= value
 *   ALTITUDE_REACHED            — maxAltitude >= value
 *   PLACE_VISITED_COUNT         — visitedPlaces >= value
 *   FIRST_JOURNEY               — completedJourneys >= 1
 *
 * After earning badge: publish TREKKING_BADGE_EARNED event.
 * Gamification consumer handles XP.
 *
 * Idempotent: (userId, badgeId) unique — duplicate calls are safe.
 */

const Badge = require('../models/Badge');
const { isConditionMet } = require('./badgeCondition');
const userBadgeRepo = require('../repositories/userBadge.repository');
const outboxRepo = require('../repositories/eventOutbox.repository');
const { EVENT_TYPES } = require('../constants/events');
const logger = require('../config/logger');

/**
 * Evaluate all ACTIVE badges for a user based on their current stats.
 *
 * @param {string} userId
 * @param {object} stats - { completedJourneys, totalDistanceMeters, visitedProvinces, visitedPlaces, maxAltitude, summitCheckins }
 * @param {string|null} journeyId - Journey that triggered this evaluation (for badge attribution)
 * @returns {Array} newly awarded badges
 */
const evaluateBadges = async (userId, stats, journeyId = null) => {
  // Load all ACTIVE badges
  const badges = await Badge.find({ status: 'ACTIVE' });
  const newlyEarned = [];

  for (const badge of badges) {
    if (!badge.condition) { continue; }

    // Check if user already has this badge
    const existing = await userBadgeRepo.findByUserAndBadge(userId, badge._id);
    if (existing) {
      // User already has this badge - skip to prevent duplicate XP awards
      continue;
    }

    // Evaluate condition
    const met = isConditionMet(badge.condition, stats);
    if (!met) { continue; }

    // Award badge — unique index prevents duplicate
    let userBadge;
    try {
      userBadge = await userBadgeRepo.create({
        userId,
        badgeId: badge._id,
        journeyId: journeyId || null,
        earnedAt: new Date(),
      });
    } catch (err) {
      if (err.code === 11000) {
        // Already earned (race condition) — safe to skip
        continue;
      }
      logger.error(`[BadgeEvaluator] Failed to award badge ${badge.code} to ${userId}: ${err.message}`);
      throw err;
    }

    newlyEarned.push({ badge, userBadge });

    // Publish BADGE_EARNED event (via outbox for reliability)
    const eventPayload = {
      userId,
      badgeId: String(badge._id),
      badgeCode: badge.code,
      rarity: badge.rarity,
      journeyId: journeyId || null,
    };
    await outboxRepo.enqueue(EVENT_TYPES.TREKKING_BADGE_EARNED, eventPayload, 'badge:' + userId + ':' + badge._id);
    logger.info(`[BadgeEvaluator] Awarded badge ${badge.code} to user ${userId}`);
  }

  return newlyEarned;
};

module.exports = { evaluateBadges };
