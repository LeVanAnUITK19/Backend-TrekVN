'use strict';

const mongoose = require('mongoose');

/**
 * OfflineMapPackage — quản lý các gói bản đồ offline được publish cho user tải.
 *
 * Khác với offlineMap trong TrekkingPlace/TrekkingRoute:
 * - TrekkingPlace.offlineMap: map gắn với địa điểm cụ thể (Agent Map Builder tạo).
 * - OfflineMapPackage: gói bản đồ độc lập, có thể bao gồm nhiều vùng (manual upload).
 *
 * status: DRAFT → PUBLISHED → DEPRECATED
 * regionCode: NORTH | CENTRAL | SOUTH | ALL
 */
const offlineMapPackageSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    version: { type: String, required: true, trim: true },
    description: { type: String, default: null },
    checksum: { type: String, default: null },

    // R2 object key — downloadUrl được build runtime
    objectKey: { type: String, default: null },

    fileSizeBytes: { type: Number, default: null, min: 0 },

    status: {
      type: String,
      enum: ['DRAFT', 'PUBLISHED', 'DEPRECATED'],
      default: 'DRAFT',
    },

    regionCode: {
      type: String,
      enum: ['NORTH', 'CENTRAL', 'SOUTH', 'ALL'],
      default: null,
    },

    publishedAt: { type: Date, default: null },

    // Admin người tạo
    createdBy: { type: String, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
      },
    },
  }
);

offlineMapPackageSchema.index({ status: 1 });
offlineMapPackageSchema.index({ regionCode: 1 });
offlineMapPackageSchema.index({ createdAt: -1 });

module.exports = mongoose.model('OfflineMapPackage', offlineMapPackageSchema);
