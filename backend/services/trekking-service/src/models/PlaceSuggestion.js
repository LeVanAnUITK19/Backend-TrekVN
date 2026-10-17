'use strict';

const mongoose = require('mongoose');
const { CONTRIBUTION_STATUS } = require('../constants/contribution');

const placeSuggestionSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    provinceId: { type: String, required: true },

    proposedName: { type: String, required: true, trim: true },
    address: { type: String, trim: true },

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

    description: { type: String, required: true },
    difficulty: {
      type: String,
      enum: ['EASY', 'MODERATE', 'HARD', 'EXPERT'],
    },
    tags: { type: [String], default: [] },
    images: { type: [String], default: [] },

    status: {
      type: String,
      enum: Object.values(CONTRIBUTION_STATUS),
      default: CONTRIBUTION_STATUS.PENDING_REVIEW,
    },

    reviewedBy: { type: String },
    reviewedAt: { type: Date },
    adminNote: { type: String },

    // ID của TrekkingPlace được tạo/link sau khi APPROVED
    resultingPlaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'TrekkingPlace' },

    // Client-generated ID cho idempotency
    clientOperationId: { type: String, trim: true },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        ret.placeSuggestionId = ret._id;
        delete ret._id;
        delete ret.__v;
      },
    },
  }
);

placeSuggestionSchema.index({ userId: 1 });
placeSuggestionSchema.index({ provinceId: 1 });
placeSuggestionSchema.index({ status: 1 });
placeSuggestionSchema.index({ createdAt: -1 });
placeSuggestionSchema.index({ clientOperationId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('PlaceSuggestion', placeSuggestionSchema);
