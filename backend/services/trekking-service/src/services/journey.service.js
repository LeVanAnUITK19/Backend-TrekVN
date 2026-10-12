'use strict';

const journeyRepo = require('../repositories/journey.repository');
const placeRepo = require('../repositories/place.repository');
const routeRepo = require('../repositories/route.repository');
const { Errors, ConflictError } = require('../utils/errors');
const { JOURNEY_STATUS, canTransition } = require('../constants/journey');
const { checkIdempotency, completeIdempotency, failIdempotency } = require('../utils/idempotency');

/**
 * Kiểm tra transition hợp lệ, throw BusinessError nếu không.
 */
const assertTransition = (journey, targetStatus) => {
  if (!canTransition(journey.status, targetStatus)) {
    if (journey.status === JOURNEY_STATUS.COMPLETED) {
      throw Errors.journeyAlreadyCompleted();
    }
    throw Errors.journeyInvalidState(journey.status, targetStatus);
  }
};

// An existing journey retains its catalog even when a route is disabled.
// Keep reference IDs as strings; embedded metadata is additive to the API.
const formatUserJourney = (journey) => ({
  ...journey.toJSON({ depopulate: true }),
  trekkingPlaceId: String(journey.populated('trekkingPlaceId') || journey.trekkingPlaceId),
  trekkingRouteId: String(journey.populated('trekkingRouteId') || journey.trekkingRouteId),
  place: journey.trekkingPlaceId?.toJSON?.() ?? null,
  route: journey.trekkingRouteId?.toJSON?.() ?? null,
});

const getMyJourneys = async (userId, query) => {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(parseInt(query.limit) || 20, 100);
  const result = await journeyRepo.findByUser(userId, {
    status: query.status,
    page,
    limit,
    sort: query.sort || '-createdAt',
  });
  return { ...result, items: result.items.map(formatUserJourney) };
};

const getMyStatistics = (userId) => journeyRepo.getUserStatistics(userId);

const getJourneyById = async (userId, journeyId) => {
  const journey = await journeyRepo.findByIdAndUserWithCatalog(journeyId, userId);
  if (!journey) { throw Errors.journeyNotFound(journeyId); }
  return formatUserJourney(journey);
};

const createJourney = async (userId, body, idempotencyKey) => {
  // Idempotency check
  const { cached, record } = await checkIdempotency(idempotencyKey, 'CREATE_JOURNEY', userId);
  if (cached) { return record.responseData; }

  // Nếu có clientJourneyId, check duplicate trước
  if (body.clientJourneyId) {
    const existing = await journeyRepo.findByClientJourneyId(userId, body.clientJourneyId);
    if (existing) {
      await completeIdempotency(record, existing.toJSON());
      return existing;
    }
  }

  // Validate place và route tồn tại và ACTIVE
  const place = await placeRepo.findById(body.trekkingPlaceId);
  if (!place || place.status !== 'ACTIVE') {
    await failIdempotency(record);
    throw Errors.placeNotFound(body.trekkingPlaceId);
  }

  const route = await routeRepo.findById(body.trekkingRouteId);
  if (!route || route.status !== 'ACTIVE') {
    await failIdempotency(record);
    throw Errors.routeNotFound(body.trekkingRouteId);
  }

  let journey;
  try {
    journey = await journeyRepo.create({
      userId,
      trekkingPlaceId: body.trekkingPlaceId,
      trekkingRouteId: body.trekkingRouteId,
      provinceId: body.provinceId || place.provinceId,
      clientJourneyId: body.clientJourneyId,
      name: body.name,
      note: body.note,
      participantCount: body.participantCount || 1,
      plannedStartAt: body.plannedStartAt,
      plannedEndAt: body.plannedEndAt,
      status: JOURNEY_STATUS.PLANNED,
    });
  } catch (err) {
    await failIdempotency(record);
    // Race condition: duplicate clientJourneyId
    if (err.code === 11000 && body.clientJourneyId) {
      const existing = await journeyRepo.findByClientJourneyId(userId, body.clientJourneyId);
      if (existing) { return existing; }
    }
    throw err;
  }

  await completeIdempotency(record, journey.toJSON());
  return journey;
};

const startJourney = async (userId, journeyId, body = {}) => {
  const journey = await journeyRepo.findByIdAndUser(journeyId, userId);
  if (!journey) { throw Errors.journeyNotFound(journeyId); }
  assertTransition(journey, JOURNEY_STATUS.ACTIVE);

  const updated = await journeyRepo.updateById(journeyId, {
    status: JOURNEY_STATUS.ACTIVE,
    startedAt: body.startedAt || new Date(),
  });

  return updated;
};

const pauseJourney = async (userId, journeyId) => {
  const journey = await journeyRepo.findByIdAndUser(journeyId, userId);
  if (!journey) { throw Errors.journeyNotFound(journeyId); }
  assertTransition(journey, JOURNEY_STATUS.PAUSED);
  return journeyRepo.updateById(journeyId, { status: JOURNEY_STATUS.PAUSED });
};

