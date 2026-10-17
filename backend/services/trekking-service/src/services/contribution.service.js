'use strict';

const routeSubmissionRepo = require('../repositories/routeSubmission.repository');
const routeSubmissionMarkerRepo = require('../repositories/routeSubmissionMarker.repository');
const placeSuggestionRepo = require('../repositories/placeSuggestion.repository');
const journeyRepo = require('../repositories/journey.repository');
const markerRepo = require('../repositories/journeyMarker.repository');
const placeRepo = require('../repositories/place.repository');
const routeRepo = require('../repositories/route.repository');
const milestoneRepo = require('../repositories/milestone.repository');
const { Errors } = require('../utils/errors');
const { CONTRIBUTION_STATUS, RESUBMITTABLE_STATUSES, CANCELLABLE_STATUSES, REVIEWABLE_STATUSES, SUBMISSION_MARKER_REVIEW_STATUS } = require('../constants/contribution');
const { JOURNEY_STATUS } = require('../constants/journey');
const { normalizeMarkerType } = require('../constants/marker');
const { validateGeoPoint } = require('../utils/geoUtils');
const publisher = require('../events/publishers/trekking.publisher');
const outboxRepo = require('../repositories/eventOutbox.repository');
const { EVENT_TYPES } = require('../constants/events');

// ─── Route Submissions ────────────────────────────────────────────────────────

const submitRoute = async (userId, body) => {
  // Idempotency: clientOperationId chống duplicate
  if (body.clientOperationId) {
    const existing = await routeSubmissionRepo.findByClientOperationId(body.clientOperationId);
    if (existing) {
      if (existing.userId !== userId) {throw Errors.contributionNotOwner();}
      return existing;
    }
  }

  // Journey phải COMPLETED (BR-17)
  const journey = await journeyRepo.findByIdAndUser(body.sourceJourneyId, userId);
  if (!journey) { throw Errors.journeyNotFound(body.sourceJourneyId); }
  const markerOnly = body.contributionKind === 'MARKERS';
  const allowed = markerOnly
    ? [JOURNEY_STATUS.ACTIVE, JOURNEY_STATUS.PAUSED, JOURNEY_STATUS.COMPLETED]
    : [JOURNEY_STATUS.COMPLETED];
  if (!allowed.includes(journey.status)) {
    throw Errors.contributionInvalidState(journey.status);
  }

  const markerIds = [...new Set(body.markerIds || [])];
  if (markerOnly && !markerIds.length) {
    throw new (require('../utils/errors').BadRequestError)('Chọn ít nhất một cột mốc để gửi admin.');
  }
  const selectedMarkers = markerIds.length ? await markerRepo.findByIds(markerIds) : [];
  if (selectedMarkers.length !== markerIds.length || selectedMarkers.some((marker) =>
    marker.userId !== userId || (markerOnly && String(marker.journeyId) !== String(journey._id)))) {
    throw Errors.markerNotOwner();
  }
  if (body.trekkingPlaceId && String(body.trekkingPlaceId) !== String(journey.trekkingPlaceId)) {
    throw new (require('../utils/errors').BadRequestError)('Địa điểm đóng góp không khớp hành trình.');
  }
  let submission;
  try {
    submission = await routeSubmissionRepo.create({
      userId,
      contributionKind: markerOnly ? 'MARKERS' : 'ROUTE',
      sourceJourneyId: body.sourceJourneyId,
      trekkingPlaceId: journey.trekkingPlaceId,
      proposedName: body.proposedName,
      description: body.description,
      notes: body.notes,
      encodedPolyline: markerOnly ? undefined : (body.encodedPolyline || journey.track?.encodedPolyline),
      gpxUrl: body.gpxUrl,
      statistics: markerOnly ? body.statistics : {
        ...(journey.statistics?.toObject ? journey.statistics.toObject() : journey.statistics),
        ...body.statistics,
      },
      images: body.images || [],
      markerIds,
      ...(markerOnly ? { resultingRouteId: journey.trekkingRouteId } : {}),
      clientOperationId: body.clientOperationId,
      status: CONTRIBUTION_STATUS.PENDING_REVIEW,
    });
  } catch (err) {
    if (err.code === 11000 && body.clientOperationId) {
      const existing = await routeSubmissionRepo.findByClientOperationId(body.clientOperationId);
      if (existing) {
      if (existing.userId !== userId) {throw Errors.contributionNotOwner();}
      return existing;
    }
    }
    throw err;
  }

  // Snapshot Journey Markers được user chọn chia sẻ (BR-28)
  if (body.markerIds && body.markerIds.length > 0) {
    const markers = markerIds.map((id) => selectedMarkers.find((marker) => String(marker._id) === id));
    const snapshotDocs = markers.map((m, idx) => ({
      routeSubmissionId: submission._id,
      sourceJourneyMarkerId: m._id,
      name: m.name,
      type: normalizeMarkerType(m.type),
      description: m.note,
      location: m.location,
      altitude: m.altitude,
      images: m.images || [],
      sequence: idx + 1,
      reviewStatus: SUBMISSION_MARKER_REVIEW_STATUS.PENDING,
    }));
    if (snapshotDocs.length > 0) {
      try { await routeSubmissionMarkerRepo.createMany(snapshotDocs); }
      catch (err) {
        await require('../models/RouteSubmissionMarker').deleteMany({ routeSubmissionId: submission._id });
        await require('../models/RouteSubmission').findByIdAndDelete(submission._id);
        throw err;
      }
    }
  }

  // Publish event sau khi persist thành công
  await publisher.publish(EVENT_TYPES.TREKKING_CONTRIBUTION_SUBMITTED, {
    userId,
    submissionId: String(submission._id),
    type: 'ROUTE_SUBMISSION',
    sourceJourneyId: String(body.sourceJourneyId),
  });

  return submission;
};

