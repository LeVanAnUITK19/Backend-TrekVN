const mongoose = require('mongoose');

/**
 * RankDefinition — định nghĩa các cấp bậc trong hệ thống gamification.
 * Dữ liệu này thường được seed một lần và ít thay đổi.
 *
 * Các rank theo thứ tự level:
 *   1. NEWBIE → 2. HIKER → 3. EXPLORER → 4. TREKKER → 5. PATHFINDER
 *   6. MOUNTAINEER → 7. ADVENTURER → 8. ELITE_TREKKER → 9. TREK_MASTER → 10. TREK_LEGEND
 */
const rankDefinitionSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      enum: [
        'NEWBIE',
        'HIKER',
        'EXPLORER',
        'TREKKER',
        'PATHFINDER',
        'MOUNTAINEER',
        'ADVENTURER',
        'ELITE_TREKKER',
        'TREK_MASTER',
        'TREK_LEGEND',
      ],
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: null,
    },
    // Thứ tự rank: 1 → 10
    level: {
      type: Number,
      required: true,
      unique: true,
      min: 1,
      max: 10,
    },
    // Điều kiện XP tối thiểu
    minXp: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    // Các điều kiện bổ sung
    minCompletedJourneys: {
      type: Number,
      default: 0,
      min: 0,
    },
    minVisitedProvinces: {
      type: Number,
      default: 0,
      min: 0,
    },
    minBadgeCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    minDistanceMeters: {
      type: Number,
      default: 0,
      min: 0,
    },
    minApprovedContributions: {
      type: Number,
      default: 0,
      min: 0,
    },
    iconUrl: {
      type: String,
      default: null,
    },
    // ACTIVE | INACTIVE
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE'],
      default: 'ACTIVE',
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        ret.rankId = ret._id;
        delete ret._id;
        delete ret.__v;
      },
    },
  }
);

// level already declares its unique index above.
rankDefinitionSchema.index({ minXp: 1 });
rankDefinitionSchema.index({ status: 1 });

module.exports = mongoose.model('RankDefinition', rankDefinitionSchema);
