'use strict';

const UserBadge = require('../models/UserBadge');

const findByUser = (userId) =>
  UserBadge.find({ userId }).populate('badgeId').sort({ earnedAt: -1 });

const findByUserAndBadge = (userId, badgeId) =>
  UserBadge.findOne({ userId, badgeId });

const create = (data) => UserBadge.create(data);

module.exports = { findByUser, findByUserAndBadge, create };
