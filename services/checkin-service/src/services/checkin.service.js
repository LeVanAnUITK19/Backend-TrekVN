const checkinRepo = require('../repositories/milestoneCheckin.repository');
const placeVisitRepo = require('../repositories/placeVisit.repository');
const provinceVisitRepo = require('../repositories/provinceVisit.repository');
const { getTrekkingProviderInstance } = require('../providers/trekking');
const { haversineMeters } = require('../utils/haversine');
const {
  BadRequestError,
  BusinessError,
  ConflictError,
  NotFoundError,
  ForbiddenError,
} = require('../utils/errors');

// ─── Config ───────────────────────────────────────────────────────────────────

const getMaxAccuracy = () =>
  parseInt(process.env.CHECKIN_MAX_GPS_ACCURACY_METERS) || 50;

// ─── Core check-in logic ──────────────────────────────────────────────────────

/**
 * Xử lý một check-in (dùng chung cho online và offline sync).
 * Cả POST /checkins và POST /checkins/sync đều reuse hàm này.
 *
 * @param {string} userId
 * @param {object} body - { journeyId, milestoneId, latitude, longitude, accuracyMeters, checkedAt, [clientCheckinId] }
 * @param {string} syncSource - 'ONLINE' | 'OFFLINE_SYNC'
 * @returns {MilestoneCheckin}
 */
const processCheckin = async (userId, body, syncSource = 'ONLINE') => {
  const { journeyId, milestoneId, clientCheckinId, latitude, longitude, accuracyMeters, checkedAt } = body;

  // 1. Validate GPS accuracy trước để fail fast
  const maxAccuracy = getMaxAccuracy();
  if (accuracyMeters > maxAccuracy) {
    throw new BusinessError(
      `Độ chính xác GPS quá thấp (${accuracyMeters}m). Tối đa cho phép: ${maxAccuracy}m`,
      'GPS_ACCURACY_TOO_LOW',
      { provided: accuracyMeters, maximum: maxAccuracy }
    );
  }

  // 2. Idempotency check (offline sync) — trả về existing nếu đã xử lý
  if (clientCheckinId) {
    const existing = await checkinRepo.findByClientCheckinId(clientCheckinId, userId);
    if (existing) {
      return existing;
    }
  }

  // 3. Duplicate check (same journey + milestone + user)
  const duplicate = await checkinRepo.findByJourneyMilestoneUser(journeyId, milestoneId, userId);
  if (duplicate) {
    throw new ConflictError(
      'Bạn đã check-in milestone này trong hành trình này rồi',
      'CHECKIN_ALREADY_EXISTS',
      { checkinId: duplicate._id }
    );
  }

  // 4. Lấy metadata milestone từ TrekkingProvider (không tin client)
  const trekkingProvider = getTrekkingProviderInstance();
  const ctx = await trekkingProvider.getMilestoneCheckinContext(milestoneId);
  if (!ctx) {
    throw new NotFoundError(
      `Milestone "${milestoneId}" không tồn tại`,
      'MILESTONE_NOT_FOUND'
    );
  }

  // 5. Validate coordinates range
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    throw new BadRequestError('Tọa độ GPS không hợp lệ', 'VALIDATION_ERROR');
  }

  // 6. Tính khoảng cách Haversine
  const [milestoneLng, milestoneLat] = ctx.location.coordinates;
  const distanceMeters = haversineMeters(latitude, longitude, milestoneLat, milestoneLng);

  // 7. Kiểm tra bán kính check-in
  if (distanceMeters > ctx.checkinRadiusMeters) {
    throw new BusinessError(
      `Bạn đang ở ngoài bán kính check-in (${Math.round(distanceMeters)}m > ${ctx.checkinRadiusMeters}m)`,
      'CHECKIN_OUT_OF_RADIUS',
      {
        distanceMeters: Math.round(distanceMeters),
        radiusMeters: ctx.checkinRadiusMeters,
      }
    );
  }

  // 8. Lưu MilestoneCheckin (VERIFIED)
  const checkinData = {
    ...(clientCheckinId ? { clientCheckinId } : {}),
    journeyId,
    userId,
    trekkingPlaceId: ctx.trekkingPlaceId,
    trekkingRouteId: ctx.trekkingRouteId,
    provinceId: ctx.provinceId,
    milestoneId,
    milestoneType: ctx.type,
    qualifiesPlaceVisit: ctx.qualifiesPlaceVisit,
    location: {
      type: 'Point',
      coordinates: [longitude, latitude],
    },
    accuracyMeters,
    distanceToMilestoneMeters: Math.round(distanceMeters * 100) / 100,
    verification: {
      method: 'GPS',
      status: 'VERIFIED',
    },
    syncSource,
    checkedAt: new Date(checkedAt),
  };

  let checkin;
  try {
    checkin = await checkinRepo.create(checkinData);
  } catch (err) {
    // Race condition: duplicate key error → trả về existing
    if (err.code === 11000) {
      const existing = await checkinRepo.findByJourneyMilestoneUser(journeyId, milestoneId, userId);
      if (existing) { return existing; }
      const existingClient = clientCheckinId
        ? await checkinRepo.findByClientCheckinId(clientCheckinId, userId)
        : null;
      if (existingClient) { return existingClient; }
    }
    throw err;
  }

  // 9. Cập nhật PlaceVisit nếu qualifiesPlaceVisit=true
  if (ctx.qualifiesPlaceVisit) {
    await _updatePlaceVisit(userId, ctx, journeyId, checkin._id, new Date(checkedAt));
  }

  // 10. Cập nhật ProvinceVisit (VERIFIED)
  await _updateProvinceVisit(userId, ctx.provinceId, journeyId, checkin._id, new Date(checkedAt));

  return checkin;
};

