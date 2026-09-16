const RefreshToken = require('../models/RefreshToken');

/**
 * Lưu refresh token mới
 */
const create = (userId, tokenHash, expiresAt) =>
  RefreshToken.create({ userId, tokenHash, expiresAt });

/**
 * Tìm token theo hash (để validate)
 */
const findByHash = (tokenHash) =>
  RefreshToken.findOne({ tokenHash, revokedAt: null, expiresAt: { $gt: new Date() } });

/**
 * Revoke một token cụ thể
 */
const revokeByHash = (tokenHash) =>
  RefreshToken.findOneAndUpdate({ tokenHash }, { revokedAt: new Date() }, { new: true });

/**
 * Revoke toàn bộ token của user (logout all devices)
 */
const revokeAllByUserId = (userId) =>
  RefreshToken.updateMany({ userId, revokedAt: null }, { revokedAt: new Date() });

module.exports = { create, findByHash, revokeByHash, revokeAllByUserId };
