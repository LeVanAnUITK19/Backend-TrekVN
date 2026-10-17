'use strict';

const mongoose = require('mongoose');

const userBadgeSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    badgeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Badge', required: true },
    journeyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Journey' },
    earnedAt: { type: Date, required: true, default: Date.now },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        ret.userBadgeId = ret._id;
        delete ret._id;
        delete ret.__v;
      },
    },
  }
);

// Một user chỉ nhận một badge một lần (BR-07, BR-34)
userBadgeSchema.index({ userId: 1, badgeId: 1 }, { unique: true });
userBadgeSchema.index({ userId: 1 });

module.exports = mongoose.model('UserBadge', userBadgeSchema);
