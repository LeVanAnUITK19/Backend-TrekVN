'use strict';

const TrekkingRoute = require('../models/TrekkingRoute');

const findByPlace = async (trekkingPlaceId, { status = 'ACTIVE' } = {}) => {
  const filter = { trekkingPlaceId };
  if (status) { filter.status = status; }
  return TrekkingRoute.find(filter).sort({ createdAt: -1 });
};

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

const create = (data) => TrekkingRoute.create(data);

const updateById = (id, data) =>
  TrekkingRoute.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true });

const updateStatus = (id, status) =>
  TrekkingRoute.findByIdAndUpdate(id, { $set: { status } }, { new: true });

const updateOfflineMap = (id, offlineMapData) =>
  TrekkingRoute.findByIdAndUpdate(id, { $set: { offlineMap: offlineMapData } }, { new: true });

const softDelete = (id) =>
  TrekkingRoute.findByIdAndUpdate(id, { $set: { status: 'INACTIVE' } }, { new: true });

module.exports = { findByPlace, findAll, findById, create, updateById, updateStatus, softDelete, updateOfflineMap };
