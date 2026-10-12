const checkinService = require('../services/checkin.service');

// ─── Online Check-in ──────────────────────────────────────────────────────────

/**
 * POST /api/v1/checkins
 * Used by: online GPS milestone check-in.
 * Automatically verifies ProvinceVisit and creates/updates PlaceVisit when qualifying.
 */
const create = async (req, res, next) => {
  try {
    const checkin = await checkinService.createCheckin(req.user.userId, req.body);
    res.status(201).json({ success: true, message: 'Check-in thành công', data: checkin });
  } catch (err) {
    next(err);
  }
};

// ─── Offline Sync ─────────────────────────────────────────────────────────────

/**
 * POST /api/v1/checkins/sync
 * Used by: SQLite offline check-in synchronization.
 * Idempotent — retry cùng clientCheckinId không tạo duplicate.
 */
const sync = async (req, res, next) => {
  try {
    const results = await checkinService.syncCheckins(req.user.userId, req.body.items);
    res.status(200).json({ success: true, data: { results } });
  } catch (err) {
    next(err);
  }
};

// ─── Read ─────────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/checkins/me
 * Lịch sử check-in có filter + pagination.
 */
const getMyCheckins = async (req, res, next) => {
  try {
    const result = await checkinService.getMyCheckins(req.user.userId, req.query);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/v1/checkins/:checkinId
 * Chi tiết một check-in — chỉ chủ sở hữu.
 */
const getById = async (req, res, next) => {
  try {
    const checkin = await checkinService.getCheckinById(req.params.checkinId, req.user.userId);
    res.json({ success: true, data: checkin });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/v1/journeys/:journeyId/checkins
 * Used by: Journey milestone progress UI.
 */
const getJourneyCheckins = async (req, res, next) => {
  try {
    const items = await checkinService.getJourneyCheckins(
      req.params.journeyId,
      req.user.userId
    );
    res.json({ success: true, data: items });
  } catch (err) {
    next(err);
  }
};

module.exports = { create, sync, getMyCheckins, getById, getJourneyCheckins };
