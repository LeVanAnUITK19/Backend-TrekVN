'use strict';

const PlaceSuggestion = require('../models/PlaceSuggestion');

const findByUser = async (userId, { status, page = 1, limit = 20 } = {}) => {
  const filter = { userId };
  if (status) { filter.status = status; }
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    PlaceSuggestion.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    PlaceSuggestion.countDocuments(filter),
  ]);
  return { items, total, page, limit };
};

const findAll = async ({ status, userId, provinceId, page = 1, limit = 20 } = {}) => {
  const filter = {};
  if (status) { filter.status = status; }
  if (userId) { filter.userId = userId; }
  if (provinceId) { filter.provinceId = provinceId; }
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    PlaceSuggestion.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    PlaceSuggestion.countDocuments(filter),
  ]);
  return { items, total, page, limit };
};

const findById = (id) => PlaceSuggestion.findById(id);

const findByIdAndUser = (id, userId) => PlaceSuggestion.findOne({ _id: id, userId });

const findByClientOperationId = (clientOperationId) =>
  PlaceSuggestion.findOne({ clientOperationId });

const create = (data) => PlaceSuggestion.create(data);

const updateById = (id, data) =>
  PlaceSuggestion.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true });

module.exports = {
  findByUser,
  findAll,
  findById,
  findByIdAndUser,
  findByClientOperationId,
  create,
  updateById,
};
