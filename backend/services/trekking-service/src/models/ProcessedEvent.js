'use strict';

const mongoose = require('mongoose');

/**
 * ProcessedEvent — tracks events already handled by a consumer.
 * Prevents duplicate side effects when RabbitMQ re-delivers a message.
 *
 * Key: (eventId, consumerName) — unique per consumer so different consumers
 * can each process the same event independently.
 *
 * TTL: auto-delete after 30 days to prevent collection bloat.
 */
const processedEventSchema = new mongoose.Schema(
  {
    eventId: { type: String, required: true },
    consumerName: { type: String, required: true },
    processedAt: { type: Date, default: Date.now, immutable: true },
  },
  {
    timestamps: false,
    toJSON: {
      transform(_doc, ret) { delete ret.__v; },
    },
  }
);

processedEventSchema.index({ eventId: 1, consumerName: 1 }, { unique: true });
// TTL: remove after 30 days
processedEventSchema.index({ processedAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

module.exports = mongoose.model('ProcessedEvent', processedEventSchema);
