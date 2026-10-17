'use strict';

const Milestone = require('../models/Milestone');

const findByRoute = (trekkingRouteId) =>
  Milestone.find({ trekkingRouteId }).sort({ sequence: 1 });

/**
 * Admin flat list — filter theo routeId và status.
 */
const adminFindAll = async ({ routeId, page = 1, limit = 20 } = {}) => {
  const filter = {};
  if (routeId) {filter.trekkingRouteId = routeId;}
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Milestone.find(filter).sort({ trekkingRouteId: 1, sequence: 1 }).skip(skip).limit(limit),
    Milestone.countDocuments(filter),
  ]);
  return { data: items, total, page, limit, totalPages: Math.ceil(total / limit) };
};

const findById = (id) => Milestone.findById(id);

const findByIdAndRoute = (id, trekkingRouteId) =>
  Milestone.findOne({ _id: id, trekkingRouteId });

const create = (data) => Milestone.create(data);

const updateById = (id, data) =>
  Milestone.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true });

const deleteById = (id) => Milestone.findByIdAndDelete(id);

const getMaxSequence = async (trekkingRouteId) => {
  const result = await Milestone.findOne({ trekkingRouteId }).sort({ sequence: -1 }).select('sequence');
  return result ? result.sequence : 0;
};

module.exports = {
  findByRoute,
  adminFindAll,
  findById,
  findByIdAndRoute,
  create,
  updateById,
  deleteById,
  getMaxSequence,
};
