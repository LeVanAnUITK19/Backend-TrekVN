'use strict';

const mongoose = require('mongoose');

/**
 * Persistent idempotency key store — ngăn duplicate operations khi offline retry.
 * Không dùng in-memory Map (không survive restart).
 */
const idempotencyKeySchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    operation: { type: String, required: true },
    userId: { type: String, required: true },
    status: {
      type: String,
      enum: ['PROCESSING', 'COMPLETED'],
      default: 'PROCESSING',
    },
    // Lưu response để trả về khi retry
    responseData: { type: mongoose.Schema.Types.Mixed },
    completedAt: { type: Date },
  },
  {
    timestamps: true,
  }
);

// Unique per key + userId + operation để scope per user
idempotencyKeySchema.index({ key: 1, userId: 1, operation: 1 }, { unique: true });

// TTL: tự xóa sau 7 ngày để không tích lũy vô hạn
idempotencyKeySchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 7 });

module.exports = mongoose.model('IdempotencyKey', idempotencyKeySchema);
