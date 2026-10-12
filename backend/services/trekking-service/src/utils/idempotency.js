'use strict';

const IdempotencyKey = require('../models/IdempotencyKey');
const { ConflictError } = require('./errors');
const logger = require('../config/logger');

/**
 * Kiểm tra và lưu idempotency key.
 * Nếu key đã tồn tại và đã completed → trả về cached response.
 * Nếu key đã tồn tại và đang processing → throw ConflictError.
 * Nếu key chưa tồn tại → tạo mới với status=PROCESSING.
 *
 * @param {string} key          - Idempotency key từ header hoặc clientId
 * @param {string} operation    - Tên operation (CREATE_JOURNEY, CREATE_MARKER,...)
 * @param {string} userId       - userId để scope key
 * @returns {{ cached: boolean, record: IdempotencyKeyDoc }}
 */
const checkIdempotency = async (key, operation, userId) => {
  if (!key) { return { cached: false, record: null }; }

  const existing = await IdempotencyKey.findOne({ key, userId, operation });

  if (existing) {
    if (existing.status === 'COMPLETED') {
      return { cached: true, record: existing };
    }
    if (existing.status === 'PROCESSING') {
      throw new ConflictError(
        `Operation đang được xử lý cho key "${key}"`,
        'IDEMPOTENCY_CONFLICT',
        { key }
      );
    }
  }

  // Tạo mới với PROCESSING
  let record;
  try {
    record = await IdempotencyKey.create({
      key,
      operation,
      userId,
      status: 'PROCESSING',
    });
  } catch (err) {
    // Race condition: duplicate key → thử lại
    if (err.code === 11000) {
      const raced = await IdempotencyKey.findOne({ key, userId, operation });
      if (raced && raced.status === 'COMPLETED') {
        return { cached: true, record: raced };
      }
      throw new ConflictError(
        `Idempotency key "${key}" đang được xử lý`,
        'IDEMPOTENCY_CONFLICT',
        { key }
      );
    }
    throw err;
  }

  return { cached: false, record };
};

/**
 * Đánh dấu idempotency key đã hoàn thành và lưu response data.
 *
 * @param {IdempotencyKeyDoc} record
 * @param {object} responseData
 */
const completeIdempotency = async (record, responseData) => {
  if (!record) { return; }
  try {
    record.status = 'COMPLETED';
    record.responseData = responseData;
    record.completedAt = new Date();
    await record.save();
  } catch (err) {
    // Non-critical: log và tiếp tục
    logger.warn(`[Idempotency] Failed to mark key as COMPLETED: ${err.message}`);
  }
};

/**
 * Đánh dấu idempotency key thất bại.
 */
const failIdempotency = async (record) => {
  if (!record) { return; }
  try {
    await IdempotencyKey.deleteOne({ _id: record._id });
  } catch (err) {
    logger.warn(`[Idempotency] Failed to cleanup failed key: ${err.message}`);
  }
};

module.exports = { checkIdempotency, completeIdempotency, failIdempotency };
