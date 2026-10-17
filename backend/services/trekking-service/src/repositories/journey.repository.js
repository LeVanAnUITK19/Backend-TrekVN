'use strict';

const Journey = require('../models/Journey');

const findByUser = async (userId, { status, page = 1, limit = 20, sort = '-createdAt' } = {}) => {
  const filter = { userId };
  if (status) { filter.status = status; }
  const skip = (page - 1) * limit;
  const sortField = sort.startsWith('-') ? { [sort.slice(1)]: -1 } : { [sort]: 1 };
  const [items, total] = await Promise.all([
    Journey.find(filter).populate('trekkingPlaceId').populate('trekkingRouteId')
      .sort(sortField).skip(skip).limit(limit),
    Journey.countDocuments(filter),
  ]);
  return { items, total, page, limit };
};

const findById = (id) => Journey.findById(id);

const findByIdAndUser = (id, userId) => Journey.findOne({ _id: id, userId });

const findByIdAndUserWithCatalog = (id, userId) =>
  findByIdAndUser(id, userId).populate('trekkingPlaceId').populate('trekkingRouteId');

const adminFindById = (id) => findById(id)
  .populate('trekkingPlaceId', 'name provinceId').populate('trekkingRouteId', 'name');

const findByClientJourneyId = (userId, clientJourneyId) =>
  Journey.findOne({ userId, clientJourneyId });

const create = (data) => Journey.create(data);

const updateById = (id, data) =>
  Journey.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true });

/**
 * Tăng markerCount atomically.
 */
const incrementMarkerCount = (id, delta = 1) =>
  Journey.findByIdAndUpdate(id, { $inc: { markerCount: delta } }, { new: true });

/**
 * Tăng checkinCount atomically (gọi từ event consumer nếu cần).
 */
const incrementCheckinCount = (id, delta = 1) =>
  Journey.findByIdAndUpdate(id, { $inc: { checkinCount: delta } }, { new: true });

const getUserStatistics = async (userId) => {
  const result = await Journey.aggregate([
    { $match: { userId, status: 'COMPLETED' } },
    {
      $group: {
        _id: null,
        totalJourneys: { $sum: 1 },
        totalDistanceMeters: { $sum: '$statistics.distanceMeters' },
        totalElevationGain: { $sum: '$statistics.elevationGain' },
        totalDurationSeconds: { $sum: '$statistics.durationSeconds' },
        maxAltitude: { $max: '$statistics.maxAltitude' },
      },
    },
  ]);
  return result[0] || {
    totalJourneys: 0,
    totalDistanceMeters: 0,
    totalElevationGain: 0,
    totalDurationSeconds: 0,
  };
};

/**
 * Admin: list tất cả journeys với filter.
 */
const adminFindAll = async ({ search, userId, status, page = 1, limit = 20 } = {}) => {
  const filter = {};
  if (userId) {filter.userId = userId;}
  if (status) {filter.status = status;}
  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = { $regex: escaped, $options: 'i' };
    const [places, routes] = await Promise.all([
      require('../models/TrekkingPlace').find({ name: match }).select('_id').lean(),
      require('../models/TrekkingRoute').find({ name: match }).select('_id').lean(),
    ]);
    filter.$or = [
      { name: match }, { userId: match },
      { trekkingPlaceId: { $in: places.map((p) => p._id) } },
      { trekkingRouteId: { $in: routes.map((r) => r._id) } },
    ];
  }
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Journey.find(filter)
      .populate('trekkingPlaceId', 'name provinceId')
      .populate('trekkingRouteId', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Journey.countDocuments(filter),
  ]);
  return { data: items, total, page, limit, totalPages: Math.ceil(total / limit) };
};

module.exports = {
  findByUser,
  adminFindAll,
  findById,
  findByIdAndUser,
  findByIdAndUserWithCatalog,
  adminFindById,
  findByClientJourneyId,
  create,
  updateById,
  incrementMarkerCount,
  incrementCheckinCount,
  getUserStatistics,
};
