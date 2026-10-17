'use strict';

const routeRepo = require('../repositories/route.repository');
const milestoneRepo = require('../repositories/milestone.repository');
const { Errors } = require('../utils/errors');
const { buildMapR2Url } = require('../config/r2');

/**
 * Build mapManifest chuẩn để trả về client.
 * - objectKey được lưu trong DB
 * - downloadUrl được build tại runtime từ R2_PUBLIC_BASE_URL (không hard-code)
 */
const buildMapManifest = (offlineMap) => {
  if (!offlineMap || !offlineMap.available) {
    return {
      available: false,
      version: 0,
      sizeBytes: null,
      downloadUrl: null,
      checksum: null,
      minZoom: null,
      maxZoom: null,
      bounds: null,
    };
  }

  return {
    available: offlineMap.available,
    version: offlineMap.version,
    sizeBytes: offlineMap.sizeBytes ?? null,
    // Build URL tại runtime — không lưu trong DB
    downloadUrl: buildMapR2Url(offlineMap.objectKey),
    checksum: offlineMap.checksum ?? null,
    minZoom: offlineMap.minZoom ?? null,
    maxZoom: offlineMap.maxZoom ?? null,
    bounds: offlineMap.bounds ?? null,
  };
};

const getRouteById = async (routeId) => {
  const route = await routeRepo.findById(routeId);
  if (!route || route.status !== 'ACTIVE') {
    throw Errors.routeNotFound(routeId);
  }
  return route;
};

const getRouteMilestones = async (routeId) => {
  const route = await routeRepo.findById(routeId);
  if (!route || route.status !== 'ACTIVE') {
    throw Errors.routeNotFound(routeId);
  }
  // Milestones sorted by sequence (enforced in repo)
  return milestoneRepo.findByRoute(routeId);
};

/**
 * GET /routes/:routeId/offline-package
 * Trả về đủ dữ liệu để Flutter cache offline.
 * KHÔNG proxy file map lớn — client tải trực tiếp từ mapManifest.downloadUrl.
 * downloadUrl được build tại runtime: R2_PUBLIC_BASE_URL + "/" + objectKey
 */
// Routes share the current place tiles. Their path and image are independent
// metadata, so editing either never requires a second basemap package.
const resolveOfflineMap = (route, place) => {
  return { map: place?.offlineMap, scope: 'PLACE', entityId: String(place?._id || route.trekkingPlaceId) };
};

const getOfflinePackage = async (routeId) => {
  const route = await routeRepo.findById(routeId);
  if (!route || route.status !== 'ACTIVE') {
    throw Errors.routeNotFound(routeId);
  }

  const TrekkingPlace = require('../models/TrekkingPlace');
  const place = await TrekkingPlace.findById(route.trekkingPlaceId);
  const milestones = await milestoneRepo.findByRoute(routeId);
  const resolved = resolveOfflineMap(route, place);

  return {
    place: place ? place.toJSON() : null,
    route: route.toJSON(),
    milestones: milestones.map((m) => m.toJSON()),
    mapManifest: { ...buildMapManifest(resolved.map), scope: resolved.scope, entityId: resolved.entityId },
  };
};

/**
 * GET /routes/:routeId/offline-package/check?version=X
 * Cho client biết package có version mới không.
 */
const checkOfflinePackage = async (routeId, clientVersion) => {
  const route = await routeRepo.findById(routeId);
  if (!route || route.status !== 'ACTIVE') {
    throw Errors.routeNotFound(routeId);
  }
  const TrekkingPlace = require('../models/TrekkingPlace');
  const place = await TrekkingPlace.findById(route.trekkingPlaceId);
  const map = resolveOfflineMap(route, place).map || {};
  const serverVersion = map.version || 0;
  const hasUpdate = serverVersion > (parseInt(clientVersion) || 0);
  return {
    hasUpdate,
    serverVersion,
    available: map.available || false,
    // Trả downloadUrl mới để client biết link cập nhật
    downloadUrl: buildMapR2Url(map.objectKey),
    checksum: map.checksum || null,
  };
};

// ─── Admin operations ─────────────────────────────────────────────────────────

const adminGetRoutes = (query) => {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(parseInt(query.limit) || 20, 100);
  return routeRepo.findAll({ status: query.status, page, limit });
};

const adminGetRouteById = async (routeId) => {
  const route = await routeRepo.findById(routeId);
  if (!route) { throw Errors.routeNotFound(routeId); }
  return route;
};

const adminCreateRoute = async (data) => {
  // Validate place exists
  const TrekkingPlace = require('../models/TrekkingPlace');
  const place = await TrekkingPlace.findById(data.trekkingPlaceId);
  
  if (!place) {
    throw Errors.placeNotFound(data.trekkingPlaceId);
  }
  
  // Place maps are resolved at download time; do not snapshot an old version.
  
  return routeRepo.create(data);
};

const adminUpdateRoute = async (routeId, data) => {
  const route = await routeRepo.findById(routeId);
  if (!route) { throw Errors.routeNotFound(routeId); }
  return routeRepo.updateById(routeId, data);
};

const adminUpdateRouteStatus = async (routeId, status) => {
  const route = await routeRepo.findById(routeId);
  if (!route) { throw Errors.routeNotFound(routeId); }
  return routeRepo.updateStatus(routeId, status);
};

