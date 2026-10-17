'use strict';

const mongoose = require('mongoose');
const { JOURNEY_STATUS } = require('../constants/journey');

const statisticsSchema = new mongoose.Schema(
  {
    distanceMeters: { type: Number, default: 0, min: 0 },
    durationSeconds: { type: Number, default: 0, min: 0 },
    elevationGain: { type: Number, default: 0, min: 0 },
    maxAltitude: { type: Number },
    averageSpeed: { type: Number, min: 0 },
  },
  { _id: false }
);

const trackSchema = new mongoose.Schema(
  {
    encodedPolyline: { type: String },
  },
  { _id: false }
);

const journeySchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    trekkingPlaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'TrekkingPlace', required: true },
    trekkingRouteId: { type: mongoose.Schema.Types.ObjectId, ref: 'TrekkingRoute', required: true },
    provinceId: { type: String },

    // Client-generated ID cho idempotency và offline mapping
    clientJourneyId: { type: String, trim: true },

    name: { type: String, required: true, trim: true },
    note: { type: String },
    participantCount: { type: Number, default: 1, min: 1 },

    status: {
      type: String,
      enum: Object.values(JOURNEY_STATUS),
      default: JOURNEY_STATUS.PLANNED,
    },

    plannedStartAt: { type: Date },
    plannedEndAt: { type: Date },
    startedAt: { type: Date },
    completedAt: { type: Date },

    statistics: { type: statisticsSchema, default: () => ({}) },

    // Chỉ lưu encodedPolyline sau khi complete — không lưu raw GPS points
    track: { type: trackSchema, default: () => ({}) },

    checkinCount: { type: Number, default: 0, min: 0 },
    markerCount: { type: Number, default: 0, min: 0 },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        ret.journeyId = ret._id;
        delete ret._id;
        delete ret.__v;
      },
    },
  }
);

// Indexes theo DB design v3.1
journeySchema.index({ userId: 1 });
journeySchema.index({ trekkingPlaceId: 1 });
journeySchema.index({ trekkingRouteId: 1 });
journeySchema.index({ provinceId: 1 });
journeySchema.index({ status: 1 });
journeySchema.index({ createdAt: -1 });
journeySchema.index({ userId: 1, status: 1 });
journeySchema.index({ userId: 1, createdAt: -1 });
// clientJourneyId unique per user để chống duplicate offline
// Dùng partialFilterExpression để chỉ enforce khi clientJourneyId tồn tại (không null/undefined)
journeySchema.index(
  { userId: 1, clientJourneyId: 1 },
  {
    unique: true,
    partialFilterExpression: { clientJourneyId: { $type: 'string' } },
  }
);

module.exports = mongoose.model('Journey', journeySchema);
