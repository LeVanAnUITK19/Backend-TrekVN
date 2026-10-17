const rankDefinitionRepo = require('../repositories/rankDefinition.repository');
const userRankProfileRepo = require('../repositories/userRankProfile.repository');
const xpTransactionRepo = require('../repositories/xpTransaction.repository');
const rankHistoryRepo = require('../repositories/rankHistory.repository');
const userRepository = require('../repositories/user.repository');
const { NotFoundError } = require('../utils/errors');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Format một RankDefinition document thành shape gọn cho response.
 */
const formatRank = (rank) => ({
  code: rank.code,
  name: rank.name,
  level: rank.level,
  iconUrl: rank.iconUrl ?? null,
});

/**
 * Format requirements của một rank.
 */
const formatRankRequirements = (rank) => ({
  minXp: rank.minXp,
  minCompletedJourneys: rank.minCompletedJourneys,
  minVisitedProvinces: rank.minVisitedProvinces,
  minBadgeCount: rank.minBadgeCount,
  minDistanceMeters: rank.minDistanceMeters,
  minApprovedContributions: rank.minApprovedContributions,
});

/**
 * Tính % tiến trình tổng thể dựa trên số requirement đã đạt.
 * Mỗi requirement có trọng số bằng nhau.
 */
const calcOverallProgress = (requirements) => {
  const entries = Object.values(requirements);
  if (entries.length === 0) {return 100;}
  // Với những requirement có giá trị required = 0, luôn coi là completed.
  // Tính phần trăm dựa trên tỉ lệ từng chỉ số (capped tại 100%).
  const totalPercent = entries.reduce((sum, r) => {
    if (r.required === 0) {return sum + 100;}
    const pct = Math.min((r.current / r.required) * 100, 100);
    return sum + pct;
  }, 0);
  return Math.round(totalPercent / entries.length);
};

// ─── 1. Lấy hồ sơ Rank hiện tại của chính mình ────────────────────────────────
// GET /api/v1/gamification/me

const getMyRankProfile = async (userId) => {
  const profile = await userRankProfileRepo.ensureForUser(userId);

  if (!profile) {
    throw new NotFoundError('Hồ sơ gamification chưa được khởi tạo cho user này');
  }

  const currentRank = profile.currentRankId; // đã populate
  const nextRank = await rankDefinitionRepo.findNextRank(currentRank.level);

  return {
    rank: formatRank(currentRank),
    totalXp: profile.totalXp,
    statistics: {
      completedJourneys: profile.completedJourneyCount,
      totalDistanceMeters: profile.totalDistanceMeters,
      totalElevationGain: profile.totalElevationGain,
      verifiedCheckins: profile.verifiedCheckinCount,
      visitedProvinces: profile.visitedProvinceCount,
      visitedPlaces: profile.visitedPlaceCount,
      badgeCount: profile.badgeCount,
      approvedContributions: profile.approvedContributionCount,
    },
    nextRank: nextRank
      ? {
          code: nextRank.code,
          name: nextRank.name,
          level: nextRank.level,
          minXp: nextRank.minXp,
        }
      : null,
    updatedAt: profile.updatedAt,
  };
};

// ─── 2. Lấy tiến trình lên rank tiếp theo ─────────────────────────────────────
// GET /api/v1/gamification/me/progress

const getMyRankProgress = async (userId) => {
  const profile = await userRankProfileRepo.ensureForUser(userId);

  if (!profile) {
    throw new NotFoundError('Hồ sơ gamification chưa được khởi tạo cho user này');
  }

  const currentRank = profile.currentRankId; // đã populate
  const nextRank = await rankDefinitionRepo.findNextRank(currentRank.level);

  if (!nextRank) {
    // Đã đạt rank tối đa
    return {
      currentRank: formatRank(currentRank),
      nextRank: null,
      requirements: {},
      overallProgressPercent: 100,
      message: 'Bạn đã đạt rank tối đa!',
    };
  }

  const requirements = {
    xp: {
      current: profile.totalXp,
      required: nextRank.minXp,
      completed: profile.totalXp >= nextRank.minXp,
    },
    completedJourneys: {
      current: profile.completedJourneyCount,
      required: nextRank.minCompletedJourneys,
      completed: profile.completedJourneyCount >= nextRank.minCompletedJourneys,
    },
    visitedProvinces: {
      current: profile.visitedProvinceCount,
      required: nextRank.minVisitedProvinces,
      completed: profile.visitedProvinceCount >= nextRank.minVisitedProvinces,
    },
    badges: {
      current: profile.badgeCount,
      required: nextRank.minBadgeCount,
      completed: profile.badgeCount >= nextRank.minBadgeCount,
    },
    distanceMeters: {
      current: profile.totalDistanceMeters,
      required: nextRank.minDistanceMeters,
      completed: profile.totalDistanceMeters >= nextRank.minDistanceMeters,
    },
    approvedContributions: {
      current: profile.approvedContributionCount,
      required: nextRank.minApprovedContributions,
      completed:
        profile.approvedContributionCount >= nextRank.minApprovedContributions,
    },
  };

  return {
    currentRank: formatRank(currentRank),
    nextRank: {
      code: nextRank.code,
      name: nextRank.name,
      level: nextRank.level,
    },
    requirements,
    overallProgressPercent: calcOverallProgress(requirements),
  };
};

