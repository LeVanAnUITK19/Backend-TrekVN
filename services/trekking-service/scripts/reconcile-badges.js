'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const { getUserBadgeStats } = require('../src/services/badgeStats.service');
const { isConditionMet } = require('../src/services/badgeCondition');
const { evaluateBadges } = require('../src/services/badgeEvaluator.service');
const { enqueue } = require('../src/repositories/eventOutbox.repository');
const { deliver } = require('../src/events/publishers/http.delivery');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const Journey = require('../src/models/Journey');
  const UserBadge = require('../src/models/UserBadge');
  const Badge = require('../src/models/Badge');
  await UserBadge.init();
  const selectedUser = process.argv.find((arg) => arg.startsWith('--user='))?.slice(7);
  const users = selectedUser ? [selectedUser] : [...new Set([
    ...await Journey.distinct('userId'),
    ...await UserBadge.distinct('userId'),
  ])];
  const apply = process.argv.includes('--apply');
  const plannedCorrections = new Map();
  if (process.argv.includes('--repair-default-rules')) {
    const corrections = {
      FIRST_SUMMIT: ['SUMMIT_CHECKIN_COUNT', 1], SUMMIT_HUNTER: ['SUMMIT_CHECKIN_COUNT', 5], SUMMIT_MASTER: ['SUMMIT_CHECKIN_COUNT', 20],
      FIRST_PLACE: ['PLACE_VISITED_COUNT', 1], PLACE_5: ['PLACE_VISITED_COUNT', 5], PLACE_20: ['PLACE_VISITED_COUNT', 20],
      PLACE_50: ['PLACE_VISITED_COUNT', 50], PLACE_100: ['PLACE_VISITED_COUNT', 100],
    };
    for (const [code, [type, value]] of Object.entries(corrections)) {
      const badge = await Badge.findOne({ code, 'condition.type': 'CHECKIN_COUNT', 'condition.value': value });
      if (!badge) {continue;}
      plannedCorrections.set(code, { type, value });
      console.log(JSON.stringify({ correctedRule: code, before: badge.condition, after: { type, value }, apply }));
      if (apply) {await Badge.updateOne({ _id: badge._id, 'condition.type': 'CHECKIN_COUNT' }, { $set: { condition: { type, value } } });}
    }
  }
  const definitions = await Badge.find({ status: 'ACTIVE' });
  // Dry run previews the rules that --apply will persist.
  if (!apply && process.argv.includes('--repair-default-rules')) {
    for (const badge of definitions) {
      if (plannedCorrections.has(badge.code)) {badge.condition = plannedCorrections.get(badge.code);}
    }
  }
  let added = 0;
  for (const userId of users) {
    const stats = await getUserBadgeStats(userId);
    const existing = await UserBadge.find({ userId });
    const earned = new Set(existing.map((award) => String(award.badgeId)));
    const missing = definitions.filter((badge) => !earned.has(String(badge._id)) && isConditionMet(badge.condition, stats));
    console.log(JSON.stringify({ userId, stats, missingBadges: missing.map((badge) => badge.code), existingBadges: existing.length }));
    if (!apply) {continue;}
    const awards = await evaluateBadges(userId, stats);
    added += awards.length;
    // Repair badge XP even if the old event receipt already marked evaluation complete.
    // Auth uses badge:userId:badgeId idempotency keys, so repeated delivery is safe.
    const allAwards = await UserBadge.find({ userId }).populate('badgeId');
    for (const award of allAwards) {
      if (!award.badgeId) {continue;}
      const payload = { userId, badgeId: String(award.badgeId._id), rarity: award.badgeId.rarity || 'COMMON', badgeCode: award.badgeId.code };
      const eventId = 'badge:' + userId + ':' + payload.badgeId;
      await enqueue('TREKKING_BADGE_EARNED', payload, eventId);
      await deliver({ eventId, eventType: 'TREKKING_BADGE_EARNED', payload });
      await require('../src/models/EventOutbox').updateOne({ eventId }, { $set: { status: 'PUBLISHED', publishedAt: new Date() } });
    }
  }
  console.log(JSON.stringify({ mode: apply ? 'applied' : 'dry-run', users: users.length, newBadges: added }));
}

main().catch((err) => { console.error(err.message); process.exitCode = 1; }).finally(() => mongoose.disconnect());
