'use strict';

const markerRepo = require('../repositories/journeyMarker.repository');
const journeyRepo = require('../repositories/journey.repository');
const { Errors } = require('../utils/errors');
const { JOURNEY_STATUS } = require('../constants/journey');
const { normalizeMarkerType } = require('../constants/marker');
const { validateGeoPoint } = require('../utils/geoUtils');

/**
 * Validate journey thuộc user và ở trạng thái cho phép tạo marker.
 */
const assertMarkerAllowed = async (userId, journeyId) => {
  const journey = await journeyRepo.findByIdAndUser(journeyId, userId);
  if (!journey) { throw Errors.journeyNotFound(journeyId); }
  const allowedStatuses = [JOURNEY_STATUS.ACTIVE, JOURNEY_STATUS.PAUSED];
  if (!allowedStatuses.includes(journey.status)) {
    throw Errors.journeyInvalidState(
      journey.status,
      `${JOURNEY_STATUS.ACTIVE} hoặc ${JOURNEY_STATUS.PAUSED}`
    );
  }
  return journey;
};

const getMarkers = async (userId, journeyId) => {
  // Chỉ trả marker của journey thuộc user
  const journey = await journeyRepo.findByIdAndUser(journeyId, userId);
  if (!journey) { throw Errors.journeyNotFound(journeyId); }
  return markerRepo.findByJourney(journeyId);
};

const createMarker = async (userId, journeyId, body) => {
  // Lost acknowledgements remain replayable after the journey was completed.
  if (body.clientMarkerId) {
    const existing = await markerRepo.findByClientMarkerId(journeyId, userId, body.clientMarkerId);
    if (existing) { return existing; }
  }
  await assertMarkerAllowed(userId, journeyId);

  if (body.location) { validateGeoPoint(body.location, 'location'); }

  // Normalize marker type và handle aliases
  const normalizedType = normalizeMarkerType(body.type);

  // Idempotency: clientMarkerId chống duplicate khi offline retry
  if (body.clientMarkerId) {
    const existing = await markerRepo.findByClientMarkerId(journeyId, userId, body.clientMarkerId);
    if (existing) { return existing; }
  }

  let marker;
  try {
    marker = await markerRepo.create({
      journeyId,
      userId,
      name: body.name,
      type: normalizedType,
      note: body.note,
      location: body.location,
      altitude: body.altitude,
      accuracyMeters: body.accuracyMeters,
      images: body.images || [],
      markedAt: body.markedAt ? new Date(body.markedAt) : new Date(),
      clientMarkerId: body.clientMarkerId,
    });
  } catch (err) {
    // Race condition: duplicate clientMarkerId
    if (err.code === 11000 && body.clientMarkerId) {
      const existing = await markerRepo.findByClientMarkerId(journeyId, userId, body.clientMarkerId);
      if (existing) { return existing; }
      throw Errors.markerDuplicate(body.clientMarkerId);
    }
    throw err;
  }

  // Tăng markerCount của journey atomically
  await journeyRepo.incrementMarkerCount(journeyId, 1);

  return marker;
};

const updateMarker = async (userId, journeyId, markerId, body) => {
  // Validate journey thuộc user
  const journey = await journeyRepo.findByIdAndUser(journeyId, userId);
  if (!journey) { throw Errors.journeyNotFound(journeyId); }

  const marker = await markerRepo.findByIdAndJourney(markerId, journeyId);
  if (!marker) { throw Errors.markerNotFound(markerId); }

  // Chỉ owner được sửa
  if (String(marker.userId) !== String(userId)) {
    throw Errors.markerNotOwner();
  }

  const updateData = {};
  if (body.name !== undefined) { updateData.name = body.name; }
  if (body.type !== undefined) { updateData.type = normalizeMarkerType(body.type); }
  if (body.note !== undefined) { updateData.note = body.note; }
  if (body.images !== undefined) { updateData.images = body.images; }
  // Không tự đổi tọa độ trừ khi user chủ động (FR-MARK-06)
  if (body.location !== undefined) {
    validateGeoPoint(body.location, 'location');
    updateData.location = body.location;
  }
  if (body.altitude !== undefined) { updateData.altitude = body.altitude; }

  return markerRepo.updateById(markerId, updateData);
};

const deleteMarker = async (userId, journeyId, markerId) => {
  const journey = await journeyRepo.findByIdAndUser(journeyId, userId);
  if (!journey) { throw Errors.journeyNotFound(journeyId); }

  const marker = await markerRepo.findByIdAndJourney(markerId, journeyId);
  if (!marker) { throw Errors.markerNotFound(markerId); }

  if (String(marker.userId) !== String(userId)) {
    throw Errors.markerNotOwner();
  }

  await markerRepo.deleteById(markerId);

  // Giảm markerCount atomically, không xuống dưới 0
  if (journey.markerCount > 0) {
    await journeyRepo.incrementMarkerCount(journeyId, -1);
  }
};

module.exports = { getMarkers, createMarker, updateMarker, deleteMarker };
