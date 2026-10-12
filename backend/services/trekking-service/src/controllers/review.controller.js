'use strict';

const reviewService = require('../services/review.service');

const getReviews = async (req, res, next) => {
  try {
    const result = await reviewService.getReviews(req.params.placeId, req.query);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const getMyReview = async (req, res, next) => {
  try {
    const review = await reviewService.getMyReview(req.user.userId, req.params.placeId);
    res.json({ success: true, data: review || null });
  } catch (err) { next(err); }
};

const createReview = async (req, res, next) => {
  try {
    const review = await reviewService.createReview(
      req.user.userId,
      req.params.placeId,
      req.body
    );
    res.status(201).json({ success: true, data: review });
  } catch (err) { next(err); }
};

const updateReview = async (req, res, next) => {
  try {
    const review = await reviewService.updateReview(
      req.user.userId,
      req.params.placeId,
      req.params.reviewId,
      req.body
    );
    res.json({ success: true, data: review });
  } catch (err) { next(err); }
};

const deleteReview = async (req, res, next) => {
  try {
    await reviewService.deleteReview(req.user.userId, req.params.placeId, req.params.reviewId);
    res.status(204).end();
  } catch (err) { next(err); }
};

const getReviewEligibility = async (req, res, next) => {
  try {
    res.json({ success: true, data: await reviewService.getReviewEligibility(req.user.userId, req.params.placeId) });
  } catch (err) { next(err); }
};
const adminGetReviews = async (req, res, next) => {
  try {
    res.json({ success: true, data: await reviewService.adminGetReviews(req.params.id, req.query) });
  } catch (err) { next(err); }
};
const adminDeleteReview = async (req, res, next) => {
  try {
    await reviewService.adminDeleteReview(req.user.userId, req.params.id, req.params.reviewId);
    res.status(204).end();
  } catch (err) { next(err); }
};
module.exports = { getReviews, getMyReview, createReview, updateReview, deleteReview, getReviewEligibility, adminGetReviews, adminDeleteReview };
