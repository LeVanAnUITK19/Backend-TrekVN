'use strict';

const DetailEvaluate = require('../models/DetailEvaluate');

const findByPlace = async (trekkingPlaceId, { page = 1, limit = 20 } = {}) => {
  const filter = { trekkingPlaceId, deleted: false };
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    DetailEvaluate.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    DetailEvaluate.countDocuments(filter),
  ]);
  return { items, total, page, limit };
};

const findByPlaceAndUser = (trekkingPlaceId, userId) =>
  DetailEvaluate.findOne({ trekkingPlaceId, userId });

const updateOnce = (id, userId, trekkingPlaceId, data) =>
  DetailEvaluate.findOneAndUpdate(
    { _id: id, userId, trekkingPlaceId, deleted: false,
      $or: [{ editCount: 0 }, { editCount: { $exists: false } }] },
    { $set: data, $inc: { editCount: 1 } }, { new: true, runValidators: true }
  );

const findById = (id) => DetailEvaluate.findById(id);

const findByIdAndUser = (id, userId) =>
  DetailEvaluate.findOne({ _id: id, userId, deleted: false });

const create = (data) => DetailEvaluate.create(data);

const updateById = (id, data) =>
  DetailEvaluate.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true });

/**
 * Soft delete: set deleted = true.
 */
const softDeleteById = (id) =>
  DetailEvaluate.findByIdAndUpdate(id, { $set: { deleted: true } }, { new: true });

module.exports = {
  findByPlace,
  findByPlaceAndUser,
  findById,
  findByIdAndUser,
  create,
  updateById,
  updateOnce,
  softDeleteById,
};
