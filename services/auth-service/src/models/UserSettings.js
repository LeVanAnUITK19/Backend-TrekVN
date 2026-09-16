const mongoose = require('mongoose');

const userSettingsSchema = new mongoose.Schema(
  {
    userSettingId: {
      type: String,
      default: () => new mongoose.Types.ObjectId().toHexString(),
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true, // mỗi user chỉ có 1 bản settings
    },
    language: {
      type: String,
      default: 'vi',
    },
    theme: {
      type: String,
      enum: ['light', 'dark'],
      default: 'dark',
    },
    distanceUnit: {
      type: String,
      enum: ['km', 'mi'],
      default: 'km',
    },
    notificationEnabled: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true, // tự sinh createdAt, updatedAt
    toJSON: {
      transform(doc, ret) {
        ret.userSettingId = ret._id;
        delete ret._id;
        delete ret.__v;
      },
    },
  }
);

module.exports = mongoose.model('UserSettings', userSettingsSchema);
