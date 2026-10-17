'use strict';

const badgeRepo = require('../repositories/badge.repository');
const userBadgeRepo = require('../repositories/userBadge.repository');
const { Errors } = require('../utils/errors');

const getBadges = (query) => {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.max(1, Math.min(parseInt(query.limit) || 100, 100));
  return badgeRepo.findAll({ status: 'ACTIVE', page, limit });
};

const getMyBadges = (userId) => userBadgeRepo.findByUser(userId);

// ─── Admin operations ─────────────────────────────────────────────────────────

const adminGetBadges = async (query) => {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.max(1, Math.min(parseInt(query.limit) || 100, 100));
  const result = query.page || query.limit
    ? await badgeRepo.findAll({ status: query.status || null, page, limit })
    : { items: await require('../models/Badge').find(query.status ? { status: query.status } : {}).sort({ name: 1 }) };
  const counts = await require('../models/UserBadge').aggregate([
    { $match: { badgeId: { $in: result.items.map((badge) => badge._id) } } },
    { $group: { _id: '$badgeId', total: { $sum: 1 } } },
  ]);
  const awarded = new Map(counts.map((row) => [String(row._id), row.total]));
  const items = result.items.map((badge) => ({ ...badge.toJSON(), totalAwarded: awarded.get(String(badge._id)) || 0 }));
  return query.page || query.limit ? { ...result, items } : items;
};

const adminGetBadgeById = async (badgeId) => {
  const badge = await badgeRepo.findById(badgeId);
  if (!badge) { throw Errors.badgeNotFound(badgeId); }
  return badge;
};

const adminCreateBadge = async (data) => {
  // Kiểm tra code unique (model đã có unique index, nhưng báo lỗi rõ ràng hơn)
  const existing = await badgeRepo.findByCode(data.code);
  if (existing) {
    const { ConflictError } = require('../utils/errors');
    throw new ConflictError(`Badge code "${data.code}" đã tồn tại`, 'BADGE_CODE_CONFLICT');
  }
  return badgeRepo.create(data);
};

const adminUpdateBadge = async (badgeId, data) => {
  const badge = await badgeRepo.findById(badgeId);
  if (!badge) { throw Errors.badgeNotFound(badgeId); }
  return badgeRepo.updateById(badgeId, data);
};

const adminUpdateBadgeStatus = async (badgeId, status) => {
  const badge = await badgeRepo.findById(badgeId);
  if (!badge) { throw Errors.badgeNotFound(badgeId); }
  return badgeRepo.updateStatus(badgeId, status);
};

module.exports = {
  getBadges,
  getMyBadges,
  adminGetBadges,
  adminGetBadgeById,
  adminCreateBadge,
  adminUpdateBadge,
  adminUpdateBadgeStatus,
};
