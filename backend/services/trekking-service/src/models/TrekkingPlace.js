'use strict';

const mongoose = require('mongoose');

const trekkingPlaceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, unique: true, sparse: true },
    provinceId: { type: String, required: true },
    address: { type: String, trim: true },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        required: true,
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: true,
      },
    },
    description: { type: String },
    difficulty: {
      type: String,
      enum: ['EASY', 'MODERATE', 'HARD', 'EXPERT'],
    },
    averageDurationMinutes: { type: Number, min: 0 },
    // Độ cao đại diện của địa điểm / đỉnh núi (mét)
    elevationMeters: { type: Number, min: 0 },
    images: { type: [String], default: [] },
    imageMapUrl: { type: String },
    tags: { type: [String], default: [] },
    // Nguồn tạo bản ghi: MANUAL | USER_CONTRIBUTION | AI_AGENT
    dataOrigin: {
      type: String,
      enum: ['MANUAL', 'USER_CONTRIBUTION', 'AI_AGENT'],
      default: 'MANUAL',
    },
    // External IDs phục vụ chống trùng & cập nhật lại dữ liệu
    // Ví dụ: { "osm": { "type": "node", "id": "123456" }, "wikidataId": "Q123456" }
    externalRefs: { type: mongoose.Schema.Types.Mixed },
    // Thời điểm gần nhất dữ liệu được Admin/Agent xác minh lại
    lastVerifiedAt: { type: Date },
    // Offline map cấp địa điểm — chỉ lưu objectKey, downloadUrl build runtime
    offlineMap: {
      available: { type: Boolean, default: false },
      version: { type: Number, default: 0 },
      objectKey: { type: String },
      sizeBytes: { type: Number },
      checksum: { type: String },
      minZoom: { type: Number },
      maxZoom: { type: Number },
      bounds: {
        minLat: Number,
        minLon: Number,
        maxLat: Number,
        maxLon: Number,
      },
    },
    ratingAverage: { type: Number, default: 0, min: 0, max: 5 },
    ratingCount: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE', 'DISABLED'],
      default: 'ACTIVE',
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        ret.trekkingPlaceId = ret._id;
        delete ret._id;
        delete ret.__v;
      },
    },
  }
);

trekkingPlaceSchema.index({ location: '2dsphere' });
trekkingPlaceSchema.index({ slug: 1 }, { unique: true, sparse: true });
trekkingPlaceSchema.index({ provinceId: 1 });
trekkingPlaceSchema.index({ provinceId: 1, status: 1 });
trekkingPlaceSchema.index({ status: 1 });
trekkingPlaceSchema.index({ tags: 1 });
trekkingPlaceSchema.index({ dataOrigin: 1 });

module.exports = mongoose.model('TrekkingPlace', trekkingPlaceSchema);
