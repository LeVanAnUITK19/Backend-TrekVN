'use strict';

const OfflineMapPackage = require('../models/OfflineMapPackage');

const findAll = async ({ search, status, page = 1, limit = 20 } = {}) => {
  const filter = {};
  if (status) {filter.status = status;}
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } },
    ];
  }
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    OfflineMapPackage.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    OfflineMapPackage.countDocuments(filter),
  ]);
  return { data: items, total, page, limit, totalPages: Math.ceil(total / limit) };
};

const findById = (id) => OfflineMapPackage.findById(id);

const create = (data) => OfflineMapPackage.create(data);

const updateById = (id, data) =>
  OfflineMapPackage.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true });

const deleteById = (id) => OfflineMapPackage.findByIdAndDelete(id);

module.exports = { findAll, findById, create, updateById, deleteById };
