const MilestoneCheckin = require('../models/MilestoneCheckin');

// ─── Create ───────────────────────────────────────────────────────────────────

const create = (data) => MilestoneCheckin.create(data);

// ─── Duplicate checks ─────────────────────────────────────────────────────────

/**
 * Kiểm tra duplicate theo journeyId + milestoneId + userId.
 */
const findByJourneyMilestoneUser = (journeyId, milestoneId, userId) =>
  MilestoneCheckin.findOne({ journeyId, milestoneId, userId });

/**
 * Kiểm tra idempotency theo clientCheckinId + userId.
 */
const findByClientCheckinId = (clientCheckinId, userId) =>
  MilestoneCheckin.findOne({ clientCheckinId, userId });

// ─── Read ─────────────────────────────────────────────────────────────────────

const findById = (id) => MilestoneCheckin.findById(id);

/**
 * Lịch sử check-in của user với filter tùy chọn.
 * @param {string} userId
 * @param {object} opts - { page, limit, journeyId, trekkingPlaceId, trekkingRouteId, status }
 */
const findByUser = async (userId, opts = {}) => {
  const { page = 1, limit = 20, journeyId, trekkingPlaceId, trekkingRouteId, status } = opts;

  const filter = { userId };
  if (journeyId) { filter.journeyId = journeyId; }
  if (trekkingPlaceId) { filter.trekkingPlaceId = trekkingPlaceId; }
  if (trekkingRouteId) { filter.trekkingRouteId = trekkingRouteId; }
  if (status) { filter['verification.status'] = status; }

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    MilestoneCheckin.find(filter).sort({ checkedAt: -1 }).skip(skip).limit(limit),
    MilestoneCheckin.countDocuments(filter),
  ]);

  return { items, total, page, limit };
};

/**
 * Check-in gần đây nhất của user.
 */
const findRecentByUser = (userId, limit = 10) =>
  MilestoneCheckin.find({ userId, 'verification.status': 'VERIFIED' })
    .sort({ checkedAt: -1 })
    .limit(limit);

/**
 * Danh sách check-in trong một Journey của user.
 */
const findByJourneyAndUser = (journeyId, userId) =>
  MilestoneCheckin.find({ journeyId, userId }).sort({ checkedAt: 1 });

/**
 * Đếm tổng số verified check-in của user.
 */
const countVerifiedByUser = (userId) =>
  MilestoneCheckin.countDocuments({ userId, 'verification.status': 'VERIFIED' });

/**
 * Kiểm tra trong Journey này, user đã có VERIFIED qualifying check-in cho placeId chưa.
 * Dùng để tránh tăng visitCount nhiều lần cho cùng journey.
 */
const findQualifyingCheckinInJourney = (userId, journeyId, trekkingPlaceId) =>
  MilestoneCheckin.findOne({
    userId,
    journeyId,
    trekkingPlaceId,
    qualifiesPlaceVisit: true,
    'verification.status': 'VERIFIED',
  });

module.exports = {
  create,
  findByJourneyMilestoneUser,
  findByClientCheckinId,
  findById,
  findByUser,
  findRecentByUser,
  findByJourneyAndUser,
  countVerifiedByUser,
  findQualifyingCheckinInJourney,
};
