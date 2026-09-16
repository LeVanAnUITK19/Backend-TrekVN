const User = require('../models/User');
const UserSettings = require('../models/UserSettings');

// ─── User ─────────────────────────────────────────────────────────────────────

const findByEmail = (email) => User.findOne({ email });

const findById = (id) => User.findById(id);

const create = (data) => User.create(data);

const updateById = (id, data) =>
  User.findByIdAndUpdate(id, data, { new: true, runValidators: true });

// ─── UserSettings ─────────────────────────────────────────────────────────────

const findSettingsByUserId = (userId) => UserSettings.findOne({ userId });

const createSettings = (userId) => UserSettings.create({ userId });

const updateSettings = (userId, data) =>
  UserSettings.findOneAndUpdate({ userId }, data, { new: true, runValidators: true });

module.exports = {
  findByEmail,
  findById,
  create,
  updateById,
  findSettingsByUserId,
  createSettings,
  updateSettings,
};
