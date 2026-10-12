'use strict';

const mongoose = require('mongoose');
const { MARKER_TYPES } = require('../constants/marker');

const journeyMarkerSchema = new mongoose.Schema(
  {
    journeyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Journey', required: true },
    userId: { type: String, required: true },

    name: { type: String, required: true, trim: true, maxlength: 200 },
    type: {
      type: String,
      enum: MARKER_TYPES,
      required: true,
    },
    note: { type: String, maxlength: 2000 },

    location: {
      type: {
        type: String,
        enum: ['Point'],
        required: true,
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: true,
      },
    },

    altitude: { type: Number },
    accuracyMeters: { type: Number },

    // Danh sách URL ảnh đã upload
    images: { type: [String], default: [] },

    markedAt: { type: Date, required: true },

    source: { type: String, default: 'USER_CREATED' },

    // Client-generated ID cho idempotency (offline retry)
    clientMarkerId: { type: String, trim: true },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        ret.journeyMarkerId = ret._id;
        delete ret._id;
        delete ret.__v;
      },
    },
  }
);

journeyMarkerSchema.index({ location: '2dsphere' });
journeyMarkerSchema.index({ journeyId: 1 });
journeyMarkerSchema.index({ userId: 1 });
journeyMarkerSchema.index({ journeyId: 1, markedAt: 1 });
// Unique per journey+user+clientMarkerId để chống duplicate offline
journeyMarkerSchema.index(
  { journeyId: 1, userId: 1, clientMarkerId: 1 },
  { unique: true, sparse: true }
);

module.exports = mongoose.model('JourneyMarker', journeyMarkerSchema);
