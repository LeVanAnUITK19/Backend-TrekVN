const ProvinceVisit = require('../models/ProvinceVisit');

// ─── Read ─────────────────────────────────────────────────────────────────────

const findByUserAndProvince = (userId, provinceId) =>
  ProvinceVisit.findOne({ userId, provinceId });

const findAllByUser = (userId) =>
  ProvinceVisit.find({ userId }).sort({ lastVisitedAt: -1 });

const countVisitedByUser = (userId) =>
  ProvinceVisit.countDocuments({ userId });

const countVerifiedByUser = (userId) =>
  ProvinceVisit.countDocuments({ userId, verificationStatus: 'VERIFIED' });

// ─── Manual mark (self-reported) ──────────────────────────────────────────────

/**
 * User tự tick tỉnh → tạo hoặc update manualMarked=true.
 * Nếu record đã VERIFIED thì không downgrade.
 */
const markManual = async (userId, provinceId) => {
  const existing = await ProvinceVisit.findOne({ userId, provinceId });

  if (!existing) {
    return ProvinceVisit.create({
      userId,
      provinceId,
      manualMarked: true,
      verificationStatus: 'SELF_REPORTED',
    });
  }

  // Luôn set manualMarked=true, không thay đổi VERIFIED status
  existing.manualMarked = true;
  await existing.save();
  return existing;
};

/**
 * User bỏ tick tỉnh:
 * - Nếu chưa VERIFIED → xóa record
 * - Nếu đã VERIFIED → chỉ set manualMarked=false, giữ nguyên record
 */
const unmarkManual = async (userId, provinceId) => {
  const existing = await ProvinceVisit.findOne({ userId, provinceId });
  if (!existing) { return null; }

  if (existing.verificationStatus === 'VERIFIED') {
    existing.manualMarked = false;
    await existing.save();
    return existing;
  }

  // Chưa verified → xóa
  await ProvinceVisit.deleteOne({ _id: existing._id });
  return null;
};

// ─── Verify (from check-in) ───────────────────────────────────────────────────

/**
 * Upsert ProvinceVisit khi có verified check-in.
 * Không tăng visitCount nhiều lần cho cùng một Journey.
 *
 * @param {string} userId
 * @param {ObjectId} provinceId
 * @param {object} opts - { checkedAt, journeyId, checkinId, alreadyCounted }
 */
const upsertVerified = async (userId, provinceId, { checkedAt, journeyId, checkinId, alreadyCounted }) => {
  const existing = await ProvinceVisit.findOne({ userId, provinceId });

  if (!existing) {
    return ProvinceVisit.create({
      userId,
      provinceId,
      manualMarked: false,
      verificationStatus: 'VERIFIED',
      firstVisitedAt: checkedAt,
      lastVisitedAt: checkedAt,
      firstJourneyId: journeyId,
      lastJourneyId: journeyId,
      verifiedAt: checkedAt,
      verifiedJourneyId: journeyId,
      verifiedCheckinId: checkinId,
      visitCount: alreadyCounted ? 0 : 1,
    });
  }

  // Luôn upgrade lên VERIFIED nếu chưa
  if (existing.verificationStatus !== 'VERIFIED') {
    existing.verificationStatus = 'VERIFIED';
    existing.verifiedAt = checkedAt;
    existing.verifiedJourneyId = journeyId;
    existing.verifiedCheckinId = checkinId;
  }

  existing.lastVisitedAt = checkedAt;
  existing.lastJourneyId = journeyId;

  if (!existing.firstVisitedAt) {
    existing.firstVisitedAt = checkedAt;
    existing.firstJourneyId = journeyId;
  }

  // Tăng visitCount chỉ khi đây là lần đầu journey này tính visit cho tỉnh này
  if (!alreadyCounted) {
    existing.visitCount += 1;
  }

  await existing.save();
  return existing;
};

module.exports = {
  findByUserAndProvince,
  findAllByUser,
  countVisitedByUser,
  countVerifiedByUser,
  markManual,
  unmarkManual,
  upsertVerified,
};
