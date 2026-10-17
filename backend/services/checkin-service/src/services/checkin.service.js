const checkinRepo = require('../repositories/milestoneCheckin.repository');
const placeVisitRepo = require('../repositories/placeVisit.repository');
const provinceVisitRepo = require('../repositories/provinceVisit.repository');
const provinceRepo = require('../repositories/province.repository');
const mongoose = require('mongoose');
const { getTrekkingProviderInstance } = require('../providers/trekking');
const { haversineMeters } = require('../utils/haversine');
const publisher = require('../events/publishers/checkin.publisher');
const { EVENT_TYPES } = require('../constants/events');
const {
  BadRequestError,
  BusinessError,
  ConflictError,
  NotFoundError,
  ForbiddenError,
  ServiceUnavailableError,
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
      return _finalizeCheckin(existing);
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
  const context = await trekkingProvider.getMilestoneCheckinContext(milestoneId);
  const ctx = context ? { ...context } : null;
  if (!ctx) {
    throw new NotFoundError(
      `Milestone "${milestoneId}" không tồn tại`,
      'MILESTONE_NOT_FOUND'
    );
  }

  // Trekking catalogs historically store province codes; check-in owns ObjectIds.
  if (!mongoose.isValidObjectId(ctx.provinceId)) {
    const aliases = { ho_chi_minh: 'tp_ho_chi_minh', hue: 'thua_thien_hue' };
    const province = await provinceRepo.findByCode(aliases[ctx.provinceId] || ctx.provinceId);
    if (!province) {throw new ServiceUnavailableError('Tỉnh của địa điểm chưa được liên kết với danh mục tỉnh.');}
    ctx.provinceId = String(province._id);
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
    altitudeMeters: ctx.altitudeMeters || 0,
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
      if (existingClient) { return _finalizeCheckin(existingClient); }
    }
    throw err;
  }

  return _finalizeCheckin(checkin);
};

// Resume side effects on sync replay after a partial write; XP consumers deduplicate by source.
const _finalizeCheckin = async (checkin) => {
  const { userId, journeyId, milestoneId } = checkin;
  const ctx = { ...checkin.toObject(), type: checkin.milestoneType };
  if (ctx.qualifiesPlaceVisit) {
    await _updatePlaceVisit(userId, ctx, journeyId, checkin._id, checkin.checkedAt);
  }
  await _updateProvinceVisit(userId, ctx.provinceId, journeyId, checkin._id, checkin.checkedAt);
  const publish = (type, payload) => publisher.publish(type, payload, type + ':' + checkin._id);
  await publish(EVENT_TYPES.CHECKIN_VERIFIED, {
    userId, checkinId: String(checkin._id), journeyId, milestoneId,
    milestoneType: ctx.type, trekkingRouteId: ctx.trekkingRouteId,
    trekkingPlaceId: ctx.trekkingPlaceId, provinceId: String(ctx.provinceId),
  });
  // Award once per user/province or user/place, even when a previous event was lost.
  await publish(EVENT_TYPES.PROVINCE_FIRST_VISITED, {
    userId, provinceId: String(ctx.provinceId), checkinId: String(checkin._id), journeyId,
  });
  if (ctx.qualifiesPlaceVisit) {await publish(EVENT_TYPES.PLACE_FIRST_VISITED, {
    userId, trekkingPlaceId: ctx.trekkingPlaceId, checkinId: String(checkin._id), journeyId,
  });}
  return checkin;
};

// ─── Place Visit update ───────────────────────────────────────────────────────

/**
 * Cập nhật PlaceVisit.
 * Cùng một Journey tại cùng Place chỉ tăng visitCount 1 lần.
 * @returns {boolean} true nếu là lần đầu tiên visit place này
 */
const _updatePlaceVisit = async (userId, ctx, journeyId, checkinId, visitedAt) => {
  const previousQualifying = await checkinRepo.findQualifyingCheckinInJourney(
    userId,
    journeyId,
    ctx.trekkingPlaceId
  );

  // alreadyCounted: trong journey này đã có qualifying check-in khác
  const alreadyCounted =
    previousQualifying && String(previousQualifying._id) !== String(checkinId);

  const existingVisit = await placeVisitRepo.findByUserAndPlace(userId, ctx.trekkingPlaceId);
  const isFirstVisit = !existingVisit;
  if (existingVisit && String(existingVisit.lastCheckinId) === String(checkinId)) {return false;}

  if (alreadyCounted) {
    // Chỉ cập nhật metadata, không tăng visitCount
    if (existingVisit) {
      existingVisit.lastVisitedAt = visitedAt;
      existingVisit.lastJourneyId = journeyId;
      existingVisit.lastCheckinId = checkinId;
      await existingVisit.save();
    }
    return false; // không phải first visit mới
  }

  await placeVisitRepo.upsertVisit(userId, ctx.trekkingPlaceId, {
    provinceId: ctx.provinceId,
    visitedAt,
    journeyId,
    checkinId,
  });

  return isFirstVisit;
};

// ─── Province Visit update ────────────────────────────────────────────────────

/**
 * Cập nhật ProvinceVisit (VERIFIED).
 * @returns {boolean} true nếu là lần đầu tiên VERIFIED province này
 */
const _updateProvinceVisit = async (userId, provinceId, journeyId, checkinId, checkedAt) => {
  const existingVisit = await provinceVisitRepo.findByUserAndProvince(userId, provinceId);
  const isFirstVerifiedVisit = !existingVisit || existingVisit.verificationStatus !== 'VERIFIED';

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

  return isFirstVerifiedVisit;
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
