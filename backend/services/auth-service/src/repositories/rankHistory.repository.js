const RankHistory = require('../models/RankHistory');

// ─── Tạo bản ghi lịch sử rank mới ────────────────────────────────────────────
const create = (data) => RankHistory.create(data);

// ─── Lấy lịch sử rank của user, populate tên rank ────────────────────────────
const findByUserIdWithRanks = (userId) =>
  RankHistory.find({ userId })
    .sort({ changedAt: -1 })
    .populate('previousRankId', 'code name level iconUrl')
    .populate('newRankId', 'code name level iconUrl');

// ─── Lấy entry gần nhất (rank hiện tại) ──────────────────────────────────────
const findLatestByUserId = (userId) =>
  RankHistory.findOne({ userId })
    .sort({ changedAt: -1 })
    .populate('newRankId', 'code name level iconUrl');

module.exports = {
  create,
  findByUserIdWithRanks,
  findLatestByUserId,
};
