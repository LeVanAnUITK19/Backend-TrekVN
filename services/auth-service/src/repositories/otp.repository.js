const OtpVerification = require('../models/OtpVerification');

/**
 * Tạo bản ghi OTP mới
 */
const create = (data) => OtpVerification.create(data);

/**
 * Lấy OTP active mới nhất theo email + purpose
 */
const findActive = (email, purpose) =>
  OtpVerification.findOne({
    email,
    purpose,
    status: 'ACTIVE',
    expiresAt: { $gt: new Date() },
  }).sort({ createdAt: -1 });

/**
 * Hủy tất cả OTP active cũ của email + purpose (trước khi tạo mới)
 */
const revokeAllActive = (email, purpose) =>
  OtpVerification.updateMany(
    { email, purpose, status: 'ACTIVE' },
    { status: 'EXPIRED' }
  );

/**
 * Tăng số lần thử sai
 */
const incrementAttempts = (id) =>
  OtpVerification.findByIdAndUpdate(id, { $inc: { attempts: 1 } }, { new: true });

/**
 * Đánh dấu OTP đã dùng
 */
const markUsed = (id) =>
  OtpVerification.findByIdAndUpdate(id, { status: 'USED', usedAt: new Date() }, { new: true });

module.exports = { create, findActive, revokeAllActive, incrementAttempts, markUsed };
