'use strict';

const journeyService = require('../services/journey.service');
const publisher = require('../events/publishers/trekking.publisher');
const outboxRepo = require('../repositories/eventOutbox.repository');
const { EVENT_TYPES } = require('../constants/events');

const getJourneys = async (req, res, next) => {
  try {
    const result = await journeyService.getMyJourneys(req.user.userId, req.query);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const getStatistics = async (req, res, next) => {
  try {
    const stats = await journeyService.getMyStatistics(req.user.userId);
    res.json({ success: true, data: stats });
  } catch (err) { next(err); }
};

const getJourneyById = async (req, res, next) => {
  try {
    const journey = await journeyService.getJourneyById(req.user.userId, req.params.journeyId);
    res.json({ success: true, data: journey });
  } catch (err) { next(err); }
};

const createJourney = async (req, res, next) => {
  try {
    // userId luôn lấy từ authenticated identity — không trust body
    const idempotencyKey = req.headers['idempotency-key'] || req.body.clientJourneyId;
    const journey = await journeyService.createJourney(req.user.userId, req.body, idempotencyKey);
    res.status(201).json({ success: true, data: journey });
  } catch (err) { next(err); }
};

const startJourney = async (req, res, next) => {
  try {
    const journey = await journeyService.startJourney(
      req.user.userId,
      req.params.journeyId,
      req.body
    );
    // Publish JOURNEY_STARTED sau khi persist thành công
    await publisher.publish(EVENT_TYPES.TREKKING_JOURNEY_STARTED, {
      userId: req.user.userId,
      journeyId: String(journey._id || req.params.journeyId),
      trekkingPlaceId: String(journey.trekkingPlaceId),
      trekkingRouteId: String(journey.trekkingRouteId),
      startedAt: journey.startedAt,
    });
    res.json({ success: true, data: journey });
  } catch (err) { next(err); }
};

const pauseJourney = async (req, res, next) => {
  try {
    const journey = await journeyService.pauseJourney(req.user.userId, req.params.journeyId);
    res.json({ success: true, data: journey });
  } catch (err) { next(err); }
};

const resumeJourney = async (req, res, next) => {
  try {
    const journey = await journeyService.resumeJourney(req.user.userId, req.params.journeyId);
    res.json({ success: true, data: journey });
  } catch (err) { next(err); }
};

const completeJourney = async (req, res, next) => {
  try {
    const idempotencyKey = req.headers['idempotency-key'];
    const journey = await journeyService.completeJourney(
      req.user.userId,
      req.params.journeyId,
      req.body,
      idempotencyKey
    );

    const eventPayload = {
      userId: req.user.userId,
      journeyId: String(journey._id || req.params.journeyId),
      trekkingPlaceId: String(journey.trekkingPlaceId),
      trekkingRouteId: String(journey.trekkingRouteId),
      provinceId: journey.provinceId,
      distanceMeters: journey.statistics?.distanceMeters || 0,
      elevationGain: journey.statistics?.elevationGain || 0,
      durationSeconds: journey.statistics?.durationSeconds || 0,
    };

    // Persist delivery before acknowledging completion.
    await outboxRepo.enqueue(EVENT_TYPES.TREKKING_JOURNEY_COMPLETED, eventPayload, 'journey_complete:' + eventPayload.journeyId);
    // Best-effort direct publish (outbox worker will retry if this fails)

    res.json({ success: true, data: journey });
  } catch (err) { next(err); }
};

const cancelJourney = async (req, res, next) => {
  try {
    const journey = await journeyService.cancelJourney(req.user.userId, req.params.journeyId);
    res.json({ success: true, data: journey });
  } catch (err) { next(err); }
};

// ─── Admin (read-only — FR-ADM-12, BR-13) ────────────────────────────────────

const adminGetJourneys = async (req, res, next) => {
  try {
    const result = await journeyService.adminGetJourneys(req.query);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const adminGetJourneyById = async (req, res, next) => {
  try {
    const journey = await journeyService.adminGetJourneyById(req.params.id);
    res.json({ success: true, data: journey });
  } catch (err) { next(err); }
};

module.exports = {
  getJourneys, getStatistics, getJourneyById,
  createJourney, startJourney, pauseJourney, resumeJourney, completeJourney, cancelJourney,
  adminGetJourneys, adminGetJourneyById,
};
