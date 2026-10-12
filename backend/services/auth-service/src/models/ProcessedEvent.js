'use strict';

const mongoose = require('mongoose');

/**
 * ProcessedEvent — tracks events already handled by auth-service consumers.
 * Prevents XP being granted twice on RabbitMQ redelivery.
 * TTL: auto-delete after 30 days.
 */
const processedEventSchema = new mongoose.Schema(
  {
    eventId: { type: String, required: true },
    consumerName: { type: String, required: true },
    processedAt: { type: Date, default: Date.now, immutable: true },
  },
  { timestamps: false }
);

processedEventSchema.index({ eventId: 1, consumerName: 1 }, { unique: true });
processedEventSchema.index({ processedAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

module.exports = mongoose.model('ProcessedEvent', processedEventSchema);
