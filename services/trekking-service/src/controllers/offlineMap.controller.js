'use strict';

const offlineMapService = require('../services/offlineMap.service');

const adminListOfflineMaps = async (req, res, next) => {
  try {
    const result = await offlineMapService.adminListOfflineMaps(req.query);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const adminGetOfflineMapById = async (req, res, next) => {
  try {
    const pkg = await offlineMapService.adminGetOfflineMapById(req.params.id);
    res.json({ success: true, data: pkg });
  } catch (err) { next(err); }
};

const adminCreateOfflineMap = async (req, res, next) => {
  try {
    const pkg = await offlineMapService.adminCreateOfflineMap(req.body, req.user?.userId);
    res.status(201).json({ success: true, data: pkg });
  } catch (err) { next(err); }
};

const adminUpdateOfflineMap = async (req, res, next) => {
  try {
    const pkg = await offlineMapService.adminUpdateOfflineMap(req.params.id, req.body);
    res.json({ success: true, data: pkg });
  } catch (err) { next(err); }
};

const adminDeleteOfflineMap = async (req, res, next) => {
  try {
    await offlineMapService.adminDeleteOfflineMap(req.params.id);
    res.json({ success: true });
  } catch (err) { next(err); }
};

const adminPublishOfflineMap = async (req, res, next) => {
  try {
    const pkg = await offlineMapService.adminPublishOfflineMap(req.params.id);
    res.json({ success: true, data: pkg });
  } catch (err) { next(err); }
};

module.exports = {
  adminListOfflineMaps,
  adminGetOfflineMapById,
  adminCreateOfflineMap,
  adminUpdateOfflineMap,
  adminDeleteOfflineMap,
  adminPublishOfflineMap,
};
