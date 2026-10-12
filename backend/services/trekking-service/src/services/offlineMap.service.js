'use strict';

/**
 * offlineMap.service.js — Quản lý Offline Map Packages.
 *
 * OfflineMapPackage là gói bản đồ độc lập (không gắn với place/route cụ thể).
 * Dành cho Admin upload/quản lý gói bản đồ vùng: NORTH, CENTRAL, SOUTH, ALL.
 *
 * Khác với offlineMap embedded trong TrekkingPlace/TrekkingRoute
 * (những cái đó do Agent Map Builder tạo và gắn trực tiếp vào entity).
 */

const offlineMapRepo = require('../repositories/offlineMapPackage.repository');
const { buildR2Url } = require('../config/r2');
const { Errors } = require('../utils/errors');

// ─── Format response ──────────────────────────────────────────────────────────

const formatPackage = (pkg) => {
  const p = pkg.toJSON ? pkg.toJSON() : { ...pkg };
  return {
    id: p.id || p._id,
    name: p.name,
    version: p.version,
    description: p.description,
    checksum: p.checksum,
    // downloadUrl được build runtime từ objectKey
    downloadUrl: p.objectKey ? buildR2Url(p.objectKey) : null,
    fileSizeBytes: p.fileSizeBytes,
    status: p.status,
    regionCode: p.regionCode,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    publishedAt: p.publishedAt,
  };
};

// ─── Admin CRUD ───────────────────────────────────────────────────────────────

const adminListOfflineMaps = async (query) => {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(parseInt(query.limit) || 20, 100);

  const result = await offlineMapRepo.findAll({
    search: query.search,
    status: query.status,
    page,
    limit,
  });

  return {
    data: result.data.map(formatPackage),
    total: result.total,
    page: result.page,
    limit: result.limit,
    totalPages: result.totalPages,
  };
};

const adminGetOfflineMapById = async (id) => {
  const pkg = await offlineMapRepo.findById(id);
  if (!pkg) {throw Errors.notFound('Không tìm thấy offline map package');}
  return formatPackage(pkg);
};

const adminCreateOfflineMap = async (data, adminId) => {
  const { name, version, description, objectKey, checksum, fileSizeBytes, regionCode } = data;

  const pkg = await offlineMapRepo.create({
    name,
    version,
    description: description ?? null,
    objectKey: objectKey ?? null,
    checksum: checksum ?? null,
    fileSizeBytes: fileSizeBytes ?? null,
    regionCode: regionCode ?? null,
    status: 'DRAFT',
    createdBy: adminId ? String(adminId) : null,
  });

  return formatPackage(pkg);
};

const adminUpdateOfflineMap = async (id, data) => {
  const pkg = await offlineMapRepo.findById(id);
  if (!pkg) {throw Errors.notFound('Không tìm thấy offline map package');}

  // Không cho cập nhật package đã PUBLISHED theo hướng giảm version
  const allowed = ['name', 'version', 'description', 'objectKey', 'checksum', 'fileSizeBytes', 'regionCode'];
  const update = {};
  for (const field of allowed) {
    if (data[field] !== undefined) {update[field] = data[field];}
  }

  const updated = await offlineMapRepo.updateById(id, update);
  return formatPackage(updated);
};

const adminDeleteOfflineMap = async (id) => {
  const pkg = await offlineMapRepo.findById(id);
  if (!pkg) {throw Errors.notFound('Không tìm thấy offline map package');}

  // Không xóa package đang PUBLISHED (cần deprecated trước)
  if (pkg.status === 'PUBLISHED') {
    throw Errors.businessRule(
      'Không thể xóa package đang PUBLISHED. Hãy chuyển sang DEPRECATED trước.'
    );
  }

  await offlineMapRepo.deleteById(id);
};

/**
 * POST /admin/offline-maps/:id/publish
 * Xuất bản package: status → PUBLISHED, ghi publishedAt.
 */
const adminPublishOfflineMap = async (id) => {
  const pkg = await offlineMapRepo.findById(id);
  if (!pkg) {throw Errors.notFound('Không tìm thấy offline map package');}

  if (pkg.status === 'PUBLISHED') {
    throw Errors.businessRule('Package đã ở trạng thái PUBLISHED');
  }
  if (!pkg.objectKey) {
    throw Errors.businessRule('Package chưa có file (objectKey). Hãy upload trước khi publish.');
  }

  const updated = await offlineMapRepo.updateById(id, {
    status: 'PUBLISHED',
    publishedAt: new Date(),
  });

  return formatPackage(updated);
};

module.exports = {
  adminListOfflineMaps,
  adminGetOfflineMapById,
  adminCreateOfflineMap,
  adminUpdateOfflineMap,
  adminDeleteOfflineMap,
  adminPublishOfflineMap,
};
