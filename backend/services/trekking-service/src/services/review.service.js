'use strict';

const reviewRepo = require('../repositories/review.repository');
const placeRepo = require('../repositories/place.repository');
const { Errors, ForbiddenError, ConflictError, AppError } = require('../utils/errors');
const Journey = require('../models/Journey');
const DetailEvaluate = require('../models/DetailEvaluate');

const getReviews = async (placeId, query) => {
  const place = await placeRepo.findById(placeId);
  if (!place || place.status !== 'ACTIVE') { throw Errors.placeNotFound(placeId); }
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.max(1, Math.min(parseInt(query.limit) || 20, 100));
  const result = await reviewRepo.findByPlace(placeId, { page, limit });
  return {
    ...result,
    items: result.items.map((review) => {
      const item = review.toJSON();
      if (item.isAnonymous) {
        delete item.userId;
        delete item.avatarUrl;
        item.displayName = 'Trekker ẩn danh';
      }
      return item;
    }),
  };
};

const getMyReview = async (userId, placeId) => {
  const place = await placeRepo.findById(placeId);
  if (!place || place.status !== 'ACTIVE') { throw Errors.placeNotFound(placeId); }
  return reviewRepo.findByPlaceAndUser(placeId, userId);
};

const createReview = async (userId, placeId, body) => {
  const place = await placeRepo.findById(placeId);
  if (!place || place.status !== 'ACTIVE') { throw Errors.placeNotFound(placeId); }

  if (!await Journey.exists({ userId, trekkingPlaceId: placeId, status: 'COMPLETED' })) {
    throw new ForbiddenError('Bạn cần hoàn thành hành trình tại địa điểm này trước khi đánh giá', 'REVIEW_NOT_ELIGIBLE');
  }
  if (await reviewRepo.findByPlaceAndUser(placeId, userId)) {
    throw new ConflictError('Bạn đã đánh giá địa điểm này', 'REVIEW_ALREADY_EXISTS');
  }
  let review;
  try {
    review = await reviewRepo.create({
      trekkingPlaceId: placeId, userId,
      point: body.point, isAnonymous: body.isAnonymous ?? false,
      content: body.content, imagesUrl: body.imagesUrl || [], videoUrl: body.videoUrl || [],
    });
  } catch (err) {
    if (err.code === 11000) {throw new ConflictError('Bạn đã đánh giá địa điểm này', 'REVIEW_ALREADY_EXISTS');}
    throw err;
  }

  // Recalculate rating an toàn
  await placeRepo.recalculateRating(placeId);

  return review;
};

const updateReview = async (userId, placeId, reviewId, body) => {
  const place = await placeRepo.findById(placeId);
  if (!place) { throw Errors.placeNotFound(placeId); }

  const review = await reviewRepo.findByIdAndUser(reviewId, userId);
  if (!review) { throw Errors.reviewNotFound(reviewId); }
  if (String(review.trekkingPlaceId) !== String(placeId)) {
    throw Errors.reviewNotFound(reviewId);
  }

  const updated = await reviewRepo.updateOnce(reviewId, userId, placeId, {
    point: body.point,
    isAnonymous: body.isAnonymous,
    content: body.content,
    imagesUrl: body.imagesUrl,
    videoUrl: body.videoUrl,
  });

  if (!updated) {throw new ConflictError('Đánh giá chỉ được chỉnh sửa một lần hoặc đã bị gỡ', 'REVIEW_EDIT_LIMIT');}
  await placeRepo.recalculateRating(placeId);
  return updated;
};

const deleteReview = async (userId, placeId, reviewId) => {
  const place = await placeRepo.findById(placeId);
  if (!place) { throw Errors.placeNotFound(placeId); }

  const review = await reviewRepo.findByIdAndUser(reviewId, userId);
  if (!review) { throw Errors.reviewNotFound(reviewId); }
  if (String(review.trekkingPlaceId) !== String(placeId)) {
    throw Errors.reviewNotFound(reviewId);
  }

  await reviewRepo.softDeleteById(reviewId);
  await placeRepo.recalculateRating(placeId);
};

const getReviewEligibility = async (userId, placeId) => {
  const place = await placeRepo.findById(placeId);
  if (!place || place.status !== 'ACTIVE') {throw Errors.placeNotFound(placeId);}
  const [review, completed] = await Promise.all([
    reviewRepo.findByPlaceAndUser(placeId, userId),
    Journey.exists({ userId, trekkingPlaceId: placeId, status: 'COMPLETED' }),
  ]);
  return { review, canCreate: !!completed && !review,
    canEdit: !!review && !review.deleted && (review.editCount || 0) < 1 };
};

const adminGetReviews = async (placeId, query) => {
  if (!await placeRepo.findById(placeId)) {throw Errors.placeNotFound(placeId);}
  return reviewRepo.findByPlace(placeId, {
    page: Math.max(1, parseInt(query.page) || 1),
    limit: Math.max(1, Math.min(parseInt(query.limit) || 20, 100)),
  });
};

const adminListReviews = async (query) => {
  const mongoose = require('mongoose');
  const TrekkingPlace = require('../models/TrekkingPlace');
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.max(1, Math.min(parseInt(query.limit) || 20, 100));
  const filter = {};
  if (query.status && !['ACTIVE', 'DELETED', 'ALL'].includes(query.status)) {
    throw new AppError('Trạng thái đánh giá không hợp lệ', 400, 'VALIDATION_ERROR');
  }
  if (query.status !== 'ALL') {filter.deleted = query.status === 'DELETED';}
  if (query.placeId) {
    if (!mongoose.isValidObjectId(query.placeId)) {throw new AppError('Địa điểm không hợp lệ', 400, 'VALIDATION_ERROR');}
    filter.trekkingPlaceId = query.placeId;
  }
  if (query.point) {
    const point = Number(query.point);
    if (!Number.isInteger(point) || point < 1 || point > 5) {throw new AppError('Số sao không hợp lệ', 400, 'VALIDATION_ERROR');}
    filter.point = point;
  }
  if (query.search?.trim()) {
    const escaped = query.search.trim().slice(0, 200).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const places = await TrekkingPlace.find({ name: { $regex: escaped, $options: 'i' } }).select('_id').lean();
    filter.$or = [{ content: { $regex: escaped, $options: 'i' } }, { userId: { $regex: escaped, $options: 'i' } },
      { trekkingPlaceId: { $in: places.map((p) => p._id) } }];
  }
  const [items, total] = await Promise.all([
    DetailEvaluate.find(filter).populate('trekkingPlaceId', 'name provinceId')
      .sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit),
    DetailEvaluate.countDocuments(filter),
  ]);
  return { items: items.map((doc) => {
    const item = doc.toJSON();
    const place = doc.trekkingPlaceId;
    return { ...item, trekkingPlaceId: String(place?._id || doc.populated('trekkingPlaceId')), placeName: place?.name || 'Địa điểm đã xóa' };
  }), total, page, limit, totalPages: Math.ceil(total / limit) };
};

const adminDeleteReview = async (adminId, placeId, reviewId) => {
  const review = await DetailEvaluate.findOneAndUpdate(
    { _id: reviewId, trekkingPlaceId: placeId, deleted: false },
    { $set: { deleted: true, removedBy: adminId } }, { new: true }
  );
  if (!review) {throw Errors.reviewNotFound(reviewId);}
  await placeRepo.recalculateRating(placeId);
};

module.exports = { getReviews, getMyReview, createReview, updateReview, deleteReview, getReviewEligibility, adminGetReviews, adminListReviews, adminDeleteReview };
