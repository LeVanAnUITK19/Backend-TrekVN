const mongoose = require('mongoose');

/**
 * RankHistory — lưu lịch sử mỗi lần rank của user thay đổi.
 *
 * changeType:
 *   PROMOTION     — lên rank
 *   DEMOTION      — xuống rank
 *   RECALCULATION — tính lại (không thay đổi rank nhưng trigger recalc)
 */
const rankHistorySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // null nếu đây là lần đầu tiên (từ không có rank → NEWBIE)
    previousRankId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RankDefinition',
      default: null,
    },
    newRankId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RankDefinition',
      required: true,
    },
    // XP tại thời điểm thay đổi rank
    xpAtChange: {
      type: Number,
      required: true,
      min: 0,
    },
    // PROMOTION | DEMOTION | RECALCULATION
    changeType: {
      type: String,
      enum: ['PROMOTION', 'DEMOTION', 'RECALCULATION'],
      default: 'PROMOTION',
    },
    changedAt: {
      type: Date,
      default: Date.now,
      required: true,
      immutable: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      immutable: true,
    },
  },
  {
    timestamps: false,
    toJSON: {
      transform(_doc, ret) {
        ret.rankHistoryId = ret._id;
        delete ret._id;
        delete ret.__v;
      },
    },
  }
);

rankHistorySchema.index({ userId: 1, changedAt: -1 });

module.exports = mongoose.model('RankHistory', rankHistorySchema);
