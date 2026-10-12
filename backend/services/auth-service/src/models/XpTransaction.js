const mongoose = require('mongoose');

/**
 * XpTransaction — ghi lại từng lần cộng/trừ XP của user.
 * idempotencyKey đảm bảo không cộng XP trùng khi retry hoặc offline sync.
 *
 * transactionType:
 *   EARN            — nhận XP bình thường
 *   REVERSAL        — hoàn lại XP (ví dụ: journey bị huỷ)
 *   ADMIN_ADJUSTMENT — admin điều chỉnh thủ công
 *
 * sourceType (các nguồn XP):
 *   JOURNEY_COMPLETED, JOURNEY_DISTANCE, JOURNEY_ELEVATION,
 *   MILESTONE_CHECKIN, PROVINCE_VISITED, PLACE_VISITED,
 *   BADGE_EARNED, ROUTE_APPROVED, PLACE_APPROVED, ADMIN_ADJUSTMENT
 */
const xpTransactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // EARN | REVERSAL | ADMIN_ADJUSTMENT
    transactionType: {
      type: String,
      enum: ['EARN', 'REVERSAL', 'ADMIN_ADJUSTMENT'],
      default: 'EARN',
      required: true,
    },
    sourceType: {
      type: String,
      enum: [
        'JOURNEY_COMPLETED',
        'JOURNEY_DISTANCE',
        'JOURNEY_ELEVATION',
        'MILESTONE_CHECKIN',
        'PROVINCE_VISITED',
        'PLACE_VISITED',
        'BADGE_EARNED',
        'ROUTE_APPROVED',
        'PLACE_APPROVED',
        'ADMIN_ADJUSTMENT',
      ],
      required: true,
    },
    // ID của entity nguồn (journeyId, checkinId, badgeId, ...)
    sourceId: {
      type: String,
      default: null,
    },
    // Dương = cộng XP, âm = trừ XP (REVERSAL)
    xpAmount: {
      type: Number,
      required: true,
    },
    description: {
      type: String,
      default: null,
    },
    // Chống cộng XP nhiều lần khi retry/offline sync
    idempotencyKey: {
      type: String,
      required: true,
      unique: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      immutable: true,
    },
  },
  {
    // Không dùng timestamps vì chỉ cần createdAt (immutable)
    timestamps: false,
    toJSON: {
      transform(_doc, ret) {
        ret.xpTransactionId = ret._id;
        delete ret._id;
        delete ret.__v;
      },
    },
  }
);

xpTransactionSchema.index({ userId: 1, createdAt: -1 });
xpTransactionSchema.index({ sourceType: 1 });
xpTransactionSchema.index({ sourceId: 1 });
// TTL: tự xoá sau 2 năm để tránh collection phình to quá mức
// (bỏ comment nếu muốn bật)
// xpTransactionSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 730 });

module.exports = mongoose.model('XpTransaction', xpTransactionSchema);
