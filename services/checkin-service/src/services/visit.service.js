const provinceVisitRepo = require('../repositories/provinceVisit.repository');
const placeVisitRepo = require('../repositories/placeVisit.repository');
const checkinRepo = require('../repositories/milestoneCheckin.repository');
const provinceRepo = require('../repositories/province.repository');
const { NotFoundError } = require('../utils/errors');

// ─── Province Visits ──────────────────────────────────────────────────────────

/**
 * Trả về TOÀN BỘ tỉnh trong collection provinces, merged với ProvinceVisit của user.
 *
 * Dùng cho:
 * - Home Vietnam map (tô màu 34 tỉnh theo visitStatus)
 * - Counter "10 / 34 tỉnh"
 * - Province selector bottom sheet
 *
 * Chỉ 2 queries:
 *   1. provinces (tất cả)
 *   2. province_visits của user hiện tại
 * Merge trong memory.
 *
 * visitStatus:
 *   UNVISITED        → không có ProvinceVisit
 *   SELF_REPORTED    → ProvinceVisit.verificationStatus = SELF_REPORTED
 *   VERIFIED         → ProvinceVisit.verificationStatus = VERIFIED
 */
const getMyProvinceVisits = async (userId) => {
  // 2 queries song song
  const [provinces, userVisits] = await Promise.all([
    provinceRepo.findAll(),
    provinceVisitRepo.findAllByUser(userId),
  ]);

  // Build lookup map: provinceId (string) → ProvinceVisit
  const visitMap = new Map();
  for (const v of userVisits) {
    visitMap.set(String(v.provinceId), v);
  }

  // Merge
  const mergedProvinces = provinces.map((p) => {
    const visit = visitMap.get(String(p._id));
    const pJson = p.toJSON();

    if (!visit) {
      return {
        ...pJson,
        visitStatus: 'UNVISITED',
        manualMarked: false,
        visitCount: 0,
        firstVisitedAt: null,
        lastVisitedAt: null,
      };
    }

    return {
      ...pJson,
      visitStatus: visit.verificationStatus, // 'SELF_REPORTED' | 'VERIFIED'
      manualMarked: visit.manualMarked,
      visitCount: visit.visitCount,
      firstVisitedAt: visit.firstVisitedAt,
      lastVisitedAt: visit.lastVisitedAt,
    };
  });

  // Summary counts — tính từ mergedProvinces để đảm bảo nhất quán
  const totalProvinces = mergedProvinces.length;
  const verifiedCount = mergedProvinces.filter((p) => p.visitStatus === 'VERIFIED').length;
  const selfReportedCount = mergedProvinces.filter((p) => p.visitStatus === 'SELF_REPORTED').length;
  const visitedCount = verifiedCount + selfReportedCount;

  return {
    summary: {
      totalProvinces,
      visitedCount,
      verifiedCount,
      selfReportedCount,
    },
    provinces: mergedProvinces,
  };
};

/**
 * Chi tiết một province visit.
 */
const getProvinceVisitDetail = async (userId, provinceId) => {
  const province = await provinceRepo.findById(provinceId);
  if (!province) {
    throw new NotFoundError('Không tìm thấy tỉnh', 'PROVINCE_NOT_FOUND');
  }

  const visit = await provinceVisitRepo.findByUserAndProvince(userId, province._id);
  return {
    province,
    visit: visit || null,
  };
};

/**
 * User tick tỉnh thủ công.
 * visited=true → markManual
 * visited=false → unmarkManual
 */
const setProvinceManualMark = async (userId, provinceId, visited) => {
  const province = await provinceRepo.findById(provinceId);
  if (!province) {
    throw new NotFoundError('Không tìm thấy tỉnh', 'PROVINCE_NOT_FOUND');
  }

  if (visited) {
    return provinceVisitRepo.markManual(userId, province._id);
  }
  return provinceVisitRepo.unmarkManual(userId, province._id);
};

// ─── Place Visits ─────────────────────────────────────────────────────────────

/**
 * Danh sách place visits của user (có pagination).
 */
const getMyPlaceVisits = (userId, query) =>
  placeVisitRepo.findByUser(userId, {
    page: parseInt(query.page) || 1,
    limit: Math.min(parseInt(query.limit) || 20, 100),
  });

/**
 * Place visits gần đây.
 * Used by: Home screen "Địa điểm đến gần đây".
 */
const getRecentPlaceVisits = (userId, query) => {
  const limit = Math.min(parseInt(query.limit) || 5, 20);
  return placeVisitRepo.findRecentByUser(userId, limit);
};

/**
 * Chi tiết place visit cho một địa điểm.
 */
const getPlaceVisitDetail = (userId, trekkingPlaceId) =>
  placeVisitRepo.findByUserAndPlace(userId, trekkingPlaceId);

// ─── Summary ──────────────────────────────────────────────────────────────────

/**
 * Tổng hợp số liệu của user.
 * visitedProvinceCount phải thống nhất với getMyProvinceVisits.summary.visitedCount.
 */
const getMySummary = async (userId) => {
  const [visitedProvinceCount, verifiedProvinceCount, visitedPlaceCount, checkinCount] =
    await Promise.all([
      provinceVisitRepo.countVisitedByUser(userId),
      provinceVisitRepo.countVerifiedByUser(userId),
      placeVisitRepo.countByUser(userId),
      checkinRepo.countVerifiedByUser(userId),
    ]);

  return {
    visitedProvinceCount,
    verifiedProvinceCount,
    visitedPlaceCount,
    checkinCount,
  };
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
