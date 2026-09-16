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
    passwordHash: {
      type: String,
      required: true,
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
      enum: ['USER', 'GUIDE', 'ADMIN'],
      default: 'USER',
    },
    // PENDING_VERIFICATION → ACTIVE → SUSPENDED | DISABLED
    status: {
      type: String,
      enum: ['PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'DISABLED'],
      default: 'PENDING_VERIFICATION',
    },
    emailVerifiedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        ret.userId = ret._id;
        delete ret._id;
        delete ret.__v;
        delete ret.passwordHash;
      },
    },
  }
);

module.exports = mongoose.model('User', userSchema);
