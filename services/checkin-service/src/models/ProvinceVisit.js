const mongoose = require('mongoose');

/**
 * ProvinceVisit — trạng thái user với một tỉnh.
 *
 * - user tự tick → manualMarked=true, SELF_REPORTED
 * - check-in hợp lệ → VERIFIED (không thể downgrade)
 * - Nếu đã VERIFIED, user bỏ tick cũng không xóa record
 */
const provinceVisitSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    // Logical reference tới Province._id (không FK vật lý)
    provinceId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    manualMarked: {
      type: Boolean,
      default: false,
    },
    verificationStatus: {
      type: String,
      enum: ['SELF_REPORTED', 'VERIFIED'],
      default: 'SELF_REPORTED',
    },
    firstVisitedAt: {
      type: Date,
      default: null,
    },
    lastVisitedAt: {
      type: Date,
      default: null,
    },
    // journeyId là string (logical reference đến trekking-service)
    firstJourneyId: {
      type: String,
      default: null,
    },
    lastJourneyId: {
      type: String,
      default: null,
    },
    verifiedAt: {
      type: Date,
      default: null,
    },
    verifiedJourneyId: {
      type: String,
      default: null,
    },
    verifiedCheckinId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    visitCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        ret.provinceVisitId = ret._id;
        delete ret._id;
        delete ret.__v;
      },
    },
  }
);

// Unique: một user chỉ có 1 record per tỉnh
provinceVisitSchema.index({ userId: 1, provinceId: 1 }, { unique: true });

module.exports = mongoose.model('ProvinceVisit', provinceVisitSchema);
