'use strict';

const Badge = require('../models/Badge');

const findAll = async ({ status = 'ACTIVE', page = 1, limit = 100 } = {}) => {
  const filter = {};
  if (status) { filter.status = status; }
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Badge.find(filter).sort({ category: 1, rarity: 1, name: 1 }).skip(skip).limit(limit),
    Badge.countDocuments(filter),
  ]);
  return { items, total, page, limit };
};

const findById = (id) => Badge.findById(id);

const findByCode = (code) => Badge.findOne({ code: code.toUpperCase() });

const create = (data) => Badge.create(data);

const updateById = (id, data) =>
  Badge.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true });

const updateStatus = (id, status) =>
  Badge.findByIdAndUpdate(id, { $set: { status } }, { new: true });

module.exports = { findAll, findById, findByCode, create, updateById, updateStatus };
