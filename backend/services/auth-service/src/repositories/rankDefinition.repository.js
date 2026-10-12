const RankDefinition = require('../models/RankDefinition');

// ─── Lấy tất cả rank đang active, sắp xếp theo level tăng dần ────────────────
const findAllActive = () =>
  RankDefinition.find({ status: 'ACTIVE' }).sort({ level: 1 });

// ─── Lấy tất cả rank (kể cả INACTIVE), dùng cho admin ────────────────────────
const findAll = () => RankDefinition.find().sort({ level: 1 });

// ─── Tìm rank theo code (ví dụ: 'MOUNTAINEER') ───────────────────────────────
const findByCode = (code) =>
  RankDefinition.findOne({ code: code.toUpperCase() });

// ─── Tìm rank theo _id ────────────────────────────────────────────────────────
const findById = (id) => RankDefinition.findById(id);

// ─── Tìm rank cao nhất mà user đủ điều kiện dựa vào stats ────────────────────
// Logic: lấy tất cả rank active, lọc những rank user đáp ứng đủ điều kiện,
// rồi lấy rank có level cao nhất.
const findEligibleRank = async (stats) => {
  const ranks = await findAllActive();

  let eligible = ranks[0]; // mặc định NEWBIE (level 1)

  for (const rank of ranks) {
    const meetsXp = stats.totalXp >= rank.minXp;
    const meetsJourneys = stats.completedJourneyCount >= rank.minCompletedJourneys;
    const meetsProvinces = stats.visitedProvinceCount >= rank.minVisitedProvinces;
    const meetsBadges = stats.badgeCount >= rank.minBadgeCount;
    const meetsDistance = stats.totalDistanceMeters >= rank.minDistanceMeters;
    const meetsContributions =
      stats.approvedContributionCount >= rank.minApprovedContributions;

    if (
      meetsXp &&
      meetsJourneys &&
      meetsProvinces &&
      meetsBadges &&
      meetsDistance &&
      meetsContributions
    ) {
      eligible = rank;
    }
  }

  return eligible;
};

// ─── Tìm rank tiếp theo (level = currentLevel + 1) ───────────────────────────
const findNextRank = (currentLevel) =>
  RankDefinition.findOne({ level: { $gt: currentLevel }, status: 'ACTIVE' }).sort({ level: 1 });

module.exports = {
  findAllActive,
  findAll,
  findByCode,
  findById,
  findEligibleRank,
  findNextRank,
};
