'use strict';

const AuditLog = require('../models/AuditLog');

/**
 * Ghi một audit log entry.
 * Được gọi từ admin service sau mỗi action quan trọng (BR-15).
 */
const create = (data) => AuditLog.create(data);

/**
 * Lấy danh sách audit log với đầy đủ filter + phân trang (offset-based).
 */
const findPaginated = async ({
  page = 1,
  limit = 20,
  adminId,
  action,
  entityType,
  dateFrom,
  dateTo,
  result,
} = {}) => {
  const filter = {};

  if (adminId) {filter.adminId = adminId;}
  if (action) {filter.action = action;}
  if (entityType) {filter.entityType = entityType;}
  if (result) {filter.result = result;}

  if (dateFrom || dateTo) {
    filter.timestamp = {};
    if (dateFrom) {filter.timestamp.$gte = new Date(dateFrom);}
    if (dateTo) {filter.timestamp.$lte = new Date(dateTo);}
  }

  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    AuditLog.find(filter).sort({ timestamp: -1 }).skip(skip).limit(limit),
    AuditLog.countDocuments(filter),
  ]);

  return {
    data,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
};

module.exports = { create, findPaginated };
