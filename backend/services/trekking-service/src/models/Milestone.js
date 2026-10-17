'use strict';

const mongoose = require('mongoose');
const { MILESTONE_TYPES } = require('../constants/milestone');
const { QUALIFYING_MILESTONE_TYPES } = require('../constants/milestone');

const milestoneSchema = new mongoose.Schema(
  {
    trekkingRouteId: { type: mongoose.Schema.Types.ObjectId, ref: 'TrekkingRoute', required: true },
    name: { type: String, required: true, trim: true },
    description: { type: String },
    type: {
      type: String,
      enum: MILESTONE_TYPES,
      required: true,
    },
    sequence: { type: Number, required: true, min: 0 },
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
    checkinRadiusMeters: { type: Number, default: 50, min: 1 },
    required: { type: Boolean, default: true },
    imageUrl: { type: String },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        ret.milestoneId = ret._id;
        delete ret._id;
        delete ret.__v;
      },
    },
  }
);

milestoneSchema.index({ location: '2dsphere' });
milestoneSchema.index({ trekkingRouteId: 1, sequence: 1 }, { unique: true });

/**
 * Virtual: apakah milestone ini qualify place visit?
 * Dùng cho internal checkin-context API.
 */
milestoneSchema.virtual('qualifiesPlaceVisit').get(function () {
  return QUALIFYING_MILESTONE_TYPES.includes(this.type);
});

module.exports = mongoose.model('Milestone', milestoneSchema);
