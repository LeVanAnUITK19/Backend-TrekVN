const Province = require('../models/Province');

const findById = (id) => Province.findById(id);

const findByCode = (code) => Province.findOne({ code });

const findAll = () => Province.find().sort({ region: 1, name: 1 });

const findByFilter = (filter = {}) => Province.find(filter).sort({ region: 1, name: 1 });

const countAll = () => Province.countDocuments();

/**
 * Tạo tỉnh mới
 */
const create = (data) => Province.create(data);

/**
 * Cập nhật tỉnh theo id
 */
const updateById = (id, data) =>
  Province.findByIdAndUpdate(id, data, { new: true, runValidators: true });

module.exports = { findById, findByCode, findAll, findByFilter, countAll, create, updateById };
