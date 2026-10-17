'use strict';

const contributionService = require('../services/contribution.service');

const submitRoute = async (req, res, next) => {
  try {
    const submission = await contributionService.submitRoute(req.user.userId, req.body);
    res.status(201).json({ success: true, data: submission });
  } catch (err) { next(err); }
};

const submitPlace = async (req, res, next) => {
  try {
    const suggestion = await contributionService.submitPlace(req.user.userId, req.body);
    res.status(201).json({ success: true, data: suggestion });
  } catch (err) { next(err); }
};

const getMyContributions = async (req, res, next) => {
  try {
    const result = await contributionService.getMyContributions(req.user.userId, req.query);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const getMyContributionById = async (req, res, next) => {
  try {
    const result = await contributionService.getMyContributionById(
      req.user.userId,
      req.params.id
    );
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const resubmitContribution = async (req, res, next) => {
  try {
    const result = await contributionService.resubmitContribution(
      req.user.userId,
      req.params.id,
      req.body
    );
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const cancelContribution = async (req, res, next) => {
  try {
    await contributionService.cancelMyContribution(req.user.userId, req.params.id);
    res.status(204).end();
  } catch (err) { next(err); }
};

// ─── Admin ────────────────────────────────────────────────────────────────────

const adminListContributions = async (req, res, next) => {
  try {
    const result = await require('../services/adminContribution.service').list(req.query);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const adminGetContributionById = async (req, res, next) => {
  try {
    const result = await contributionService.adminGetContributionById(req.params.id);
    res.json({ success: true, data: await require('../services/adminContribution.service').detail(result) });
  } catch (err) { next(err); }
};

const adminReviewContribution = async (req, res, next) => {
  try {
    const { decision, adminNote, resultingRouteId, resultingPlaceId } = req.body;
    const result = await contributionService.adminReviewContribution(
      req.user.userId,
      req.params.id,
      decision,
      adminNote,
      { resultingRouteId, resultingPlaceId }
    );
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const adminReviewSubmissionMarker = async (req, res, next) => {
  try {
    const { decision, adminNote, createOfficialMilestone } = req.body;
    const result = await contributionService.adminReviewSubmissionMarker(
      req.user.userId,
      req.params.submissionId,
      req.params.markerId,
      decision,
      adminNote,
      createOfficialMilestone
    );
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

// ─── Admin: markers của route submission (FR-ADM-21) ─────────────────────────

const adminGetSubmissionMarkers = async (req, res, next) => {
  try {
    const markers = await contributionService.adminGetSubmissionMarkers(req.params.submissionId);
    res.json({ success: true, data: markers });
  } catch (err) { next(err); }
};

// Thêm vào review marker — align với API spec (action field thay vì decision)
const adminReviewSubmissionMarkerV2 = async (req, res, next) => {
  try {
    const { action, decision, adminNote, resultingMilestoneId, createOfficialMilestone } = req.body;
    const result = await contributionService.adminReviewSubmissionMarker(
      req.user.userId,
      req.params.submissionId,
      req.params.markerId,
      decision || action,
      adminNote,
      { createOfficialMilestone: createOfficialMilestone ?? (Boolean(action) && !resultingMilestoneId), resultingMilestoneId }
    );
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

module.exports = {
  submitRoute, submitPlace,
  getMyContributions, getMyContributionById, resubmitContribution, cancelContribution,
  adminListContributions, adminGetContributionById, adminReviewContribution,
  adminReviewSubmissionMarker, adminGetSubmissionMarkers, adminReviewSubmissionMarkerV2,
};