const submitPlace = async (userId, body) => {
  if (body.clientOperationId) {
    const existing = await placeSuggestionRepo.findByClientOperationId(body.clientOperationId);
    if (existing) {
      if (existing.userId !== userId) {throw Errors.contributionNotOwner();}
      return existing;
    }
  }

  if (body.location) { validateGeoPoint(body.location); }

  let suggestion;
  try {
    suggestion = await placeSuggestionRepo.create({
      userId,
      provinceId: body.provinceId,
      proposedName: body.proposedName,
      address: body.address,
      location: body.location,
      description: body.description,
      difficulty: body.difficulty,
      tags: body.tags || [],
      images: body.images || [],
      clientOperationId: body.clientOperationId,
      status: CONTRIBUTION_STATUS.PENDING_REVIEW,
    });
  } catch (err) {
    if (err.code === 11000 && body.clientOperationId) {
      const existing = await placeSuggestionRepo.findByClientOperationId(body.clientOperationId);
      if (existing) {
      if (existing.userId !== userId) {throw Errors.contributionNotOwner();}
      return existing;
    }
    }
    throw err;
  }

  await publisher.publish(EVENT_TYPES.TREKKING_CONTRIBUTION_SUBMITTED, {
    userId,
    submissionId: String(suggestion._id),
    type: 'PLACE_SUGGESTION',
  });

  return suggestion;
};

const getMyContributions = async (userId, query) => {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(parseInt(query.limit) || 20, 100);

  const [routes, places] = await Promise.all([
    routeSubmissionRepo.findByUser(userId, { status: query.status, page, limit }),
    placeSuggestionRepo.findByUser(userId, { status: query.status, page, limit }),
  ]);

  return { routes, places };
};

const getMyContributionById = async (userId, contributionId) => {
  // Tìm trong cả hai collections
  const route = await routeSubmissionRepo.findByIdAndUser(contributionId, userId);
  if (route) {
    const markers = await routeSubmissionMarkerRepo.findBySubmission(contributionId);
    return { type: 'ROUTE_SUBMISSION', contribution: route, markers };
  }
  const place = await placeSuggestionRepo.findByIdAndUser(contributionId, userId);
  if (place) { return { type: 'PLACE_SUGGESTION', contribution: place }; }
  throw Errors.contributionNotFound(contributionId);
};

const resubmitContribution = async (userId, contributionId, body) => {
  // Thử route submission trước
  const route = await routeSubmissionRepo.findByIdAndUser(contributionId, userId);
  if (route) {
    if (!RESUBMITTABLE_STATUSES.includes(route.status)) {
      throw Errors.contributionInvalidState(route.status);
    }
    return routeSubmissionRepo.updateById(contributionId, {
      ...body,
      status: CONTRIBUTION_STATUS.PENDING_REVIEW,
    });
  }
  const place = await placeSuggestionRepo.findByIdAndUser(contributionId, userId);
  if (place) {
    if (!RESUBMITTABLE_STATUSES.includes(place.status)) {
      throw Errors.contributionInvalidState(place.status);
    }
    return placeSuggestionRepo.updateById(contributionId, {
      ...body,
      status: CONTRIBUTION_STATUS.PENDING_REVIEW,
    });
  }
  throw Errors.contributionNotFound(contributionId);
};

const cancelMyContribution = async (userId, contributionId) => {
  const route = await routeSubmissionRepo.findByIdAndUser(contributionId, userId);
  if (route) {
    if (!CANCELLABLE_STATUSES.includes(route.status)) {
      throw Errors.contributionInvalidState(route.status);
    }
    return routeSubmissionRepo.updateById(contributionId, { status: CONTRIBUTION_STATUS.CANCELLED });
  }
  const place = await placeSuggestionRepo.findByIdAndUser(contributionId, userId);
  if (place) {
    if (!CANCELLABLE_STATUSES.includes(place.status)) {
      throw Errors.contributionInvalidState(place.status);
    }
    return placeSuggestionRepo.updateById(contributionId, { status: CONTRIBUTION_STATUS.CANCELLED });
  }
  throw Errors.contributionNotFound(contributionId);
};

