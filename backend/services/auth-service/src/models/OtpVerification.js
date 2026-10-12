const mongoose = require('mongoose');

const otpVerificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null, // null cho đến khi user được tạo (trường hợp register)
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    // REGISTER | RESET_PASSWORD
    purpose: {
      type: String,
      enum: ['REGISTER', 'RESET_PASSWORD'],
      required: true,
    },
    otpHash: {
      type: String,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    // ACTIVE | USED | EXPIRED
    status: {
      type: String,
      enum: ['ACTIVE', 'USED', 'EXPIRED'],
      default: 'ACTIVE',
    },
    usedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true, // chỉ cần createdAt
    toJSON: {
      transform(_doc, ret) {
        ret.otpId = ret._id;
        delete ret._id;
        delete ret.__v;
        delete ret.otpHash; // không expose hash ra ngoài
      },
    },
  }
);

// Tự động expire bản ghi sau 24h để DB không phình to
otpVerificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 86400 });

module.exports = mongoose.model('OtpVerification', otpVerificationSchema);
