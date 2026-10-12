const UserRankProfile = require('../models/UserRankProfile');

// ─── Tìm profile theo userId (không populate) ────────────────────────────────
const findByUserId = (userId) => UserRankProfile.findOne({ userId });

// ─── Tìm profile theo userId, populate rank hiện tại ─────────────────────────
const findByUserIdWithRank = (userId) =>
  UserRankProfile.findOne({ userId }).populate('currentRankId');

// ─── Tạo profile mới cho user (khi đăng ký xong) ─────────────────────────────
const create = (userId, currentRankId) =>
  UserRankProfile.create({ userId, currentRankId });

// ─── Cập nhật toàn bộ profile (dùng khi recalculate) ─────────────────────────
const updateByUserId = (userId, data) =>
  UserRankProfile.findOneAndUpdate({ userId }, data, {
    new: true,
    runValidators: true,
  });

// ─── Tăng một hoặc nhiều counter lên (dùng $inc để atomic) ───────────────────
// delta: object dạng { totalXp: 150, completedJourneyCount: 1 }
const incrementStats = (userId, delta) =>
  UserRankProfile.findOneAndUpdate(
    { userId },
    { $inc: delta, $set: { lastCalculatedAt: new Date() } },
    { new: true, runValidators: true }
  );

const ensureForUser = async (userId) => {
  const profile = await findByUserIdWithRank(userId);
  if (profile) {return profile;}
  const rank = await require('../models/RankDefinition').findOne({ code: 'NEWBIE', status: 'ACTIVE' });
  if (!rank) {throw new Error('NEWBIE rank missing; run seed:ranks');}
  await UserRankProfile.findOneAndUpdate({ userId }, { $setOnInsert: { userId, currentRankId: rank._id } }, { upsert: true, new: true });
  return findByUserIdWithRank(userId);
};
module.exports = {
  ensureForUser,
  findByUserId,
  findByUserIdWithRank,
  create,
  updateByUserId,
  incrementStats,
};
