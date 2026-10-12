'use strict';

const badgeService = require('../services/badge.service');

const getBadges = async (req, res, next) => {
  try {
    const result = await badgeService.getBadges(req.query);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const getMyBadges = async (req, res, next) => {
  try {
    const badges = await badgeService.getMyBadges(req.user.userId);
    res.json({ success: true, data: badges });
  } catch (err) { next(err); }
};

// ─── Admin ────────────────────────────────────────────────────────────────────

const adminGetBadges = async (req, res, next) => {
  try {
    const result = await badgeService.adminGetBadges(req.query);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const adminGetBadgeById = async (req, res, next) => {
  try {
    const badge = await badgeService.adminGetBadgeById(req.params.badgeId);
    res.json({ success: true, data: badge });
  } catch (err) { next(err); }
};

const adminCreateBadge = async (req, res, next) => {
  try {
    const badge = await badgeService.adminCreateBadge(req.body);
    res.status(201).json({ success: true, data: badge });
  } catch (err) { next(err); }
};

const adminUpdateBadge = async (req, res, next) => {
  try {
    const badge = await badgeService.adminUpdateBadge(req.params.badgeId, req.body);
    res.json({ success: true, data: badge });
  } catch (err) { next(err); }
};

const adminUpdateBadgeStatus = async (req, res, next) => {
  try {
    const badge = await badgeService.adminUpdateBadgeStatus(req.params.badgeId, req.body.status);
    res.json({ success: true, data: badge });
  } catch (err) { next(err); }
};

module.exports = {
  getBadges, getMyBadges,
  adminGetBadges, adminGetBadgeById, adminCreateBadge, adminUpdateBadge, adminUpdateBadgeStatus,
};
