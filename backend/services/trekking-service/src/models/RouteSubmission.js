'use strict';

const mongoose = require('mongoose');
const { CONTRIBUTION_STATUS } = require('../constants/contribution');

const routeSubmissionSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    contributionKind: { type: String, enum: ['ROUTE', 'MARKERS'], default: 'ROUTE' },
    sourceJourneyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Journey', required: true },
    trekkingPlaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'TrekkingPlace' },

    proposedName: { type: String, trim: true },
    description: { type: String },
    notes: { type: String },

    encodedPolyline: { type: String },
    gpxUrl: { type: String },

    statistics: {
      distanceMeters: Number,
      durationSeconds: Number,
      elevationGain: Number,
      maxAltitude: Number,
      averageSpeed: Number,
    },

    images: { type: [String], default: [] },

    // IDs của Journey Markers user chọn chia sẻ (để reference)
    markerIds: { type: [String], default: [] },

    status: {
      type: String,
      enum: Object.values(CONTRIBUTION_STATUS),
      default: CONTRIBUTION_STATUS.PENDING_REVIEW,
    },

    reviewedBy: { type: String },
    reviewedAt: { type: Date },
    adminNote: { type: String },

    // ID của TrekkingRoute được tạo/link sau khi APPROVED
    resultingRouteId: { type: mongoose.Schema.Types.ObjectId, ref: 'TrekkingRoute' },

    // Client-generated ID cho idempotency
    clientOperationId: { type: String, trim: true },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        ret.routeSubmissionId = ret._id;
        delete ret._id;
        delete ret.__v;
      },
    },
  }
);

routeSubmissionSchema.index({ userId: 1 });
routeSubmissionSchema.index({ sourceJourneyId: 1 });
routeSubmissionSchema.index({ status: 1 });
routeSubmissionSchema.index({ createdAt: -1 });
routeSubmissionSchema.index({ clientOperationId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('RouteSubmission', routeSubmissionSchema);
