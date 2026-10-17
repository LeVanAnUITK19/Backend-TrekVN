'use strict';

const mongoose = require('mongoose');

/**
 * EventOutbox — Transactional Outbox pattern để đảm bảo event delivery.
 *
 * Khi domain data được persist, event cũng được ghi vào outbox trong cùng
 * MongoDB session (nếu replica set). OutboxWorker sau đó publish lên RabbitMQ
 * và mark PUBLISHED.
 *
 * Status:
 *   PENDING    — chờ publish
 *   PROCESSING — đang được worker xử lý
 *   PUBLISHED  — đã publish thành công
 *   FAILED     — thất bại sau max retry
 *
 * DB v3.1 Implementation Alignment: event_outbox collection (infrastructure field)
 */
const eventOutboxSchema = new mongoose.Schema(
  {
    eventId: {
      type: String,
      required: true,
      unique: true, // chống duplicate event
    },
    eventType: {
      type: String,
      required: true,
    },
    eventVersion: {
      type: Number,
      default: 1,
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    status: {
      type: String,
      enum: ['PENDING', 'PROCESSING', 'PUBLISHED', 'FAILED'],
      default: 'PENDING',
    },
    retryCount: {
      type: Number,
      default: 0,
    },
    nextRetryAt: {
      type: Date,
      default: Date.now,
    },
    lastError: {
      type: String,
      default: null,
    },
    publishedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true, // createdAt, updatedAt
    toJSON: {
      transform(_doc, ret) {
        delete ret.__v;
      },
    },
  }
);

// Query: lấy PENDING events chưa đến thời gian retry
eventOutboxSchema.index({ status: 1, nextRetryAt: 1 });
// TTL: xóa PUBLISHED events sau 7 ngày
eventOutboxSchema.index(
  { publishedAt: 1 },
  {
    expireAfterSeconds: 7 * 24 * 60 * 60,
    partialFilterExpression: { status: 'PUBLISHED' },
  }
);

module.exports = mongoose.model('EventOutbox', eventOutboxSchema);
