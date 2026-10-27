'use strict';

const TrekkingRoute = require('../models/TrekkingRoute');

const findByPlace = async (trekkingPlaceId, { status = 'ACTIVE' } = {}) => {
  const filter = { trekkingPlaceId };
  if (status) { filter.status = status; }
  return TrekkingRoute.find(filter).sort({ createdAt: -1 });
};

const findByPlaces = (placeIds) => TrekkingRoute.find({
  trekkingPlaceId: { $in: placeIds }, status: 'ACTIVE',
}).sort({ createdAt: -1 });

const findAll = async ({ search, placeId, difficulty, status, page = 1, limit = 20 } = {}) => {
  const filter = {};
  if (status) { filter.status = status; }
  if (placeId) { filter.trekkingPlaceId = placeId; }
  if (difficulty) { filter.difficulty = difficulty; }
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } },
    ];
  }
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    TrekkingRoute.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    TrekkingRoute.countDocuments(filter),
  ]);
  return { data: items, total, page, limit, totalPages: Math.ceil(total / limit) };
};

const findById = (id) => TrekkingRoute.findById(id);

// Project card fields before joining: paths, offline packages and milestones
// never travel through the public paginated listing.
const findCatalogPage = async ({ q, mien, sort, provinceId, difficulty, tags, page, limit }) => {
  const placeFilter = { 'place.status': 'ACTIVE' };
  if (mien) { placeFilter['place.mien'] = mien; }
  if (provinceId) { placeFilter['place.provinceId'] = provinceId; }
  if (tags) { placeFilter['place.tags'] = { $in: tags.split(',') }; }
  if (q) {
    const search = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    placeFilter.$or = [{ name: { $regex: search, $options: 'i' } }, { 'place.name': { $regex: search, $options: 'i' } }];
  }
  const ordering = sort === 'popular'
    ? { 'place.ratingCount': -1, 'place.ratingAverage': -1, _id: -1 }
    : { createdAt: -1, _id: -1 };
  const [result] = await TrekkingRoute.aggregate([
    { $match: { status: 'ACTIVE', ...(difficulty ? { difficulty } : {}) } },
    { $project: { name: 1, trekkingPlaceId: 1, difficulty: 1, distanceMeters: 1,
      estimatedDurationMinutes: 1, imageUrl: 1, createdAt: 1 } },
    { $lookup: { from: require('../models/TrekkingPlace').collection.name,
      localField: 'trekkingPlaceId', foreignField: '_id', as: 'place',
      pipeline: [{ $project: { name: 1, status: 1, mien: 1, address: 1, provinceId: 1,
        ratingAverage: 1, ratingCount: 1, tags: 1, images: { $slice: ['$images', 1] } } }] } },
    { $unwind: '$place' },
    { $match: placeFilter },
    { $facet: {
      items: [{ $sort: ordering }, { $skip: (page - 1) * limit }, { $limit: limit },
        { $project: { _id: 0, trekkingRouteId: '$_id', trekkingPlaceId: 1, name: 1,
          difficulty: 1, distanceMeters: 1, estimatedDurationMinutes: 1,
          imageUrl: { $ifNull: ['$imageUrl', { $arrayElemAt: ['$place.images', 0] }] },
          province: '$place.address', placeName: '$place.name',
          ratingAverage: '$place.ratingAverage' } }],
      count: [{ $count: 'total' }],
    } },
  ]);
  const total = result?.count[0]?.total || 0;
  return { items: result?.items || [], total, page, limit, hasMore: page * limit < total };
};

const create = (data) => TrekkingRoute.create(data);

const updateById = (id, data) =>
  TrekkingRoute.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true });

const updateStatus = (id, status) =>
  TrekkingRoute.findByIdAndUpdate(id, { $set: { status } }, { new: true });

const updateOfflineMap = (id, offlineMapData) =>
  TrekkingRoute.findByIdAndUpdate(id, { $set: { offlineMap: offlineMapData } }, { new: true });

const softDelete = (id) =>
  TrekkingRoute.findByIdAndUpdate(id, { $set: { status: 'INACTIVE' } }, { new: true });

module.exports = { findCatalogPage, findByPlace, findByPlaces, findAll, findById, create, updateById, updateStatus, softDelete, updateOfflineMap };
