const mongoose = require('mongoose');

/**
 * PlaceVisit — lịch sử user đã đến địa điểm trekking.
 * Chỉ được tạo bởi verified check-in (qualifiesPlaceVisit=true).
 * User không tự tick được.
 */
const placeVisitSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    // Logical reference đến trekking-service
    trekkingPlaceId: {
      type: String,
      required: true,
      index: true,
    },
    // Logical reference đến Province._id
    provinceId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    firstVisitedAt: {
      type: Date,
      required: true,
    },
    lastVisitedAt: {
      type: Date,
      required: true,
    },
    firstJourneyId: {
      type: String,
      default: null,
    },
    lastJourneyId: {
      type: String,
      default: null,
    },
    lastCheckinId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    visitCount: {
      type: Number,
      default: 1,
    },
    verificationStatus: {
      type: String,
      enum: ['VERIFIED'],
      default: 'VERIFIED',
    },
    source: {
      type: String,
      enum: ['CHECKIN'],
      default: 'CHECKIN',
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        ret.placeVisitId = ret._id;
        delete ret._id;
        delete ret.__v;
      },
    },
  }
);

// Unique: một user chỉ có 1 record per địa điểm
placeVisitSchema.index({ userId: 1, trekkingPlaceId: 1 }, { unique: true });
// Sắp xếp theo lần ghé thăm cuối
placeVisitSchema.index({ userId: 1, lastVisitedAt: -1 });

module.exports = mongoose.model('PlaceVisit', placeVisitSchema);
