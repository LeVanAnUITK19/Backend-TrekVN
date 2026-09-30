const visitService = require('../services/visit.service');

// ─── Province Visits ──────────────────────────────────────────────────────────

/**
 * GET /api/v1/visits/provinces/me
 * Danh sách tỉnh user đã đánh dấu hoặc verified.
 */
const getMyProvinceVisits = async (req, res, next) => {
  try {
    const visits = await visitService.getMyProvinceVisits(req.user.userId);
    res.json({ success: true, data: visits });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/v1/visits/provinces/me/:provinceId
 * Chi tiết trạng thái một tỉnh của user.
 */
const getProvinceVisitDetail = async (req, res, next) => {
  try {
    const result = await visitService.getProvinceVisitDetail(
      req.user.userId,
      req.params.provinceId
    );
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/v1/visits/provinces/me/:provinceId
 * Body: { visited: true|false }
 * Tick/bỏ tick tỉnh thủ công.
 */
const setProvinceManualMark = async (req, res, next) => {
  try {
    const visit = await visitService.setProvinceManualMark(
      req.user.userId,
      req.params.provinceId,
      req.body.visited
    );
    res.json({
      success: true,
      message: req.body.visited ? 'Đã đánh dấu tỉnh' : 'Đã bỏ đánh dấu tỉnh',
      data: visit,
    });
  } catch (err) {
    next(err);
  }
};

// ─── Place Visits ─────────────────────────────────────────────────────────────

/**
 * GET /api/v1/visits/places/me
 * Danh sách địa điểm đã đến (pagination).
 */
const getMyPlaceVisits = async (req, res, next) => {
  try {
    const result = await visitService.getMyPlaceVisits(req.user.userId, req.query);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/v1/visits/places/me/recent
 * Địa điểm đến gần đây (dùng cho Home screen).
 */
const getRecentPlaceVisits = async (req, res, next) => {
  try {
    const items = await visitService.getRecentPlaceVisits(req.user.userId, req.query);
    res.json({ success: true, data: items });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/v1/visits/places/me/:placeId
 * Chi tiết visit status của một địa điểm.
 */
const getPlaceVisitDetail = async (req, res, next) => {
  try {
    const visit = await visitService.getPlaceVisitDetail(
      req.user.userId,
      req.params.placeId
    );
    res.json({ success: true, data: visit || null });
  } catch (err) {
    next(err);
  }
};

// ─── Summary ──────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/visits/me/summary
 */
const getMySummary = async (req, res, next) => {
  try {
    const summary = await visitService.getMySummary(req.user.userId);
    res.json({ success: true, data: summary });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getMyProvinceVisits,
  getProvinceVisitDetail,
  setProvinceManualMark,
  getMyPlaceVisits,
  getRecentPlaceVisits,
  getPlaceVisitDetail,
  getMySummary,
};
