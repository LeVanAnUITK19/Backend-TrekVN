'use strict';

const routeService = require('../services/route.service');

const getRoutes = async (req, res, next) => {
  try {
    const params = require('../utils/catalogQuery').catalogQuery(req.query);
    const data = await require('../services/catalogCache').getCatalogCache().remember(
      'routes', params, () => require('../repositories/route.repository').findCatalogPage(params));
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

const getRouteById = async (req, res, next) => {
  try {
    const route = await routeService.getRouteById(req.params.routeId);
    res.json({ success: true, data: route });
  } catch (err) { next(err); }
};

const getRouteMilestones = async (req, res, next) => {
  try {
    const milestones = await routeService.getRouteMilestones(req.params.routeId);
    res.json({ success: true, data: milestones });
  } catch (err) { next(err); }
};

const getOfflinePackage = async (req, res, next) => {
  try {
    const pkg = await routeService.getOfflinePackage(req.params.routeId);
    res.json({ success: true, data: pkg });
  } catch (err) { next(err); }
};

const checkOfflinePackage = async (req, res, next) => {
  try {
    const result = await routeService.checkOfflinePackage(req.params.routeId, req.query.version);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

// ─── Admin ────────────────────────────────────────────────────────────────────

const adminGetRoutes = async (req, res, next) => {
  try {
    const result = await routeService.adminGetRoutes(req.query);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const adminGetRouteById = async (req, res, next) => {
  try {
    const route = await routeService.adminGetRouteById(req.params.id);
    res.json({ success: true, data: route });
  } catch (err) { next(err); }
};

const adminCreateRoute = async (req, res, next) => {
  try {
    console.log('[DEBUG] adminCreateRoute called');
    console.log('[DEBUG] req.body:', JSON.stringify(req.body, null, 2));
    console.log('[DEBUG] req.user:', req.user);
    
    const route = await routeService.adminCreateRoute(req.body);
    res.status(201).json({ success: true, data: route });
  } catch (err) {
    console.error('[ERROR] adminCreateRoute failed:', err.message);
    console.error('[ERROR] Stack:', err.stack);
    console.error('[ERROR] Full error:', JSON.stringify(err, Object.getOwnPropertyNames(err)));
    next(err);
  }
};

const adminUpdateRoute = async (req, res, next) => {
  try {
    const route = await routeService.adminUpdateRoute(req.params.id, req.body);
    res.json({ success: true, data: route });
  } catch (err) { next(err); }
};

const adminUpdateRouteStatus = async (req, res, next) => {
  try {
    const route = await routeService.adminUpdateRouteStatus(req.params.id, req.body.status);
    res.json({ success: true, data: route });
  } catch (err) { next(err); }
};

const adminGetOfflineMap = async (req, res, next) => {
  try {
    const map = await routeService.adminGetOfflineMap(req.params.routeId);
    res.json({ success: true, data: map });
  } catch (err) { next(err); }
};

const adminUpdateOfflineMap = async (req, res, next) => {
  try {
    const route = await routeService.adminUpdateOfflineMap(req.params.routeId, req.body);
    res.json({ success: true, data: route });
  } catch (err) { next(err); }
};

// ─── Admin milestones ─────────────────────────────────────────────────────────

const adminGetMilestones = async (req, res, next) => {
  try {
    const milestones = await routeService.adminGetMilestones(req.params.routeId);
    res.json({ success: true, data: milestones });
  } catch (err) { next(err); }
};

const adminCreateMilestone = async (req, res, next) => {
  try {
    const milestone = await routeService.adminCreateMilestone(req.params.routeId, req.body);
    res.status(201).json({ success: true, data: milestone });
  } catch (err) { next(err); }
};

const adminUpdateMilestone = async (req, res, next) => {
  try {
    const milestone = await routeService.adminUpdateMilestone(
      req.params.routeId,
      req.params.milestoneId,
      req.body
    );
    res.json({ success: true, data: milestone });
  } catch (err) { next(err); }
};

const adminDeleteMilestone = async (req, res, next) => {
  try {
    await routeService.adminDeleteMilestone(req.params.routeId, req.params.milestoneId);
    res.status(204).end();
  } catch (err) { next(err); }
};

const adminDeleteRoute = async (req, res, next) => {
  try {
    await routeService.adminDeleteRoute(req.params.id);
    res.json({ success: true });
  } catch (err) { next(err); }
};

// ─── Admin milestones (flat — by milestoneId) ──────────────────────────────────

const adminListMilestones = async (req, res, next) => {
  try {
    const result = await routeService.adminListMilestones(req.query);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const adminGetMilestoneById = async (req, res, next) => {
  try {
    const m = await routeService.adminGetMilestoneById(req.params.milestoneId);
    res.json({ success: true, data: m });
  } catch (err) { next(err); }
};

const adminUpdateMilestoneById = async (req, res, next) => {
  try {
    const m = await routeService.adminUpdateMilestoneById(req.params.milestoneId, req.body);
    res.json({ success: true, data: m });
  } catch (err) { next(err); }
};

const adminDeleteMilestoneById = async (req, res, next) => {
  try {
    await routeService.adminDeleteMilestoneById(req.params.milestoneId);
    res.json({ success: true });
  } catch (err) { next(err); }
};

const adminUploadRouteImage = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Không có file ảnh' });
    }
    const route = await routeService.adminUploadRouteImage(req.params.id, req.file);
    res.json({ success: true, data: route });
  } catch (err) { next(err); }
};

module.exports = {
  getRoutes,
  getRouteById, getRouteMilestones, getOfflinePackage, checkOfflinePackage,
  adminGetRoutes, adminGetRouteById, adminCreateRoute, adminUpdateRoute,
  adminUpdateRouteStatus, adminDeleteRoute,
  adminGetOfflineMap, adminUpdateOfflineMap,
  adminListMilestones, adminGetMilestoneById, adminUpdateMilestoneById, adminDeleteMilestoneById,
  adminGetMilestones, adminCreateMilestone, adminUpdateMilestone, adminDeleteMilestone,
  adminUploadRouteImage,
};