// ─── Admin operations ─────────────────────────────────────────────────────────

const adminListContributions = async (query) => {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(parseInt(query.limit) || 20, 100);
  const { type, status, userId } = query;

  if (type === 'ROUTE_SUBMISSION') {
    return routeSubmissionRepo.findAll({ status, userId, page, limit });
  }
  if (type === 'PLACE_SUGGESTION') {
    return placeSuggestionRepo.findAll({ status, userId, page, limit });
  }

  // Trả cả hai nếu không filter type
  const [routes, places] = await Promise.all([
    routeSubmissionRepo.findAll({ status, userId, page, limit }),
    placeSuggestionRepo.findAll({ status, userId, page, limit }),
  ]);
  return { routes, places };
};

const adminGetContributionById = async (contributionId) => {
  const route = await routeSubmissionRepo.findById(contributionId);
  if (route) {
    const markers = await routeSubmissionMarkerRepo.findBySubmission(contributionId);
    return { type: 'ROUTE_SUBMISSION', contribution: route, markers };
  }
  const place = await placeSuggestionRepo.findById(contributionId);
  if (place) { return { type: 'PLACE_SUGGESTION', contribution: place }; }
  throw Errors.contributionNotFound(contributionId);
};

/**
 * Chống concurrent review bằng status check (NFR-ADM-03).
 * Nếu contribution đã được người khác review → 409.
 */
const adminReviewContribution = async (adminId, contributionId, decision, adminNote, options = {}) => {
  // Tìm contribution (route hoặc place)
  let isRoute = false;
  let contribution = await routeSubmissionRepo.findById(contributionId);
  if (contribution) {
    isRoute = true;
  } else {
    contribution = await placeSuggestionRepo.findById(contributionId);
  }
  if (!contribution) { throw Errors.contributionNotFound(contributionId); }

  // Kiểm tra trạng thái reviewable
  if (!REVIEWABLE_STATUSES.includes(contribution.status)) {
    // Nếu đã APPROVED/REJECTED bởi người khác → 409
    if ([CONTRIBUTION_STATUS.APPROVED, CONTRIBUTION_STATUS.REJECTED].includes(contribution.status)) {
      throw Errors.contributionAlreadyReviewed(contributionId);
    }
    throw Errors.contributionInvalidState(contribution.status);
  }

  const reviewData = {
    status: decision,
    reviewedBy: adminId,
    reviewedAt: new Date(),
    adminNote,
  };

  let updated;
  if (decision === CONTRIBUTION_STATUS.APPROVED) {
    if (isRoute) {
      // Tạo TrekkingRoute từ contribution nếu không truyền resultingRouteId
      let resultingRouteId = contribution.contributionKind === 'MARKERS'
        ? contribution.resultingRouteId : options.resultingRouteId;
      if (!resultingRouteId && contribution.encodedPolyline) {
        const newRoute = await routeRepo.create({
          trekkingPlaceId: contribution.trekkingPlaceId,
          name: contribution.proposedName || 'Route từ contribution',
          description: contribution.description,
          status: 'ACTIVE',
        });
        resultingRouteId = newRoute._id;
      }
      reviewData.resultingRouteId = resultingRouteId;
      updated = await routeSubmissionRepo.updateById(contributionId, reviewData);
    } else {
      // Tạo TrekkingPlace từ contribution
      let resultingPlaceId = options.resultingPlaceId;
      if (!resultingPlaceId) {
        const { slugify } = require('../utils/slugify');
        const newPlace = await placeRepo.create({
          name: contribution.proposedName,
          provinceId: contribution.provinceId,
          location: contribution.location,
          description: contribution.description,
          difficulty: contribution.difficulty,
          tags: contribution.tags || [],
          slug: slugify(contribution.proposedName),
          status: 'ACTIVE',
        });
        resultingPlaceId = newPlace._id;
      }
      reviewData.resultingPlaceId = resultingPlaceId;
      updated = await placeSuggestionRepo.updateById(contributionId, reviewData);
    }

    const approvalPayload = {
      adminId,
      contributionId,
      userId: contribution.userId,
      type: isRoute ? 'ROUTE_SUBMISSION' : 'PLACE_SUGGESTION',
    };
    // Marker-only review does not earn the XP award reserved for a new approved route.
    if (contribution.contributionKind !== 'MARKERS') {
      await outboxRepo.enqueue(EVENT_TYPES.TREKKING_CONTRIBUTION_APPROVED, approvalPayload);
    }

  } else {
    if (isRoute) {
      updated = await routeSubmissionRepo.updateById(contributionId, reviewData);
    } else {
      updated = await placeSuggestionRepo.updateById(contributionId, reviewData);
    }

    if (decision === CONTRIBUTION_STATUS.REJECTED) {
      await publisher.publish(EVENT_TYPES.TREKKING_CONTRIBUTION_REJECTED, {
        adminId,
        contributionId,
        userId: contribution.userId,
        type: isRoute ? 'ROUTE_SUBMISSION' : 'PLACE_SUGGESTION',
      });
    }
  }

  return updated;
};