const resumeJourney = async (userId, journeyId) => {
  const journey = await journeyRepo.findByIdAndUser(journeyId, userId);
  if (!journey) { throw Errors.journeyNotFound(journeyId); }
  // Resume chỉ từ PAUSED (không phải từ PLANNED)
  if (journey.status !== JOURNEY_STATUS.PAUSED) {
    throw Errors.journeyInvalidState(journey.status, JOURNEY_STATUS.PAUSED);
  }
  return journeyRepo.updateById(journeyId, { status: JOURNEY_STATUS.ACTIVE });
};

const completeJourney = async (userId, journeyId, body, idempotencyKey) => {
  const journey = await journeyRepo.findByIdAndUser(journeyId, userId);
  if (!journey) { throw Errors.journeyNotFound(journeyId); }

  // Idempotency: retry complete không emit effect trùng
  const { cached, record } = await checkIdempotency(
    idempotencyKey || `complete_${journeyId}`,
    'COMPLETE_JOURNEY',
    userId
  );
  if (cached) { return record.responseData; }

  // Nếu đã COMPLETED, trả về luôn (không throw)
  if (journey.status === JOURNEY_STATUS.COMPLETED) {
    await completeIdempotency(record, journey.toJSON());
    return journey;
  }

  if (!canTransition(journey.status, JOURNEY_STATUS.COMPLETED)) {
    await failIdempotency(record);
    throw Errors.journeyInvalidState(journey.status, JOURNEY_STATUS.COMPLETED);
  }

  const completedAt = body.completedAt ? new Date(body.completedAt) : new Date();

  const updateData = {
    status: JOURNEY_STATUS.COMPLETED,
    completedAt,
    statistics: body.statistics || {},
    track: body.track || {},
  };

  let updated;
  try {
    updated = await journeyRepo.updateById(journeyId, updateData);
  } catch (err) {
    await failIdempotency(record);
    throw err;
  }

  await completeIdempotency(record, updated.toJSON());
  return updated;
};

const cancelJourney = async (userId, journeyId) => {
  const journey = await journeyRepo.findByIdAndUser(journeyId, userId);
  if (!journey) { throw Errors.journeyNotFound(journeyId); }
  if (journey.status === JOURNEY_STATUS.COMPLETED) {
    throw new ConflictError(
      'Không thể hủy journey đã hoàn thành',
      'JOURNEY_ALREADY_COMPLETED'
    );
  }
  assertTransition(journey, JOURNEY_STATUS.CANCELLED);
  return journeyRepo.updateById(journeyId, { status: JOURNEY_STATUS.CANCELLED });
};

module.exports = {
  getMyJourneys,
  getMyStatistics,
  getJourneyById,
  createJourney,
  startJourney,
  pauseJourney,
  resumeJourney,
  completeJourney,
  cancelJourney,
};

// ─── Admin operations (read-only — FR-ADM-12, BR-13) ─────────────────────────

/**
 * Admin list tất cả journeys — không giới hạn userId, hỗ trợ filter đầy đủ.
 * Admin không được sửa raw GPS / check-in lịch sử (BR-13).
 */
const adminGetJourneys = async (query) => {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(parseInt(query.limit) || 20, 100);

  const result = await journeyRepo.adminFindAll({
    search: query.search,
    userId: query.userId,
    status: query.status,
    page,
    limit,
  });

  return {
    data: result.data.map(formatAdminJourney),
    total: result.total,
    page: result.page,
    limit: result.limit,
    totalPages: result.totalPages,
  };
};

const adminGetJourneyById = async (journeyId) => {
  const journey = await journeyRepo.adminFindById(journeyId);
  if (!journey) { throw Errors.journeyNotFound(journeyId); }
  return formatAdminJourney(journey);
};

/**
 * Format journey cho admin response — đồng nhất với spec API.
 */
const formatAdminJourney = (journey) => {
  const j = journey.toJSON ? journey.toJSON() : { ...journey };
  return {
    id: j.journeyId || j._id,
    userId: j.userId,
    userName: j.userId?.displayName ?? null,   // populated nếu có
    trekkingPlaceId: j.trekkingPlaceId?.trekkingPlaceId ?? j.trekkingPlaceId?.id ?? j.trekkingPlaceId?._id ?? j.trekkingPlaceId,
    placeName: j.trekkingPlaceId?.name ?? null,
    trekkingRouteId: j.trekkingRouteId?.trekkingRouteId ?? j.trekkingRouteId?.id ?? j.trekkingRouteId?._id ?? j.trekkingRouteId,
    routeName: j.trekkingRouteId?.name ?? null,
    provinceId: j.provinceId,
    name: j.name,
    status: j.status,
    note: j.note,
    participantCount: j.participantCount ?? 1,
    plannedStartAt: j.plannedStartAt,
    plannedEndAt: j.plannedEndAt,
    startedAt: j.startedAt,
    completedAt: j.completedAt,
    statistics: j.statistics ?? null,
    checkinCount: j.checkinCount ?? 0,
    markerCount: j.markerCount ?? 0,
    createdAt: j.createdAt,
    updatedAt: j.updatedAt,
  };
};

// Export các hàm admin mới
Object.assign(module.exports, {
  adminGetJourneys,
  adminGetJourneyById,
});
