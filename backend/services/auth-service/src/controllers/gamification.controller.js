const gamificationService = require('../services/gamification.service');

// ─── GET /api/v1/gamification/me ──────────────────────────────────────────────
// Hồ sơ rank hiện tại của user đang đăng nhập (dùng cho màn Profile).
const getMyRankProfile = async (req, res, next) => {
  try {
    const data = await gamificationService.getMyRankProfile(req.user.id);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/v1/gamification/me/progress ─────────────────────────────────────
// Tiến trình chi tiết để lên rank tiếp theo.
const getMyRankProgress = async (req, res, next) => {
  try {
    const data = await gamificationService.getMyRankProgress(req.user.id);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/v1/gamification/ranks ───────────────────────────────────────────
// Danh sách toàn bộ rank (public, không cần auth).
const getAllRanks = async (req, res, next) => {
  try {
    const data = await gamificationService.getAllRanks();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/v1/gamification/ranks/:rankCode ─────────────────────────────────
// Chi tiết một rank theo code (public).
const getRankByCode = async (req, res, next) => {
  try {
    const data = await gamificationService.getRankByCode(req.params.rankCode);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/v1/gamification/me/xp-history ───────────────────────────────────
// Lịch sử XP với cursor-based pagination.
// Query params: limit (default 20, max 100), cursor (ISO date string)
const getMyXpHistory = async (req, res, next) => {
  try {
    const { limit, cursor } = req.query;
    const result = await gamificationService.getMyXpHistory(req.user.id, {
      limit,
      cursor,
    });
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/v1/gamification/me/rank-history ─────────────────────────────────
// Lịch sử thay đổi rank.
const getMyRankHistory = async (req, res, next) => {
  try {
    const data = await gamificationService.getMyRankHistory(req.user.id);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/v1/gamification/users/:userId ───────────────────────────────────
// Gamification profile công khai của user khác.
const getUserPublicProfile = async (req, res, next) => {
  try {
    const data = await gamificationService.getUserPublicProfile(req.params.userId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getMyRankProfile,
  getMyRankProgress,
  getAllRanks,
  getRankByCode,
  getMyXpHistory,
  getMyRankHistory,
  getUserPublicProfile,
};
