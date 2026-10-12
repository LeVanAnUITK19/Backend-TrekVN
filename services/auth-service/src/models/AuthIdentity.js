'use strict';

const mongoose = require('mongoose');

/**
 * AuthIdentity — mỗi bản ghi đại diện cho một phương thức xác thực của user.
 *
 * provider:
 *   LOCAL  — email + password (passwordHash được lưu ở User model)
 *   GOOGLE — Google Sign-In (providerUserId = Google sub)
 *
 * DB v3.1: auth_identities
 * Unique indexes: (userId, provider), (provider, providerUserId)
 */
const authIdentitySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // LOCAL | GOOGLE
    provider: {
      type: String,
      enum: ['LOCAL', 'GOOGLE'],
      required: true,
    },
    // Google sub nếu provider=GOOGLE; null nếu provider=LOCAL
    providerUserId: {
      type: String,
      default: null,
    },
    // Có giá trị khi provider=LOCAL, null cho GOOGLE
    // Redundant với User.passwordHash — được giữ để tương thích schema DB v3.1
    // Thực tế password hash lưu tại User.passwordHash
    passwordHash: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        ret.authIdentityId = ret._id;
        delete ret._id;
        delete ret.__v;
        delete ret.passwordHash; // không expose hash ra ngoài
      },
    },
  }
);

// Một user chỉ có 1 identity per provider
authIdentitySchema.index({ userId: 1, provider: 1 }, { unique: true });
// Google lookup: tìm identity theo sub
authIdentitySchema.index(
  { provider: 1, providerUserId: 1 },
  {
    unique: true,
    partialFilterExpression: { providerUserId: { $type: 'string' } },
  }
);

module.exports = mongoose.model('AuthIdentity', authIdentitySchema);
