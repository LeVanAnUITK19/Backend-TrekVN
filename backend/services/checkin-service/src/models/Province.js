const mongoose = require('mongoose');

/**
 * Province — tỉnh/thành phố Việt Nam.
 * provinceId là _id mặc định của Mongoose (ObjectId).
 */
const provinceSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: null,
    },
    region: {
      type: String,
      enum: ['NORTH', 'CENTRAL', 'SOUTH'],
      default: null,
    },
    mapAsset: {
      type: String,
      default: null,
    },
    mapFeatureId: {
      type: String,
      default: null,
    },
    // GeoJSON Point: tâm tỉnh
    center: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        default: [0, 0],
      },
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        ret.provinceId = ret._id;
        delete ret._id;
        delete ret.__v;
      },
    },
  }
);

provinceSchema.index({ center: '2dsphere' });

module.exports = mongoose.model('Province', provinceSchema);
