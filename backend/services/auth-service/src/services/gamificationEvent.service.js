'use strict';

const mongoose = require('mongoose');
const ProcessedEvent = require('../models/ProcessedEvent');
const Profile = require('../models/UserRankProfile');
const Rank = require('../models/RankDefinition');
const XpTransaction = require('../models/XpTransaction');
const RankHistory = require('../models/RankHistory');

const XP = {
  JOURNEY_COMPLETED: 150, PER_KM: 5, PER_100M_ELEVATION: 10,
  MILESTONE: { CHECKPOINT: 10, VIEWPOINT: 15, CAMP: 20, SUMMIT: 50, FINISH: 20, DEFAULT: 5 },
  PROVINCE_FIRST: 100, PLACE_FIRST: 50,
  BADGE: { COMMON: 50, RARE: 150, EPIC: 400, LEGENDARY: 1000 },
  ROUTE_APPROVED: 300, PLACE_APPROVED: 200,
};
const CONSUMER = 'gamification';
const EVENTS = new Set([
  'TREKKING_JOURNEY_COMPLETED', 'CHECKIN_VERIFIED', 'PROVINCE_FIRST_VISITED',
  'PLACE_FIRST_VISITED', 'TREKKING_BADGE_EARNED', 'TREKKING_CONTRIBUTION_APPROVED',
]);
const nonnegative = (value) => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;

/** Commit the XP ledger, statistics, rank history and event receipt together.
 * MongoDB must support transactions (replica set / Atlas).
 */
const handleEvent = async ({ eventId, eventType, payload } = {}) => {
  if (!eventId || !EVENTS.has(eventType) || !payload?.userId) {return;}
  if (await ProcessedEvent.exists({ eventId, consumerName: CONSUMER })) {return;}
  try {
    await mongoose.connection.transaction(async (session) => {
      if (await ProcessedEvent.findOne({ eventId, consumerName: CONSUMER }).session(session)) {return;}
      const { userId } = payload;
      let profile = await Profile.findOne({ userId }).session(session);
      const ranks = await Rank.find({ status: 'ACTIVE' }).sort({ level: 1 }).session(session);
      const newbie = ranks.find((rank) => rank.code === 'NEWBIE');
      if (!newbie) {throw new Error('NEWBIE rank missing; run seed:ranks');}
      if (!profile) {profile = new Profile({ userId, currentRankId: newbie._id });}
      const requireId = (id, name) => {
        if (!id) {throw new Error(`${eventType} missing ${name}`);}
        return String(id);
      };
      const grant = async (sourceType, sourceId, amount, key, description, counters = {}) => {
        if (await XpTransaction.findOne({ idempotencyKey: key }).session(session)) {return;}
        if (amount > 0) {
          await XpTransaction.create([{
            userId, transactionType: 'EARN', sourceType, sourceId, xpAmount: amount,
            idempotencyKey: key, description,
          }], { session });
          profile.totalXp += amount;
        }
        for (const [field, delta] of Object.entries(counters)) {profile[field] += delta;}
      };
      switch (eventType) {
        case 'TREKKING_JOURNEY_COMPLETED': {
          const id = requireId(payload.journeyId, 'journeyId');
          const distance = nonnegative(payload.distanceMeters);
          const elevation = nonnegative(payload.elevationGain);
          // Keep partial km / elevation statistics even when no whole XP unit is earned.
          await grant('JOURNEY_COMPLETED', id, XP.JOURNEY_COMPLETED, `journey_complete:${id}`, 'Hoàn thành hành trình', {
            completedJourneyCount: 1, totalDistanceMeters: distance, totalElevationGain: elevation,
          });
          await grant('JOURNEY_DISTANCE', id, Math.floor(distance / 1000) * XP.PER_KM,
            `journey_distance:${id}`, `Quãng đường ${distance}m`);
          await grant('JOURNEY_ELEVATION', id, Math.floor(elevation / 100) * XP.PER_100M_ELEVATION,
            `journey_elevation:${id}`, `Chinh phục ${elevation}m độ cao`);
          break;
        }
        case 'CHECKIN_VERIFIED': {
          const id = requireId(payload.checkinId, 'checkinId');
          const type = payload.milestoneType;
          await grant('MILESTONE_CHECKIN', id, XP.MILESTONE[type] || XP.MILESTONE.DEFAULT,
            `checkin:${id}`, `Check-in cột mốc ${type}`, { verifiedCheckinCount: 1 });
          break;
        }
        case 'PROVINCE_FIRST_VISITED': {
          const id = requireId(payload.provinceId, 'provinceId');
          await grant('PROVINCE_VISITED', id, XP.PROVINCE_FIRST, `province_first:${userId}:${id}`,
            'Khám phá tỉnh mới', { visitedProvinceCount: 1 });
          break;
        }
        case 'PLACE_FIRST_VISITED': {
          const id = requireId(payload.trekkingPlaceId, 'trekkingPlaceId');
          await grant('PLACE_VISITED', id, XP.PLACE_FIRST, `place_first:${userId}:${id}`,
            'Khám phá địa điểm mới', { visitedPlaceCount: 1 });
          break;
        }
        case 'TREKKING_BADGE_EARNED': {
          const id = requireId(payload.badgeId, 'badgeId');
          const rarity = payload.rarity || 'COMMON';
          await grant('BADGE_EARNED', id, XP.BADGE[rarity] || XP.BADGE.COMMON, `badge:${userId}:${id}`,
            `Nhận huy hiệu ${rarity}`, { badgeCount: 1 });
          break;
        }
        case 'TREKKING_CONTRIBUTION_APPROVED': {
          const id = requireId(payload.contributionId, 'contributionId');
          // Accept the original publisher contract and the explicit field used by newer clients.
          const type = payload.contributionType || payload.type;
          if (!['PLACE_SUGGESTION', 'ROUTE_SUBMISSION'].includes(type)) {throw new Error('Invalid contribution type');}
          const source = type === 'PLACE_SUGGESTION' ? 'PLACE_APPROVED' : 'ROUTE_APPROVED';
          await grant(source, id, XP[source], `contribution:${id}`, 'Đóng góp dữ liệu được duyệt', { approvedContributionCount: 1 });
          break;
        }
      }
      const currentRank = await Rank.findById(profile.currentRankId).session(session);
      const eligible = ranks.filter((rank) =>
        profile.totalXp >= rank.minXp && profile.completedJourneyCount >= rank.minCompletedJourneys &&
        profile.visitedProvinceCount >= rank.minVisitedProvinces && profile.badgeCount >= rank.minBadgeCount &&
        profile.totalDistanceMeters >= rank.minDistanceMeters && profile.approvedContributionCount >= rank.minApprovedContributions
      ).at(-1) || newbie;
      if (String(profile.currentRankId) !== String(eligible._id)) {
        await RankHistory.create([{
          userId, previousRankId: currentRank?._id || null, newRankId: eligible._id,
          xpAtChange: profile.totalXp, changeType: eligible.level > (currentRank?.level || 0) ? 'PROMOTION' : 'DEMOTION',
          changedAt: new Date(),
        }], { session });
        profile.currentRankId = eligible._id;
      }
      profile.lastCalculatedAt = new Date();
      await profile.save({ session });
      await ProcessedEvent.create([{ eventId, consumerName: CONSUMER }], { session });
    });
  } catch (err) {
    // A concurrent delivery may commit the same receipt while this transaction is running.
    if (err.code === 11000 && await ProcessedEvent.exists({ eventId, consumerName: CONSUMER })) {return;}
    throw err;
  }
};

module.exports = { handleEvent, XP, EVENTS };
