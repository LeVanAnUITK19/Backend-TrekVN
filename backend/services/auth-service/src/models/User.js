const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    // Nullable: null khi user chỉ đăng nhập bằng Google (không có LOCAL password)
    passwordHash: {
      type: String,
      default: null,
    },
    displayName: {
      type: String,
      required: true,
      trim: true,
    },
    avatarUrl: {
      type: String,
      default: null,
    },
    bio: {
      type: String,
      default: null,
    },
    role: {
      type: String,
      enum: ['USER', 'ADMIN'],
      default: 'USER',
    },
    // PENDING_VERIFICATION → ACTIVE → BLOCKED (DB v3.1)
    status: {
      type: String,
      enum: ['PENDING_VERIFICATION', 'ACTIVE', 'BLOCKED'],
      default: 'PENDING_VERIFICATION',
    },
    emailVerifiedAt: {
      type: Date,
      default: null,
    },
    lastLoginAt: { type: Date, default: null },
    tokenVersion: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        ret.userId = ret._id;
        delete ret._id;
        delete ret.__v;
        delete ret.passwordHash;
        delete ret.tokenVersion;
      },
    },
  }
);

module.exports = mongoose.model('User', userSchema);
