'use strict';

const mongoose = require('mongoose');
const { SUBMISSION_MARKER_REVIEW_STATUS } = require('../constants/contribution');
const { MARKER_TYPES } = require('../constants/marker');

const routeSubmissionMarkerSchema = new mongoose.Schema(
  {
    routeSubmissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'RouteSubmission', required: true },

    // Snapshot reference về marker gốc
    sourceJourneyMarkerId: { type: mongoose.Schema.Types.ObjectId, ref: 'JourneyMarker' },

    // Snapshot tại thời điểm submit (không bị ảnh hưởng nếu user sửa marker gốc)
    name: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: MARKER_TYPES,
      required: true,
    },
    description: { type: String },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        required: true,
      },
      coordinates: {
        type: [Number],
        required: true,
      },
    },
    altitude: { type: Number },
    images: { type: [String], default: [] },

    // Thứ tự dọc route
    sequence: { type: Number },

    // Admin review status
    reviewStatus: {
      type: String,
      enum: Object.values(SUBMISSION_MARKER_REVIEW_STATUS),
      default: SUBMISSION_MARKER_REVIEW_STATUS.PENDING,
    },
    adminNote: { type: String },

    // Nếu admin convert thành Official Milestone
    resultingMilestoneId: { type: mongoose.Schema.Types.ObjectId, ref: 'Milestone' },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        ret.routeSubmissionMarkerId = ret._id;
        delete ret._id;
        delete ret.__v;
      },
    },
  }
);

routeSubmissionMarkerSchema.index({ routeSubmissionId: 1 });
routeSubmissionMarkerSchema.index({ reviewStatus: 1 });
routeSubmissionMarkerSchema.index({ routeSubmissionId: 1, sequence: 1 });

module.exports = mongoose.model('RouteSubmissionMarker', routeSubmissionMarkerSchema);
