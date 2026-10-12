'use strict';

const mongoose = require('mongoose');

const detailEvaluateSchema = new mongoose.Schema(
  {
    trekkingPlaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'TrekkingPlace', required: true },
    userId: { type: String, required: true },

    // 1 -> 5
    point: { type: Number, required: true, min: 1, max: 5 },

    content: { type: String, maxlength: 5000 },
    isAnonymous: { type: Boolean, default: false },

    imagesUrl: { type: [String], default: [] },
    videoUrl: { type: [String], default: [] },

    // Soft delete
    deleted: { type: Boolean, default: false },
    editCount: { type: Number, default: 0, min: 0, max: 1 },
    removedBy: { type: String },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        ret.detailEvaluateId = ret._id;
        delete ret._id;
        delete ret.__v;
      },
    },
  }
);

detailEvaluateSchema.index({ trekkingPlaceId: 1, userId: 1 }, { unique: true });
detailEvaluateSchema.index({ trekkingPlaceId: 1 });
detailEvaluateSchema.index({ userId: 1 });

module.exports = mongoose.model('DetailEvaluate', detailEvaluateSchema);
