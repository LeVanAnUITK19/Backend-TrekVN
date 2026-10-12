'use strict';

const AuthIdentity = require('../models/AuthIdentity');

/**
 * Tìm identity theo provider + providerUserId.
 * Dùng để lookup Google sub khi sign-in.
 */
const findByProviderAndUserId = (provider, providerUserId) =>
  AuthIdentity.findOne({ provider, providerUserId });

/**
 * Tìm tất cả identity của một user.
 */
const findByUserId = (userId) => AuthIdentity.find({ userId });

/**
 * Tìm identity theo userId + provider.
 */
const findByUserAndProvider = (userId, provider) =>
  AuthIdentity.findOne({ userId, provider });

/**
 * Tạo mới auth identity.
 */
const create = (data) => AuthIdentity.create(data);

/**
 * Upsert: tạo nếu chưa có, cập nhật nếu đã tồn tại.
 */
const upsert = (userId, provider, providerUserId) =>
  AuthIdentity.findOneAndUpdate(
    { userId, provider },
    { $set: { providerUserId } },
    { upsert: true, new: true, runValidators: true }
  );

module.exports = {
  findByProviderAndUserId,
  findByUserId,
  findByUserAndProvider,
  create,
  upsert,
};
