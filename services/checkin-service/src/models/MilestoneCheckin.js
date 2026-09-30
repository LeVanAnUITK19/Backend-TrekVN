const mongoose = require('mongoose');

/**
 * MilestoneCheckin — check-in tại một milestone của tuyến trekking.
 * Mỗi bản ghi đại diện cho một lần user check-in GPS tại milestone.
 */
const milestoneCheckinSchema = new mongoose.Schema(
  {
    // Idempotency key từ client (dùng cho offline sync)
    // Không set default null để sparse index hoạt động đúng
    clientCheckinId: {
      type: String,
    },
    journeyId: {
      type: String,
      required: true,
      index: true,
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
    // Logical references đến trekking-service (không FK vật lý)
    trekkingPlaceId: {
      type: String,
      required: true,
    },
    trekkingRouteId: {
      type: String,
      required: true,
    },
    // Logical reference đến Province._id
    provinceId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    milestoneId: {
      type: String,
      required: true,
    },
    milestoneType: {
      type: String,
      required: true,
    },
    // Nếu true → trigger cập nhật PlaceVisit
    qualifiesPlaceVisit: {
      type: Boolean,
      default: false,
    },
    // GPS tại thời điểm check-in
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: true,
      },
    },
    accuracyMeters: {
      type: Number,
      required: true,
    },
    distanceToMilestoneMeters: {
      type: Number,
      required: true,
    },
    verification: {
      method: {
        type: String,
        enum: ['GPS'],
        default: 'GPS',
      },
      status: {
        type: String,
        enum: ['VERIFIED', 'REJECTED', 'PENDING_VERIFICATION'],
        default: 'VERIFIED',
      },
      reason: {
        type: String,
        default: null,
      },
    },
    syncSource: {
      type: String,
      enum: ['ONLINE', 'OFFLINE_SYNC'],
      default: 'ONLINE',
    },
    // Thời điểm thực tế check-in (do client gửi lên, có thể là quá khứ khi sync offline)
    checkedAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        ret.milestoneCheckinId = ret._id;
        delete ret._id;
        delete ret.__v;
      },
    },
  }
);

// Chống duplicate: cùng user + journey + milestone chỉ được check-in 1 lần
milestoneCheckinSchema.index(
  { journeyId: 1, milestoneId: 1, userId: 1 },
  { unique: true }
);

// Chống duplicate clientCheckinId per user
// partialFilterExpression: chỉ index khi clientCheckinId tồn tại và không null
milestoneCheckinSchema.index(
  { clientCheckinId: 1, userId: 1 },
  {
    unique: true,
    partialFilterExpression: { clientCheckinId: { $exists: true, $type: 'string' } },
  }
);

// Query lịch sử theo user
milestoneCheckinSchema.index({ userId: 1, checkedAt: -1 });

// Query theo user + địa điểm
milestoneCheckinSchema.index({ userId: 1, trekkingPlaceId: 1 });

// Query theo user + tỉnh
milestoneCheckinSchema.index({ userId: 1, provinceId: 1 });

milestoneCheckinSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('MilestoneCheckin', milestoneCheckinSchema);