/**
 * Admin review submitted marker — có thể tạo Official Milestone (FR-ADM-21).
 */
const adminReviewSubmissionMarker = async (adminId, submissionId, markerId, decision, adminNote, createOfficialMilestone) => {
  decision = { APPROVE: 'APPROVED', REJECT: 'REJECTED' }[decision] || decision;
  const options = typeof createOfficialMilestone === 'object' && createOfficialMilestone !== null
    ? createOfficialMilestone : { createOfficialMilestone: Boolean(createOfficialMilestone) };
  const submission = await routeSubmissionRepo.findById(submissionId);
  if (!submission) { throw Errors.contributionNotFound(submissionId); }

  const marker = await routeSubmissionMarkerRepo.findByIdAndSubmission(markerId, submissionId);
  if (!marker) { throw Errors.markerNotFound(markerId); }

  const updateData = {
    reviewStatus: decision,
    adminNote,
  };

  // Nếu approved và admin muốn tạo Official Milestone
  if (decision === SUBMISSION_MARKER_REVIEW_STATUS.APPROVED && options.resultingMilestoneId) {
    const milestone = await milestoneRepo.findByIdAndRoute(options.resultingMilestoneId, submission.resultingRouteId);
    if (!milestone) { throw Errors.milestoneNotFound(options.resultingMilestoneId); }
    updateData.resultingMilestoneId = milestone._id;
  } else if (decision === SUBMISSION_MARKER_REVIEW_STATUS.APPROVED && options.createOfficialMilestone && submission.resultingRouteId) {
    const maxSeq = await milestoneRepo.getMaxSequence(submission.resultingRouteId);
    const milestone = await milestoneRepo.create({
      trekkingRouteId: submission.resultingRouteId,
      name: marker.name,
      type: _mapMarkerTypeToMilestoneType(marker.type),
      sequence: maxSeq + 1,
      location: marker.location,
      altitude: marker.altitude,
      description: marker.description,
    });
    updateData.resultingMilestoneId = milestone._id;
  }

  return routeSubmissionMarkerRepo.updateById(markerId, updateData);
};

/**
 * Map marker type sang milestone type gần nhất.
 */
const _mapMarkerTypeToMilestoneType = (markerType) => {
  const map = {
    VIEWPOINT: 'VIEWPOINT',
    REST_POINT: 'REST_POINT',
    WATER_POINT: 'WATER_POINT',
    CAMP: 'CAMP',
    SUMMIT: 'SUMMIT',
  };
  return map[markerType] || 'CHECKPOINT';
};

module.exports = {
  submitRoute,
  submitPlace,
  getMyContributions,
  getMyContributionById,
  resubmitContribution,
  cancelMyContribution,
  adminListContributions,
  adminGetContributionById,
  adminReviewContribution,
  adminReviewSubmissionMarker,
};

// ─── Admin: lấy markers của một route submission (FR-ADM-21) ─────────────────

/**
 * GET /admin/contributions/:submissionId/markers
 * Trả danh sách SubmittedMarker snapshot (không thay đổi khi user sửa marker gốc — BR-28).
 */
const adminGetSubmissionMarkers = async (submissionId) => {
  const submission = await routeSubmissionRepo.findById(submissionId);
  if (!submission) { throw Errors.contributionNotFound(submissionId); }

  const markers = await routeSubmissionMarkerRepo.findBySubmission(submissionId);
  return markers.map((m) => ({
    id: String(m._id),
    routeSubmissionId: String(m.routeSubmissionId),
    sourceJourneyMarkerId: m.sourceJourneyMarkerId ? String(m.sourceJourneyMarkerId) : null,
    name: m.name,
    type: m.type,
    description: m.description,
    location: m.location,
    altitude: m.altitude ?? null,
    images: m.images ?? [],
    sequence: m.sequence,
    reviewStatus: m.reviewStatus,
    adminNote: m.adminNote ?? null,
    resultingMilestoneId: m.resultingMilestoneId ? String(m.resultingMilestoneId) : null,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  }));
};

// Thêm vào module.exports
Object.assign(module.exports, { adminGetSubmissionMarkers });
