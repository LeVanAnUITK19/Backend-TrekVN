const PlaceVisit = require('../models/PlaceVisit');

// ─── Upsert / Update ──────────────────────────────────────────────────────────

/**
 * Tạo mới hoặc cập nhật PlaceVisit khi có verified check-in.
 * @param {string} userId
 * @param {string} trekkingPlaceId
 * @param {object} data - { provinceId, visitedAt, journeyId, checkinId }
 * @returns {{ doc: PlaceVisit, isNew: boolean }}
 */
const upsertVisit = async (userId, trekkingPlaceId, { provinceId, visitedAt, journeyId, checkinId }) => {
  const existing = await PlaceVisit.findOne({ userId, trekkingPlaceId });

  if (!existing) {
    const doc = await PlaceVisit.create({
      userId,
      trekkingPlaceId,
      provinceId,
      firstVisitedAt: visitedAt,
      lastVisitedAt: visitedAt,
      firstJourneyId: journeyId,
      lastJourneyId: journeyId,
      lastCheckinId: checkinId,
      visitCount: 1,
    });
    return { doc, isNew: true };
  }

  // Tăng visitCount và cập nhật thông tin lần ghé thăm cuối
  existing.visitCount += 1;
  existing.lastVisitedAt = visitedAt;
  existing.lastJourneyId = journeyId;
  existing.lastCheckinId = checkinId;
  await existing.save();
  return { doc: existing, isNew: false };
};

// ─── Read ─────────────────────────────────────────────────────────────────────

const findByUser = async (userId, opts = {}) => {
  const { page = 1, limit = 20 } = opts;
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    PlaceVisit.find({ userId }).sort({ lastVisitedAt: -1 }).skip(skip).limit(limit),
    PlaceVisit.countDocuments({ userId }),
  ]);
  return { items, total, page, limit };
};

const findRecentByUser = (userId, limit = 5) =>
  PlaceVisit.find({ userId }).sort({ lastVisitedAt: -1 }).limit(limit);

const findByUserAndPlace = (userId, trekkingPlaceId) =>
  PlaceVisit.findOne({ userId, trekkingPlaceId });

const countByUser = (userId) => PlaceVisit.countDocuments({ userId });

module.exports = {
  upsertVisit,
  findByUser,
  findRecentByUser,
  findByUserAndPlace,
  countByUser,
};
