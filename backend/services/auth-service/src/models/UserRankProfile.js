const mongoose = require('mongoose');

/**
 * UserRankProfile — lưu rank hiện tại và toàn bộ thống kê tích lũy của user.
 * Mỗi user chỉ có đúng 1 profile (unique userId).
 * Profile được tạo lần đầu khi user hoàn thành đăng ký.
 */
const userRankProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    currentRankId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RankDefinition',
      required: true,
    },
    // Tổng XP tích lũy
    totalXp: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Số hành trình đã hoàn thành
    completedJourneyCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Tổng quãng đường (mét)
    totalDistanceMeters: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Tổng độ cao chinh phục (mét)
    totalElevationGain: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Số lần check-in đã xác minh
    verifiedCheckinCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Số tỉnh thành đã ghé thăm
    visitedProvinceCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Số địa điểm đã ghé thăm
    visitedPlaceCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Số huy hiệu đang sở hữu
    badgeCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Số đóng góp (route/place) đã được duyệt
    approvedContributionCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Thời điểm rank cuối cùng được tính toán lại
    lastCalculatedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        ret.userRankProfileId = ret._id;
        delete ret._id;
        delete ret.__v;
      },
    },
  }
);

// userId already declares its unique index above.
userRankProfileSchema.index({ currentRankId: 1 });
userRankProfileSchema.index({ totalXp: -1 });

module.exports = mongoose.model('UserRankProfile', userRankProfileSchema);
