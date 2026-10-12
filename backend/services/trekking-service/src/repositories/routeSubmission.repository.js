'use strict';

const RouteSubmission = require('../models/RouteSubmission');

const findByUser = async (userId, { status, page = 1, limit = 20 } = {}) => {
  const filter = { userId };
  if (status) { filter.status = status; }
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    RouteSubmission.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    RouteSubmission.countDocuments(filter),
  ]);
  return { items, total, page, limit };
};

const findAll = async ({ status, userId, page = 1, limit = 20 } = {}) => {
  const filter = {};
  if (status) { filter.status = status; }
  if (userId) { filter.userId = userId; }
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    RouteSubmission.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    RouteSubmission.countDocuments(filter),
  ]);
  return { items, total, page, limit };
};

const findById = (id) => RouteSubmission.findById(id);

const findByIdAndUser = (id, userId) => RouteSubmission.findOne({ _id: id, userId });

const findByClientOperationId = (clientOperationId) =>
  RouteSubmission.findOne({ clientOperationId });

const create = (data) => RouteSubmission.create(data);

const updateById = (id, data) =>
  RouteSubmission.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true });

module.exports = {
  findByUser,
  findAll,
  findById,
  findByIdAndUser,
  findByClientOperationId,
  create,
  updateById,
};
