'use strict';
const Route = require('../models/RouteSubmission');
const Place = require('../models/PlaceSuggestion');

const contributors = async (ids) => {
  const token = process.env.TREKVIET_INTERNAL_TOKEN || process.env.SERVICE_TOKEN;
  if (!ids.length || !token) {return new Map();}
  try {
    const response = await fetch(`${process.env.AUTH_SERVICE_URL || 'http://localhost:3001'}/internal/v1/users/lookup`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Service-Token': token },
      body: JSON.stringify({ userIds: [...new Set(ids)] }), signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) {return new Map();}
    return new Map((await response.json()).data.map((user) => [user.id, user]));
  } catch { return new Map(); }
};
const format = (row, type, users = new Map()) => ({
  id: String(row._id), type, status: row.status,
  contributor: users.get(row.userId) || { id: row.userId, name: row.userId, email: '' },
  submittedAt: row.createdAt, updatedAt: row.updatedAt, adminNote: row.adminNote,
  reviewedAt: row.reviewedAt, reviewedBy: row.reviewedBy,
  resultingEntityId: row.resultingRouteId || row.resultingPlaceId,
  ...(type === 'ROUTE_SUBMISSION' ? { routeSubmission: {
    suggestedName: row.proposedName, suggestedDescription: row.description,
    sourceJourneyId: String(row.sourceJourneyId), images: row.images, gpxUrl: row.gpxUrl,
    trekkingPlaceId: row.trekkingPlaceId ? String(row.trekkingPlaceId) : undefined,
    notes: row.notes, markerCount: row.markerIds?.length || 0, contributionKind: row.contributionKind || 'ROUTE',
    encodedPolyline: row.encodedPolyline,
    distance: (row.statistics?.distanceMeters || 0) / 1000,
    estimatedDuration: (row.statistics?.durationSeconds || 0) / 60,
    elevationGain: row.statistics?.elevationGain || 0,
  } } : { placeSuggestion: {
    suggestedName: row.proposedName, province: row.provinceId, coordinates: row.location,
    description: row.description, difficulty: row.difficulty, tags: row.tags, images: row.images,
  } }),
});
const list = async (query) => {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.max(1, Math.min(parseInt(query.limit) || 20, 100));
  const filter = {};
  if (query.status) {filter.status = query.status;}
  if (query.userId) {filter.userId = query.userId;}
  if (query.province) {filter.provinceId = query.province;}
  if (query.search) { const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); filter.proposedName = { $regex: escaped, $options: 'i' }; }
  const date = {};
  if (query.dateFrom && !isNaN(Date.parse(query.dateFrom))) {date.$gte = new Date(query.dateFrom);}
  if (query.dateTo && !isNaN(Date.parse(query.dateTo))) {date.$lte = new Date(query.dateTo);}
  if (Object.keys(date).length) {filter.createdAt = date;}
  const pipeline = [{ $match: filter }, { $set: { contributionType: 'ROUTE_SUBMISSION' } },
    { $unionWith: { coll: Place.collection.name, pipeline: [{ $match: filter }, { $set: { contributionType: 'PLACE_SUGGESTION' } }] } }];
  if (query.type) {pipeline.push({ $match: { contributionType: query.type } });}
  if (query.contributionKind === 'MARKERS') {
    pipeline.push({ $match: { contributionType: 'ROUTE_SUBMISSION', contributionKind: 'MARKERS' } });
  } else if (query.contributionKind === 'ROUTE') {
    pipeline.push({ $match: { contributionType: 'ROUTE_SUBMISSION', contributionKind: { $ne: 'MARKERS' } } });
  }
  pipeline.push({ $sort: { createdAt: -1, _id: -1 } }, { $facet: {
    items: [{ $skip: (page - 1) * limit }, { $limit: limit }], totals: [{ $count: 'count' }],
  } });
  const [result] = await Route.aggregate(pipeline);
  const users = await contributors(result.items.map((row) => row.userId));
  const total = result.totals[0]?.count || 0;
  return { data: result.items.map((row) => format(row, row.contributionType, users)), total, page, limit, totalPages: Math.ceil(total / limit) };
};
const detail = async (result) => {
  const row = result.contribution.toObject ? result.contribution.toObject() : result.contribution;
  const users = await contributors([row.userId]);
  return { ...result, ...format(row, result.type, users) };
};
module.exports = { list, detail };