// ─── Place Visit update ───────────────────────────────────────────────────────

/**
 * Cập nhật PlaceVisit.
 * Cùng một Journey tại cùng Place chỉ tăng visitCount 1 lần,
 * dù có bao nhiêu qualifying milestone.
 */
const _updatePlaceVisit = async (userId, ctx, journeyId, checkinId, visitedAt) => {
  const previousQualifying = await checkinRepo.findQualifyingCheckinInJourney(
    userId,
    journeyId,
    ctx.trekkingPlaceId
  );

  // alreadyCounted: trong journey này đã có qualifying check-in khác (không phải bản ghi vừa tạo)
  const alreadyCounted =
    previousQualifying && String(previousQualifying._id) !== String(checkinId);

  if (alreadyCounted) {
    // Chỉ cập nhật metadata, không tăng visitCount
    const existing = await placeVisitRepo.findByUserAndPlace(userId, ctx.trekkingPlaceId);
    if (existing) {
      existing.lastVisitedAt = visitedAt;
      existing.lastJourneyId = journeyId;
      existing.lastCheckinId = checkinId;
      await existing.save();
    }
    return;
  }

  await placeVisitRepo.upsertVisit(userId, ctx.trekkingPlaceId, {
    provinceId: ctx.provinceId,
    visitedAt,
    journeyId,
    checkinId,
  });
};

// ─── Province Visit update ────────────────────────────────────────────────────

/**
 * Cập nhật ProvinceVisit (VERIFIED).
 * Không tăng visitCount nhiều lần cho cùng một Journey.
 */
const _updateProvinceVisit = async (userId, provinceId, journeyId, checkinId, checkedAt) => {
  const existingVisit = await provinceVisitRepo.findByUserAndProvince(userId, provinceId);
  const alreadyCounted =
    existingVisit &&
    (existingVisit.verifiedJourneyId === journeyId ||
      existingVisit.lastJourneyId === journeyId);

  await provinceVisitRepo.upsertVerified(userId, provinceId, {
    checkedAt,
    journeyId,
    checkinId,
    alreadyCounted,
  });
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Online check-in.
 * Used by: POST /api/v1/checkins
 */
const createCheckin = (userId, body) => processCheckin(userId, body, 'ONLINE');

/**
 * Offline sync — xử lý batch, mỗi item độc lập.
 * Used by: POST /api/v1/checkins/sync
 */
const syncCheckins = async (userId, items) => {
  const results = [];

  for (const item of items) {
    try {
      const checkin = await processCheckin(userId, item, 'OFFLINE_SYNC');
      results.push({
        clientCheckinId: item.clientCheckinId,
        serverCheckinId: checkin._id,
        status: checkin.verification.status,
      });
    } catch (err) {
      results.push({
        clientCheckinId: item.clientCheckinId,
        status: 'FAILED',
        error: {
          code: err.code || 'INTERNAL_ERROR',
          message: err.message,
        },
      });
    }
  }

  return results;
};

/**
 * Lịch sử check-in của user (có filter + pagination).
 */
const getMyCheckins = (userId, query) =>
  checkinRepo.findByUser(userId, {
    page: parseInt(query.page) || 1,
    limit: Math.min(parseInt(query.limit) || 20, 100),
    journeyId: query.journeyId,
    trekkingPlaceId: query.placeId,
    trekkingRouteId: query.routeId,
    status: query.status,
  });

/**
 * Chi tiết một check-in — user chỉ được xem của mình.
 */
const getCheckinById = async (checkinId, userId) => {
  const checkin = await checkinRepo.findById(checkinId);
  if (!checkin) {
    throw new NotFoundError('Không tìm thấy check-in', 'CHECKIN_NOT_FOUND');
  }
  if (String(checkin.userId) !== String(userId)) {
    throw new ForbiddenError('Bạn không có quyền xem check-in này', 'FORBIDDEN');
  }
  return checkin;
};

/**
 * Check-in trong một Journey của user.
 * Used by: GET /api/v1/journeys/:journeyId/checkins
 */
const getJourneyCheckins = (journeyId, userId) =>
  checkinRepo.findByJourneyAndUser(journeyId, userId);

module.exports = {
  createCheckin,
  syncCheckins,
  getMyCheckins,
  getCheckinById,
  getJourneyCheckins,
};
