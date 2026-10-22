'use strict';

const TrekkingPlace = require('../models/TrekkingPlace');

const findAll = async ({ q, provinceId, mien, difficulty, tags, status = 'ACTIVE', page = 1, limit = 20 } = {}) => {
  const filter = {};
  if (status) { filter.status = status; }
  if (provinceId) {
    // Support single provinceId string or array (from region filter)
    if (Array.isArray(provinceId)) {
      filter.provinceId = { $in: provinceId };
    } else {
      filter.provinceId = provinceId;
    }
  }
  // Lọc theo miền (mien-bac, mien-trung, mien-nam)
  if (mien) { filter.mien = mien; }
  if (difficulty) { filter.difficulty = difficulty; }
  if (tags) {
    const tagList = Array.isArray(tags) ? tags : tags.split(',').map((t) => t.trim());
    filter.tags = { $in: tagList };
  }
  if (q) {
    filter.$or = [
      { name: { $regex: q, $options: 'i' } },
      { description: { $regex: q, $options: 'i' } },
    ];
  }

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    TrekkingPlace.find(filter).sort({ ratingAverage: -1, createdAt: -1 }).skip(skip).limit(limit),
    TrekkingPlace.countDocuments(filter),
  ]);
  return { items, total, page, limit };
};

const findById = (id) => TrekkingPlace.findById(id);

const findBySlug = (slug) => TrekkingPlace.findOne({ slug });

const create = (data) => TrekkingPlace.create(data);

const updateById = (id, data) =>
  TrekkingPlace.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true });

const updateStatus = (id, status) =>
  TrekkingPlace.findByIdAndUpdate(id, { $set: { status } }, { new: true });

/**
 * Cập nhật offline map metadata cho place.
 * Được Agent Service gọi sau Admin approval + R2 upload thành công.
 * Chỉ lưu objectKey, KHÔNG lưu downloadUrl (build runtime).
 */
const updateOfflineMap = (id, offlineMapData) =>
  TrekkingPlace.findByIdAndUpdate(
    id,
    { $set: { offlineMap: offlineMapData } },
    { new: true, runValidators: true }
  );

/**
 * Cập nhật ratingAverage và ratingCount an toàn bằng aggregation.
 */
const recalculateRating = async (trekkingPlaceId) => {
  const DetailEvaluate = require('../models/DetailEvaluate');
  const mongoose = require('mongoose');
  // Chuyển sang ObjectId để match đúng trong aggregate
  const placeObjId = new mongoose.Types.ObjectId(String(trekkingPlaceId));
  const result = await DetailEvaluate.aggregate([
    { $match: { trekkingPlaceId: placeObjId, deleted: false } },
    { $group: { _id: null, avg: { $avg: '$point' }, count: { $sum: 1 } } },
  ]);
  const avg = result[0] ? Math.round(result[0].avg * 10) / 10 : 0;
  const count = result[0] ? result[0].count : 0;
  return TrekkingPlace.findByIdAndUpdate(
    trekkingPlaceId,
    { $set: { ratingAverage: avg, ratingCount: count } },
    { new: true }
  );
};

/**
 * Admin: xóa mềm (DISABLED) hoặc xóa cứng tùy spec.
 * Spec dùng soft delete: status = 'DISABLED'.
 * TrekkingPlace model chưa có DISABLED — dùng INACTIVE thay thế
 * và ghi nhận qua field bổ sung nếu cần.
 */
const softDelete = (id) =>
  TrekkingPlace.findByIdAndUpdate(id, { $set: { status: 'INACTIVE' } }, { new: true });

/**
 * Admin list với đầy đủ filter (search, province, difficulty, status).
 */
const adminFindAll = async ({ search, province, difficulty, status, page = 1, limit = 20 } = {}) => {
  const filter = {};
  if (status) {filter.status = status;}
  if (province) {filter.provinceId = province;}
  if (difficulty) {filter.difficulty = difficulty;}
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } },
    ];
  }
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    TrekkingPlace.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    TrekkingPlace.countDocuments(filter),
  ]);
  return { data: items, total, page, limit, totalPages: Math.ceil(total / limit) };
};

/**
 * Danh sách places có offlineMap.available = true.
 * Dùng cho tab "Bản đồ địa điểm" trong Admin.
 */
const findPlacesWithOfflineMap = async ({ search, page = 1, limit = 20 } = {}) => {
  const filter = { 'offlineMap.available': true };
  if (search) {
    filter.$or = [{ name: { $regex: search, $options: 'i' } }];
  }
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    TrekkingPlace.find(filter)
      .select('name slug provinceId address difficulty elevationMeters status offlineMap updatedAt createdAt')
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit),
    TrekkingPlace.countDocuments(filter),
  ]);
  return { data: items, total, page, limit, totalPages: Math.ceil(total / limit) };
};

module.exports = { findAll, adminFindAll, findById, findBySlug, create, updateById, updateStatus, softDelete, updateOfflineMap, recalculateRating, findPlacesWithOfflineMap };