// ─── 3. Danh sách toàn bộ Rank ─────────────────────────────────────────────────
// GET /api/v1/gamification/ranks

const getAllRanks = async () => {
  const ranks = await rankDefinitionRepo.findAllActive();

  return ranks.map((r) => ({
    code: r.code,
    name: r.name,
    level: r.level,
    description: r.description,
    minXp: r.minXp,
    iconUrl: r.iconUrl ?? null,
    requirements: {
      completedJourneys: r.minCompletedJourneys,
      visitedProvinces: r.minVisitedProvinces,
      badges: r.minBadgeCount,
      distanceMeters: r.minDistanceMeters,
      approvedContributions: r.minApprovedContributions,
    },
  }));
};

// ─── 4. Chi tiết một Rank ──────────────────────────────────────────────────────
// GET /api/v1/gamification/ranks/:rankCode

const getRankByCode = async (rankCode) => {
  const rank = await rankDefinitionRepo.findByCode(rankCode);

  if (!rank) {
    throw new NotFoundError(`Rank '${rankCode}' không tồn tại`);
  }

  return {
    code: rank.code,
    name: rank.name,
    level: rank.level,
    description: rank.description,
    iconUrl: rank.iconUrl ?? null,
    requirements: formatRankRequirements(rank),
  };
};

// ─── 5. Lịch sử XP (cursor-based pagination) ──────────────────────────────────
// GET /api/v1/gamification/me/xp-history

const getMyXpHistory = async (userId, { limit = 20, cursor = null } = {}) => {
  const safeLimit = Math.min(Math.max(parseInt(limit) || 20, 1), 100);

  const { data, nextCursor } = await xpTransactionRepo.findByUserIdPaginated(userId, {
    limit: safeLimit,
    cursor,
  });

  return {
    data: data.map((tx) => ({
      xpTransactionId: tx._id,
      transactionType: tx.transactionType,
      sourceType: tx.sourceType,
      sourceId: tx.sourceId,
      xpAmount: tx.xpAmount,
      description: tx.description,
      createdAt: tx.createdAt,
    })),
    pagination: { nextCursor },
  };
};

// ─── 6. Lịch sử Rank ───────────────────────────────────────────────────────────
// GET /api/v1/gamification/me/rank-history

const getMyRankHistory = async (userId) => {
  const history = await rankHistoryRepo.findByUserIdWithRanks(userId);

  return history.map((entry) => ({
    previousRank: entry.previousRankId
      ? { code: entry.previousRankId.code, name: entry.previousRankId.name }
      : null,
    newRank: {
      code: entry.newRankId.code,
      name: entry.newRankId.name,
    },
    xpAtChange: entry.xpAtChange,
    changeType: entry.changeType,
    changedAt: entry.changedAt,
  }));
};

// ─── 7. Gamification profile công khai của user khác ──────────────────────────
// GET /api/v1/gamification/users/:userId

const getUserPublicProfile = async (targetUserId) => {
  // Kiểm tra user tồn tại
  const user = await userRepository.findById(targetUserId);
  if (!user) {
    throw new NotFoundError('Người dùng không tồn tại');
  }

  const profile = await userRankProfileRepo.findByUserIdWithRank(targetUserId);
  if (!profile) {
    throw new NotFoundError('Hồ sơ gamification chưa được khởi tạo');
  }

  const currentRank = profile.currentRankId; // đã populate

  // Chỉ trả về thông tin public — không có XP history, rank requirements, admin data
  return {
    userId: targetUserId,
    rank: formatRank(currentRank),
    totalXp: profile.totalXp,
    statistics: {
      completedJourneys: profile.completedJourneyCount,
      distanceMeters: profile.totalDistanceMeters,
      visitedProvinces: profile.visitedProvinceCount,
      badgeCount: profile.badgeCount,
    },
  };
};

// ─── Internal: Khởi tạo profile khi user đăng ký xong ─────────────────────────
// Gọi từ auth.service.js trong verifyEmail()

const initRankProfile = async (userId) => {
  // Lấy rank NEWBIE theo code cụ thể — không dùng "first" vì thứ tự có thể thay đổi
  const newbieRank = await rankDefinitionRepo.findByCode('NEWBIE');
  if (!newbieRank) {
    console.error('[Gamification] NEWBIE rank definition not found — run seedRanks.js first');
    return null;
  }

  const existing = await userRankProfileRepo.findByUserId(userId);
  if (existing) { return existing; }

  const profile = await userRankProfileRepo.create(userId, newbieRank._id);

  // Ghi lịch sử rank đầu tiên
  await rankHistoryRepo.create({
    userId,
    previousRankId: null,
    newRankId: newbieRank._id,
    xpAtChange: 0,
    changeType: 'PROMOTION',
    changedAt: new Date(),
  });

  return profile;
};

module.exports = {
  getMyRankProfile,
  getMyRankProgress,
  getAllRanks,
  getRankByCode,
  getMyXpHistory,
  getMyRankHistory,
  getUserPublicProfile,
  initRankProfile,
};
