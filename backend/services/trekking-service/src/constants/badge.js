'use strict';

const BADGE_CATEGORIES = ['TREKKING', 'EXPLORATION', 'DISTANCE', 'PROVINCE'];

const BADGE_RARITIES = ['COMMON', 'RARE', 'EPIC', 'LEGENDARY'];

const BADGE_STATUS = { ACTIVE: 'ACTIVE', INACTIVE: 'INACTIVE' };

/**
 * XP theo rarity badge (FR-RANK-07).
 * Không tính ở trekking-service — chỉ dùng để document;
 * auth/gamification service consume event và tính XP.
 */
const BADGE_RARITY_XP = {
  COMMON: 50,
  RARE: 150,
  EPIC: 400,
  LEGENDARY: 1000,
};

module.exports = { BADGE_CATEGORIES, BADGE_RARITIES, BADGE_STATUS, BADGE_RARITY_XP };
