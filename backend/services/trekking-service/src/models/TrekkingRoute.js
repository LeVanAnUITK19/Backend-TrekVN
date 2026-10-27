'use strict';

const mongoose = require('mongoose');

const offlineMapSchema = new mongoose.Schema(
  {
    available: { type: Boolean, default: false },
    version: { type: Number, default: 0 },
    // R2 object key — e.g. "ba-den/v1/ba-den-v1-flutter.zip"
    // Backend builds full downloadUrl = R2_PUBLIC_BASE_URL + "/" + objectKey
    // KHÔNG lưu full URL để dễ đổi CDN / base URL.
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
  { _id: false }
);

const trekkingRouteSchema = new mongoose.Schema(
  {
    trekkingPlaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'TrekkingPlace', required: true },
    name: { type: String, required: true, trim: true },
    description: { type: String },
    difficulty: {
      type: String,
      enum: ['EASY', 'MODERATE', 'HARD', 'EXPERT'],
    },
    distanceMeters: { type: Number, min: 0 },
    estimatedDurationMinutes: { type: Number, min: 0 },
    elevationGain: { type: Number, min: 0 },
    maxElevation: { type: Number },
    // Route-specific image (ảnh riêng của route, khác với place)
    imageUrl: { type: String },
    startLocation: {
      type: {
        type: String,
        enum: ['Point'],
      },
      coordinates: { type: [Number] },
    },
    endLocation: {
      type: {
        type: String,
        enum: ['Point'],
      },
      coordinates: { type: [Number] },
    },
    // GeoJSON LineString for the route path
    path: {
      type: {
        type: String,
        enum: ['LineString'],
      },
      coordinates: { type: [[Number]] },
    },
    offlineMap: { type: offlineMapSchema, default: () => ({}) },
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
        ret.trekkingRouteId = ret._id;
        delete ret._id;
        delete ret.__v;
      },
    },
  }
);

trekkingRouteSchema.index({ trekkingPlaceId: 1 });
trekkingRouteSchema.index({ status: 1 });

trekkingRouteSchema.index({ status: 1, trekkingPlaceId: 1, createdAt: -1, _id: -1 });
trekkingRouteSchema.plugin(require('./plugins/catalogInvalidation'));
module.exports = mongoose.model('TrekkingRoute', trekkingRouteSchema);
