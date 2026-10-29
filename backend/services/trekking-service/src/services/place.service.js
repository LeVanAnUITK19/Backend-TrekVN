'use strict';

const placeRepo = require('../repositories/place.repository');
const routeRepo = require('../repositories/route.repository');
const { Errors, AppError } = require('../utils/errors');
const { slugify } = require('../utils/slugify');
const { validateGeoPoint } = require('../utils/geoUtils');
const { buildMapR2Url } = require('../config/r2');

/**
 * Build offline map manifest cho place.
 * Tương tự buildMapManifest trong route.service.js nhưng scope=PLACE.
 */
const buildPlaceMapManifest = (offlineMap) => {
  if (!offlineMap || !offlineMap.available) {
    return {
      scope: 'PLACE',
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
    scope: 'PLACE',
    available: offlineMap.available,
    version: offlineMap.version,
    sizeBytes: offlineMap.sizeBytes ?? null,
    downloadUrl: buildMapR2Url(offlineMap.objectKey),
    checksum: offlineMap.checksum ?? null,
    minZoom: offlineMap.minZoom ?? null,
    maxZoom: offlineMap.maxZoom ?? null,
    bounds: offlineMap.bounds ?? null,
  };
};

const getPlaces = async (query) => {
  if (query.summary === 'true') {
    const params = require('../utils/catalogQuery').catalogQuery(query);
    return require('./catalogCache').getCatalogCache().remember('places', params, async () => {
      const result = await placeRepo.findAll({ ...params, summary: true, status: 'ACTIVE' });
      return { ...result, items: result.items.map((p) => p.toJSON()),
        hasMore: params.page * params.limit < result.total };
    });
  }
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(parseInt(query.limit) || 20, 100);

  // Lọc trực tiếp theo trường mien nếu có (mien-bac, mien-trung, mien-nam)
  const mien = query.mien || { NORTH: 'mien-bac', CENTRAL: 'mien-trung', SOUTH: 'mien-nam' }[query.region?.toUpperCase()];

  // region filter: lấy provinceIds từ checkin-service nếu region được chỉ định
  // Giữ lại để backward compatibility với API cũ
  let provinceId = query.provinceId;
  if (query.region && !mien && !provinceId) {
    const checkinProvider = require('../providers/checkin.provider');
    const provinceIds = await checkinProvider.getProvinceIdsByRegion(query.region);
    // Nếu không tìm được province nào → không có kết quả
    if (provinceIds.length === 0) {
      return { items: [], total: 0, page, limit };
    }
    // Nếu chỉ 1 province → dùng provinceId đơn giản
    // Nếu nhiều → dùng $in (placeRepo.findAll cần hỗ trợ array)
    provinceId = provinceIds;
  }

  const result = await placeRepo.findAll({
    q: query.q,
    sort: query.sort,
    provinceId,
    mien, // Thêm filter theo miền
    difficulty: query.difficulty,
    tags: query.tags,
    status: 'ACTIVE',
    page,
    limit,
  });
  // Explore needs routes for the current page, not one HTTP call per place.
  if (query.includeRoutes === 'true' && result.items.length) {
    const routes = await routeRepo.findByPlaces(result.items.map((p) => p._id));
    const byPlace = new Map();
    for (const route of routes) {
      const id = String(route.trekkingPlaceId);
      if (!byPlace.has(id)) { byPlace.set(id, []); }
      byPlace.get(id).push(route);
    }
    result.items = result.items.map((p) => ({
      ...p.toJSON(), routes: byPlace.get(String(p._id)) || [],
    }));
  }
  return result;
};

const getPlaceById = async (placeId) => {
  const place = await placeRepo.findById(placeId);
  if (!place || place.status !== 'ACTIVE') {
    throw Errors.placeNotFound(placeId);
  }
  return place;
};

const getPlaceRoutes = async (placeId) => {
  const place = await placeRepo.findById(placeId);
  if (!place || place.status !== 'ACTIVE') {
    throw Errors.placeNotFound(placeId);
  }
  return routeRepo.findByPlace(placeId, { status: 'ACTIVE' });
};

// ─── Offline Map (Place scope) ────────────────────────────────────────────────

/**
 * GET /places/:placeId/offline-package
 * Trả về manifest + metadata để Flutter biết link tải map.
 * KHÔNG proxy file map lớn — client tải từ downloadUrl (R2/CDN) trực tiếp.
 */
const getPlaceOfflinePackage = async (placeId) => {
  const place = await placeRepo.findById(placeId);
  if (!place || place.status !== 'ACTIVE') {
    throw Errors.placeNotFound(placeId);
  }
  const routes = await routeRepo.findByPlace(placeId, { status: 'ACTIVE' });
  return {
    place: place.toJSON(),
    routes: routes.map((r) => r.toJSON()),
    mapManifest: buildPlaceMapManifest(place.offlineMap),
  };
};

/**
 * GET /places/:placeId/offline-package/check?version=X
 * Cho client biết có version mới không.
 */
const checkPlaceOfflinePackage = async (placeId, clientVersion) => {
  const place = await placeRepo.findById(placeId);
  if (!place || place.status !== 'ACTIVE') {
    throw Errors.placeNotFound(placeId);
  }
  const map = place.offlineMap || {};
  const serverVersion = map.version || 0;
  const clientVer = parseInt(clientVersion) || 0;

  let status;
  if (!map.available) {
    status = 'NOT_AVAILABLE';
  } else if (serverVersion > clientVer) {
    status = 'OUTDATED';
  } else {
    status = 'UP_TO_DATE';
  }

  return {
    status,
    serverVersion,
    available: map.available || false,
    downloadUrl: buildMapR2Url(map.objectKey),
    checksum: map.checksum || null,
  };
};

// ─── Admin operations ─────────────────────────────────────────────────────────

/**
 * GET /admin/trekking/places-offline-maps
 * Trả về danh sách tất cả TrekkingPlace có offlineMap.available = true.
 * Dùng để hiển thị tab "Bản đồ địa điểm" trong Admin — phân biệt với
 * OfflineMapPackage (gói vùng độc lập).
 */
const adminListPlacesWithOfflineMap = async (query) => {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.max(1, Math.min(parseInt(query.limit) || 20, 100));
  if (query.available && !['all', 'true', 'false'].includes(query.available)) {
    throw new AppError('Bộ lọc bản đồ không hợp lệ', 400, 'VALIDATION_ERROR');
  }
  return placeRepo.findPlacesWithOfflineMap({ search: query.search, available: query.available, page, limit });
};

const adminGetPlaces = (query) => {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(parseInt(query.limit) || 20, 100);
  return placeRepo.adminFindAll({
    search: query.search,
    province: query.province,
    difficulty: query.difficulty,
    status: query.status,
    page,
    limit
  });
};

const adminGetPlaceById = async (placeId) => {
  const place = await placeRepo.findById(placeId);
  if (!place) { throw Errors.placeNotFound(placeId); }
  return place;
};

const adminCreatePlace = async (data) => {
  if (data.location) { validateGeoPoint(data.location); }
  if (data.name && !data.slug) {
    const baseSlug = slugify(data.name);
    // Kiểm tra slug trùng, nếu trùng thêm suffix ngẫu nhiên 4 ký tự
    let slug = baseSlug;
    const existing = await placeRepo.findBySlug(slug);
    if (existing) {
      slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
    }
    data.slug = slug;
  }
  return placeRepo.create(data);
};

const adminUpdatePlace = async (placeId, data) => {
  const place = await placeRepo.findById(placeId);
  if (!place) { throw Errors.placeNotFound(placeId); }
  if (data.location) { validateGeoPoint(data.location); }
  return placeRepo.updateById(placeId, data);
};

const adminUpdatePlaceStatus = async (placeId, status) => {
  const place = await placeRepo.findById(placeId);
  if (!place) { throw Errors.placeNotFound(placeId); }
  return placeRepo.updateStatus(placeId, status);
};

/**
 * DELETE /admin/places/:id — Soft delete (status = INACTIVE).
 * Spec mô tả "Soft delete (đặt status = DISABLED)" — mapping sang INACTIVE
 * vì TrekkingPlace model dùng ACTIVE/INACTIVE/DISABLED.
 */
const adminDeletePlace = async (placeId) => {
  const place = await placeRepo.findById(placeId);
  if (!place) { throw Errors.placeNotFound(placeId); }
  await placeRepo.softDelete(placeId);
};

// ─── Admin Offline Map (Place scope) ──────────────────────────────────────────

/**
 * GET /api/v1/admin/trekking/places/:id/offline-map
 * Trả raw offlineMap metadata + downloadUrl cho Admin kiểm tra.
 */
const adminGetPlaceOfflineMap = async (placeId) => {
  const place = await placeRepo.findById(placeId);
  if (!place) { throw Errors.placeNotFound(placeId); }
  const map = place.offlineMap ? (place.offlineMap.toObject ? place.offlineMap.toObject() : { ...place.offlineMap }) : {};
  return {
    ...map,
    downloadUrl: buildMapR2Url(map.objectKey),
  };
};

/**
 * PUT /api/v1/admin/trekking/places/:id/offline-map
 * Cập nhật offline map metadata sau khi Agent Service upload R2 thành công.
 * Chỉ lưu objectKey — downloadUrl được build runtime.
 */
const adminUpdatePlaceOfflineMap = async (placeId, mapData) => {
  const place = await placeRepo.findById(placeId);
  if (!place) { throw Errors.placeNotFound(placeId); }
  if (mapData.available && !(mapData.objectKey ?? place.offlineMap?.objectKey)?.trim()) {
    throw new AppError('Cần có file bản đồ trước khi bật tải xuống', 400, 'OFFLINE_MAP_FILE_REQUIRED');
  }
  return placeRepo.updateOfflineMap(placeId, mapData);
};

module.exports = {
  getPlaces,
  getPlaceById,
  getPlaceRoutes,
  getPlaceOfflinePackage,
  checkPlaceOfflinePackage,
  adminListPlacesWithOfflineMap,
  adminGetPlaces,
  adminGetPlaceById,
  adminCreatePlace,
  adminUpdatePlace,
  adminUpdatePlaceStatus,
  adminDeletePlace,
  adminGetPlaceOfflineMap,
  adminUpdatePlaceOfflineMap,
};
