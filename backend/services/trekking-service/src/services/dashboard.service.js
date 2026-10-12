'use strict';

const Journey = require('../models/Journey');
const Place = require('../models/TrekkingPlace');
const Badge = require('../models/Badge');
const UserBadge = require('../models/UserBadge');
const RouteSubmission = require('../models/RouteSubmission');
const PlaceSuggestion = require('../models/PlaceSuggestion');

const growth = (recent, previous) => previous > 0
  ? Math.round((recent - previous) / previous * 1000) / 10
  : recent > 0 ? 100 : 0;

const summary = async (Model, start, previousStart, filter = {}) => {
  const [total, recent, previous] = await Promise.all([
    Model.countDocuments(filter),
    Model.countDocuments({ ...filter, createdAt: { $gte: start } }),
    Model.countDocuments({ ...filter, createdAt: { $gte: previousStart, $lt: start } }),
  ]);
  return { total, recent, previous };
};

const getDashboard = async (range = '7d') => {
  const days = { '7d': 7, '30d': 30, '90d': 90 }[range] || 7;
  const now = Date.now();
  const start = new Date(now - days * 86400000);
  const previousStart = new Date(now - days * 2 * 86400000);
  const statusCounts = (Model) => Model.aggregate([
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);
  const [journeys, places, badges, routesPending, placesPending, routeStatuses, placeStatuses,
    recentRoutes, recentPlaces, recentAwards, activity] = await Promise.all([
    summary(Journey, start, previousStart),
    summary(Place, start, previousStart),
    summary(Badge, start, previousStart),
    summary(RouteSubmission, start, previousStart, { status: 'PENDING_REVIEW' }),
    summary(PlaceSuggestion, start, previousStart, { status: 'PENDING_REVIEW' }),
    statusCounts(RouteSubmission), statusCounts(PlaceSuggestion),
    RouteSubmission.find({ status: { $nin: ['DRAFT', 'CANCELLED'] } }).sort({ createdAt: -1 }).limit(5).lean(),
    PlaceSuggestion.find({ status: { $nin: ['DRAFT', 'CANCELLED'] } }).sort({ createdAt: -1 }).limit(5).lean(),
    UserBadge.find().sort({ earnedAt: -1 }).limit(5).populate('badgeId', 'name iconUrl rarity').lean(),
    Journey.aggregate([
      { $match: { createdAt: { $gte: start } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'Asia/Ho_Chi_Minh' } }, journeys: { $sum: 1 } } },
    ]),
  ]);
  const statuses = {};
  for (const row of [...routeStatuses, ...placeStatuses]) {
    statuses[row._id] = (statuses[row._id] || 0) + row.count;
  }
  const contribution = (row, type) => ({
    id: String(row._id), type, title: row.proposedName || '', userId: row.userId,
    submittedAt: row.createdAt, status: row.status,
  });
  return {
    stats: {
      totalJourneys: journeys.total, journeyGrowthPercent: growth(journeys.recent, journeys.previous),
      totalPlaces: places.total, placeGrowthPercent: growth(places.recent, places.previous),
      totalBadgeTypes: badges.total, badgeGrowthPercent: growth(badges.recent, badges.previous),
      pendingContributions: routesPending.total + placesPending.total,
      contributionGrowthPercent: growth(routesPending.recent + placesPending.recent, routesPending.previous + placesPending.previous),
    },
    contributionRatio: {
      approved: statuses.APPROVED || 0, pending: statuses.PENDING_REVIEW || 0,
      rejected: statuses.REJECTED || 0, needsRevision: statuses.NEEDS_REVISION || 0,
    },
    recentContributions: [
      ...recentRoutes.map((row) => contribution(row, 'ROUTE_SUBMISSION')),
      ...recentPlaces.map((row) => contribution(row, 'PLACE_SUGGESTION')),
    ].sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt)).slice(0, 5),
    recentBadges: recentAwards.filter((row) => row.badgeId).map((row) => ({
      awardId: String(row._id), badgeId: String(row.badgeId._id), userId: row.userId,
      name: row.badgeId.name, iconUrl: row.badgeId.iconUrl, rarity: row.badgeId.rarity, earnedAt: row.earnedAt,
    })),
    activityChart: activity.map((row) => ({ date: row._id, journeys: row.journeys })),
  };
};

module.exports = { getDashboard };
