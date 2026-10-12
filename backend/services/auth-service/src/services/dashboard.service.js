'use strict';

const mongoose = require('mongoose');
const User = require('../models/User');
const Profile = require('../models/UserRankProfile');
const Rank = require('../models/RankDefinition');
const logger = require('../config/logger');

const fetchSummary = async (baseUrl, range, authorization) => {
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/internal/v1/dashboard?range=${encodeURIComponent(range)}`, {
    headers: { Authorization: authorization || '' },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) {throw new Error(`Dashboard service returned ${response.status}`);}
  const body = await response.json();
  if (!body.success || !body.data) {throw new Error('Invalid dashboard service response');}
  return body.data;
};

const getDashboard = async (range = '7d', authorization) => {
  const days = { '7d': 7, '30d': 30, '90d': 90 }[range] || 7;
  const start = new Date(Date.now() - days * 86400000);
  const previousStart = new Date(start - days * 86400000);
  const remote = await Promise.allSettled([
    fetchSummary(process.env.TREKKING_SERVICE_URL || 'http://localhost:3003', range, authorization),
    fetchSummary(process.env.CHECKIN_SERVICE_URL || 'http://localhost:3002', range, authorization),
  ]);
  const unavailableServices = ['community']; // No community service implementation yet.
  const summaries = remote.map((result, i) => {
    if (result.status === 'fulfilled') {return result.value;}
    const name = ['trekking', 'checkin'][i];
    unavailableServices.push(name);
    logger.warn(`[Dashboard] ${name}: ${result.reason.message}`);
    return null;
  });
  const [trekking, checkin] = summaries;
  const [totalUsers, recent, previous, totalRanks, usersActivity, topProfiles, activeUsers] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ createdAt: { $gte: start } }),
    User.countDocuments({ createdAt: { $gte: previousStart, $lt: start } }),
    Rank.countDocuments(),
    User.aggregate([
      { $match: { createdAt: { $gte: start } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'Asia/Ho_Chi_Minh' } }, users: { $sum: 1 } } },
    ]),
    Profile.find().sort({ totalXp: -1 }).limit(5).populate('userId', 'displayName avatarUrl').populate('currentRankId', 'name code'),
    User.find({ lastLoginAt: { $gte: start }, status: 'ACTIVE' }).sort({ lastLoginAt: -1 }).limit(5).select('displayName avatarUrl lastLoginAt'),
  ]);
  const recentBadges = trekking?.recentBadges || [];
  const recentContributions = trekking?.recentContributions || [];
  const ids = [...new Set([...recentBadges, ...recentContributions].map((row) => row.userId))]
    .filter((id) => mongoose.Types.ObjectId.isValid(id));
  const names = new Map((ids.length ? await User.find({ _id: { $in: ids } }).select('displayName') : [])
    .map((user) => [String(user._id), user.displayName]));
  const activity = new Map();
  // Include days without activity, keeping local dates aligned across all services.
  for (let day = 0; day <= days; day++) {
    const date = new Date(start.getTime() + day * 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
    activity.set(date, { date, users: 0, journeys: trekking ? 0 : null, checkins: checkin ? 0 : null });
  }
  for (const rows of [usersActivity.map((row) => ({ date: row._id, users: row.users })), trekking?.activityChart || [], checkin?.activityChart || []]) {
    for (const row of rows) {activity.set(row.date, { ...activity.get(row.date), ...row });}
  }
  return {
    stats: {
      totalUsers, userGrowthPercent: previous > 0 ? Math.round((recent - previous) / previous * 1000) / 10 : recent > 0 ? 100 : 0,
      totalRanks, totalPosts: null,
      totalJourneys: null, totalPlaces: null, totalBadgeTypes: null, pendingContributions: null, totalCheckins: null,
      ...trekking?.stats, ...checkin?.stats,
    },
    unavailableServices,
    activityChart: [...activity.values()].sort((a, b) => a.date.localeCompare(b.date)),
    contributionRatio: trekking?.contributionRatio || null,
    leaderboard: topProfiles.filter((profile) => profile.userId && profile.currentRankId).map((profile) => ({
      userId: String(profile.userId._id), name: profile.userId.displayName, avatarUrl: profile.userId.avatarUrl,
      rankName: profile.currentRankId.name, rankCode: profile.currentRankId.code, totalXp: profile.totalXp, badgeCount: profile.badgeCount,
    })),
    recentBadges: recentBadges.map((row) => ({ ...row, userName: names.get(row.userId) || 'Người dùng' })),
    recentContributions: recentContributions.map((row) => ({ ...row, contributor: names.get(row.userId) || 'Người dùng' })),
    activeUsers: activeUsers.map((user) => ({ userId: String(user._id), name: user.displayName, avatarUrl: user.avatarUrl, lastActive: user.lastLoginAt })),
  };
};

module.exports = { getDashboard };
