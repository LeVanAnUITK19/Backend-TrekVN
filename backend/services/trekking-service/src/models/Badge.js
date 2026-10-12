'use strict';

const mongoose = require('mongoose');
const { BADGE_CATEGORIES, BADGE_RARITIES, BADGE_STATUS } = require('../constants/badge');

const badgeSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    description: { type: String },
    iconUrl: { type: String },
    category: {
      type: String,
      enum: BADGE_CATEGORIES,
    },
    rarity: {
      type: String,
      enum: BADGE_RARITIES,
    },
    // { type: 'ALTITUDE_REACHED', value: 2000 }
    condition: { type: mongoose.Schema.Types.Mixed },
    status: {
      type: String,
      enum: Object.values(BADGE_STATUS),
      default: BADGE_STATUS.ACTIVE,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
      },
    },
  }
);

badgeSchema.index({ code: 1 }, { unique: true });
badgeSchema.index({ status: 1 });
badgeSchema.index({ category: 1 });

module.exports = mongoose.model('Badge', badgeSchema);