/**
 * DELETE /admin/routes/:id — Soft delete (status = INACTIVE).
 */
const adminDeleteRoute = async (routeId) => {
  const route = await routeRepo.findById(routeId);
  if (!route) { throw Errors.routeNotFound(routeId); }
  await routeRepo.softDelete(routeId);
};

const adminGetOfflineMap = async (routeId) => {
  const route = await routeRepo.findById(routeId);
  if (!route) { throw Errors.routeNotFound(routeId); }
  // Trả về raw offlineMap (có objectKey) + downloadUrl được build cho admin dễ kiểm tra
  const place = await require('../models/TrekkingPlace').findById(route.trekkingPlaceId);
  const resolved = resolveOfflineMap(route, place);
  const map = resolved.map?.toObject?.() ?? { ...resolved.map };
  return {
    ...map,
    scope: resolved.scope,
    entityId: resolved.entityId,
    downloadUrl: buildMapR2Url(map.objectKey),
  };
};

const adminUpdateOfflineMap = async (routeId, mapData) => {
  const route = await routeRepo.findById(routeId);
  if (!route) { throw Errors.routeNotFound(routeId); }
  return routeRepo.updateOfflineMap(routeId, mapData);
};

// ─── Admin milestone management ───────────────────────────────────────────────

/**
 * Admin: lấy danh sách milestones theo routeId (không check status ACTIVE).
 */
const adminGetMilestones = async (routeId) => {
  const route = await routeRepo.findById(routeId);
  if (!route) { throw Errors.routeNotFound(routeId); }
  return milestoneRepo.findByRoute(routeId);
};

/**
 * Admin: flat list milestones (không theo routeId) — dùng cho trang /admin/milestones.
 */
const adminListMilestones = async (query) => {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(parseInt(query.limit) || 20, 100);
  return milestoneRepo.adminFindAll({ routeId: query.routeId, page, limit });
};

/**
 * Admin: lấy chi tiết milestone theo ID (không cần biết routeId trước).
 */
const adminGetMilestoneById = async (milestoneId) => {
  const milestone = await milestoneRepo.findById(milestoneId);
  if (!milestone) { throw Errors.milestoneNotFound(milestoneId); }
  return milestone;
};

/**
 * Admin: cập nhật milestone theo ID trực tiếp (flat endpoint).
 */
const adminUpdateMilestoneById = async (milestoneId, data) => {
  const milestone = await milestoneRepo.findById(milestoneId);
  if (!milestone) { throw Errors.milestoneNotFound(milestoneId); }
  return milestoneRepo.updateById(milestoneId, data);
};

/**
 * Admin: xóa milestone theo ID trực tiếp (flat endpoint).
 */
const adminDeleteMilestoneById = async (milestoneId) => {
  const milestone = await milestoneRepo.findById(milestoneId);
  if (!milestone) { throw Errors.milestoneNotFound(milestoneId); }
  return milestoneRepo.deleteById(milestoneId);
};

const adminCreateMilestone = async (routeId, data) => {
  const route = await routeRepo.findById(routeId);
  if (!route) { throw Errors.routeNotFound(routeId); }
  // Auto-assign sequence if not provided
  if (data.sequence === undefined) {
    const max = await milestoneRepo.getMaxSequence(routeId);
    data.sequence = max + 1;
  }
  return milestoneRepo.create({ ...data, trekkingRouteId: routeId });
};

const adminUpdateMilestone = async (routeId, milestoneId, data) => {
  const milestone = await milestoneRepo.findByIdAndRoute(milestoneId, routeId);
  if (!milestone) { throw Errors.milestoneNotFound(milestoneId); }
  return milestoneRepo.updateById(milestoneId, data);
};

const adminDeleteMilestone = async (routeId, milestoneId) => {
  const milestone = await milestoneRepo.findByIdAndRoute(milestoneId, routeId);
  if (!milestone) { throw Errors.milestoneNotFound(milestoneId); }
  return milestoneRepo.deleteById(milestoneId);
};

/**
 * Upload ảnh cung đường (route-specific image)
 */
const adminUploadRouteImage = async (routeId, file) => {
  const route = await routeRepo.findById(routeId);
  if (!route) {throw Errors.routeNotFound(routeId);}

  const cloudinary = require('../config/cloudinary');
  
  // Upload from buffer (because multer uses memoryStorage)
  const result = await new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'trekviet/routes',
        transformation: [{ width: 1200, height: 800, crop: 'limit', quality: 'auto' }],
      },
      (error, result) => {
        if (error) {reject(error);}
        else {resolve(result);}
      }
    );
    uploadStream.end(file.buffer);
  });

  route.imageUrl = result.secure_url;
  await route.save();

  return route;
};

module.exports = {
  getRouteById,
  getRouteMilestones,
  getOfflinePackage,
  checkOfflinePackage,
  adminGetRoutes,
  adminGetRouteById,
  adminCreateRoute,
  adminUpdateRoute,
  adminUpdateRouteStatus,
  adminDeleteRoute,
  adminGetOfflineMap,
  adminUpdateOfflineMap,
  adminListMilestones,
  adminGetMilestoneById,
  adminUpdateMilestoneById,
  adminDeleteMilestoneById,
  adminGetMilestones,
  adminCreateMilestone,
  adminUpdateMilestone,
  adminDeleteMilestone,
  adminUploadRouteImage,
};
