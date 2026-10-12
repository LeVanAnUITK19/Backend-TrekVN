'use strict';

/**
 * admin.service.js — Business logic cho Admin Web panel.
 *
 * Phạm vi: User management, XP adjustment, Rank definitions, Dashboard, Audit logs.
 * Auth (login/me/refresh) vẫn dùng auth.service.js — chỉ thêm guard kiểm tra role ADMIN.
 */

const crypto = require('crypto');
const User = require('../models/User');
const userRepository = require('../repositories/user.repository');
const userRankProfileRepo = require('../repositories/userRankProfile.repository');
const xpTransactionRepo = require('../repositories/xpTransaction.repository');
const rankDefinitionRepo = require('../repositories/rankDefinition.repository');
const auditLogRepo = require('../repositories/auditLog.repository');
const { NotFoundError, BadRequestError, ForbiddenError } = require('../utils/errors');

// ─── Helper ───────────────────────────────────────────────────────────────────

/**
 * Ghi audit log. Không throw nếu thất bại (best-effort).
 */
const writeAuditLog = async (data) => {
  try {
    await auditLogRepo.create(data);
  } catch (err) {
    console.error('[AuditLog] Failed to write audit log:', err.message);
  }
};

/**
 * Format user object cho admin response (bao gồm stats từ rank profile).
 */
const formatAdminUser = async (user) => {
  const base = user.toJSON ? user.toJSON() : { ...user };

  // Xoá trường nhạy cảm không nên trả về
  delete base.passwordHash;
  delete base.__v;

  const readStats = async (baseUrl) => {
    try {
      const response = await fetch(`${baseUrl}/internal/v1/users/${String(user._id)}/stats`, {
        headers: { 'X-Service-Token': process.env.TREKVIET_INTERNAL_TOKEN || process.env.SERVICE_TOKEN || '' },
        signal: AbortSignal.timeout(3000),
      });
      if (!response.ok) {return null;}
      const body = await response.json();
      return body.success ? body.data : null;
    } catch { return null; }
  };
  const [trekking, checkin] = await Promise.all([
    readStats(process.env.TREKKING_SERVICE_URL || 'http://localhost:3003'),
    readStats(process.env.CHECKIN_SERVICE_URL || 'http://localhost:3002'),
  ]);

  // Map sang API spec field names
  const result = {
    id: base.userId || String(user._id),
    name: base.displayName,
    email: base.email,
    role: base.role,
    status: base.status,
    avatarUrl: base.avatarUrl ?? null,
    phoneNumber: base.phoneNumber ?? null,
    bio: base.bio ?? null,
    createdAt: base.createdAt,
    updatedAt: base.updatedAt,
    lastLoginAt: base.lastLoginAt ?? null,
    totalJourneys: trekking?.totalJourneys ?? null,
    totalCheckins: checkin?.totalCheckins ?? null,
    totalContributions: trekking?.totalContributions ?? null,
  };

  return result;
};

// ─── 1. Danh sách Users ────────────────────────────────────────────────────────

const listUsers = async (query) => {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(parseInt(query.limit) || 10, 100);
  const { search, status, role, sortBy = 'createdAt', sortOrder = 'desc' } = query;

  const filter = {};

  if (search) {
    filter.$or = [
      { displayName: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
    ];
  }
  if (status) {filter.status = status;}
  if (role) {filter.role = role;}

  const sortDir = sortOrder === 'asc' ? 1 : -1;
  const sortField = ['createdAt', 'updatedAt', 'displayName', 'email'].includes(sortBy)
    ? sortBy
    : 'createdAt';

  const skip = (page - 1) * limit;

  const [users, total] = await Promise.all([
    User.find(filter).sort({ [sortField]: sortDir }).skip(skip).limit(limit),
    User.countDocuments(filter),
  ]);

  // Lấy rank profiles để có stats
  const userIds = users.map((u) => u._id);
  const profiles = await require('../models/UserRankProfile').find({ userId: { $in: userIds } });
  const profileMap = new Map(profiles.map((p) => [String(p.userId), p]));

  const data = await Promise.all(
    users.map((u) => formatAdminUser(u, profileMap.get(String(u._id))))
  );

  return {
    data,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
};

// ─── 2. Tạo User (Admin) ──────────────────────────────────────────────────────

/**
 * Admin tạo user thủ công — bỏ qua luồng OTP, active ngay lập tức.
 */
const adminCreateUser = async (adminId, adminInfo, data) => {
  const bcrypt = require('bcryptjs');
  const { initRankProfile } = require('./gamification.service');

  const { email, password, displayName, role = 'USER', status = 'ACTIVE', bio } = data;

  const existing = await userRepository.findByEmail(email);
  if (existing) {
    throw new BadRequestError('Email đã được sử dụng');
  }

  const rounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
  const passwordHash = await bcrypt.hash(password, rounds);

  const user = await userRepository.create({
    email,
    passwordHash,
    displayName: displayName || email.split('@')[0],
    role,
    status,
    bio: bio || null,
    emailVerifiedAt: new Date(),
  });

  // Tạo settings mặc định
  await userRepository.createSettings(user._id);

  // Khởi tạo rank profile
  try {
    await initRankProfile(user._id);
  } catch (err) {
    console.error('[AdminCreateUser] initRankProfile failed (non-fatal):', err.message);
  }

  await writeAuditLog({
    adminId,
    adminName: adminInfo.name,
    adminEmail: adminInfo.email,
    action: 'CREATE',
    entityType: 'USER',
    entityId: String(user._id),
    afterSummary: { email: user.email, role: user.role, status: user.status },
    result: 'SUCCESS',
    ipAddress: adminInfo.ipAddress,
  });

  return formatAdminUser(user, null);
};

// ─── 2b. Chi tiết User ──────────────────────────────────────────────────────────

const getUserById = async (userId) => {
  const user = await userRepository.findById(userId);
  if (!user) {throw new NotFoundError('Không tìm thấy người dùng');}

  const profile = await userRankProfileRepo.findByUserId(userId);
  return formatAdminUser(user, profile);
};

// ─── 3. Cập nhật User ──────────────────────────────────────────────────────────

const updateUser = async (adminId, adminInfo, userId, data) => {
  const user = await userRepository.findById(userId);
  if (!user) {throw new NotFoundError('Không tìm thấy người dùng');}

  const allowedFields = ['displayName', 'avatarUrl', 'bio', 'phoneNumber'];
  const updateData = {};
  for (const field of allowedFields) {
    if (data[field] !== undefined) {updateData[field] = data[field];}
  }

  const updated = await userRepository.updateById(userId, updateData);

  await writeAuditLog({
    adminId,
    adminName: adminInfo.name,
    adminEmail: adminInfo.email,
    action: 'UPDATE',
    entityType: 'USER',
    entityId: String(userId),
    beforeSummary: { displayName: user.displayName, bio: user.bio },
    afterSummary: updateData,
    result: 'SUCCESS',
    ipAddress: adminInfo.ipAddress,
  });

  return formatAdminUser(updated);
};

// ─── 4. Block / Unblock User ───────────────────────────────────────────────────

const blockUser = async (adminId, adminInfo, userId, reason) => {
  const user = await userRepository.findById(userId);
  if (!user) {throw new NotFoundError('Không tìm thấy người dùng');}
  if (user.role === 'ADMIN') {throw new ForbiddenError('Không thể khóa tài khoản Admin');}
  if (user.status === 'BLOCKED') {throw new BadRequestError('Tài khoản đã bị khóa trước đó');}

  const updated = await userRepository.updateById(userId, { status: 'BLOCKED' });

  await writeAuditLog({
    adminId,
    adminName: adminInfo.name,
    adminEmail: adminInfo.email,
    action: 'BLOCK',
    entityType: 'USER',
    entityId: String(userId),
    beforeSummary: { status: user.status },
    afterSummary: { status: 'BLOCKED', reason },
    result: 'SUCCESS',
    ipAddress: adminInfo.ipAddress,
    note: reason,
  });

  return formatAdminUser(updated);
};

const unblockUser = async (adminId, adminInfo, userId) => {
  const user = await userRepository.findById(userId);
  if (!user) {throw new NotFoundError('Không tìm thấy người dùng');}
  if (user.status !== 'BLOCKED') {throw new BadRequestError('Tài khoản không ở trạng thái bị khóa');}

  const updated = await userRepository.updateById(userId, { status: 'ACTIVE' });

  await writeAuditLog({
    adminId,
    adminName: adminInfo.name,
    adminEmail: adminInfo.email,
    action: 'UNBLOCK',
    entityType: 'USER',
    entityId: String(userId),
    beforeSummary: { status: 'BLOCKED' },
    afterSummary: { status: 'ACTIVE' },
    result: 'SUCCESS',
    ipAddress: adminInfo.ipAddress,
  });

  return formatAdminUser(updated);
};

// ─── 5. Rank Profile của User ──────────────────────────────────────────────────

const getUserRankProfile = async (userId) => {
  const user = await userRepository.findById(userId);
  if (!user) {throw new NotFoundError('Không tìm thấy người dùng');}

  const profile = await userRankProfileRepo.ensureForUser(userId);
  if (!profile) {throw new NotFoundError('Hồ sơ gamification chưa được khởi tạo');}

  const currentRank = profile.currentRankId; // populated
  const nextRank = await rankDefinitionRepo.findNextRank(currentRank.level);

  return {
    id: String(profile._id),
    userId: String(userId),
    currentRankId: String(currentRank._id),
    currentRankCode: currentRank.code,
    currentRankName: currentRank.name,
    currentRankLevel: currentRank.level,
    currentRankMinXp: currentRank.minXp,
    totalXp: profile.totalXp,
    completedJourneyCount: profile.completedJourneyCount,
    totalDistanceMeters: profile.totalDistanceMeters,
    totalElevationGain: profile.totalElevationGain,
    verifiedCheckinCount: profile.verifiedCheckinCount,
    visitedProvinceCount: profile.visitedProvinceCount,
    visitedPlaceCount: profile.visitedPlaceCount,
    badgeCount: profile.badgeCount,
    approvedContributionCount: profile.approvedContributionCount,
    lastCalculatedAt: profile.lastCalculatedAt,
    nextRank: nextRank
      ? {
          code: nextRank.code,
          name: nextRank.name,
          level: nextRank.level,
          minXp: nextRank.minXp,
          minCompletedJourneys: nextRank.minCompletedJourneys,
          minVisitedProvinces: nextRank.minVisitedProvinces,
          minBadgeCount: nextRank.minBadgeCount,
        }
      : null,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
};

// ─── 6. XP Transactions của User ───────────────────────────────────────────────

const getUserXpTransactions = async (userId, query) => {
  const user = await userRepository.findById(userId);
  if (!user) {throw new NotFoundError('Không tìm thấy người dùng');}

  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(parseInt(query.limit) || 20, 100);
  const { transactionType, sourceType, dateFrom, dateTo } = query;

  const XpTransaction = require('../models/XpTransaction');
  const filter = { userId: require('mongoose').Types.ObjectId.isValid(userId)
    ? new (require('mongoose').Types.ObjectId)(userId)
    : userId };

  if (transactionType) {filter.transactionType = transactionType;}
  if (sourceType) {filter.sourceType = sourceType;}
  if (dateFrom || dateTo) {
    filter.createdAt = {};
    if (dateFrom) {filter.createdAt.$gte = new Date(dateFrom);}
    if (dateTo) {filter.createdAt.$lte = new Date(dateTo);}
  }

  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    XpTransaction.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    XpTransaction.countDocuments(filter),
  ]);

  return {
    data: items.map((tx) => ({
      id: String(tx._id),
      userId: String(tx.userId),
      transactionType: tx.transactionType,
      sourceType: tx.sourceType,
      sourceId: tx.sourceId,
      xpAmount: tx.xpAmount,
      description: tx.description,
      idempotencyKey: tx.idempotencyKey,
      createdAt: tx.createdAt,
    })),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
};

// ─── 7. Admin XP Adjustment ────────────────────────────────────────────────────

const adjustUserXp = async (adminId, adminInfo, userId, { xpAmount, reason, description }) => {
  if (!reason || !reason.trim()) {
    throw new BadRequestError('Bắt buộc phải nhập lý do điều chỉnh XP (BR-39)');
  }
  if (typeof xpAmount !== 'number' || xpAmount === 0) {
    throw new BadRequestError('xpAmount phải là số khác 0');
  }

  const user = await userRepository.findById(userId);
  if (!user) {throw new NotFoundError('Không tìm thấy người dùng');}

  const profile = await userRankProfileRepo.findByUserId(userId);
  if (!profile) {throw new NotFoundError('Hồ sơ gamification chưa được khởi tạo');}

  // Idempotency key duy nhất cho admin adjustment (BR-30)
  const idempotencyKey = `admin_adjustment:${adminId}:${userId}:${Date.now()}:${crypto.randomBytes(8).toString('hex')}`;

  const transaction = await xpTransactionRepo.create({
    userId: profile.userId,
    transactionType: 'ADMIN_ADJUSTMENT',
    sourceType: 'ADMIN_ADJUSTMENT',
    sourceId: String(adminId),
    xpAmount,
    description: description || reason,
    idempotencyKey,
  });

  // Cập nhật tổng XP trong profile (không dùng $inc < 0 để tránh âm quá mức)
  const newXp = Math.max(0, profile.totalXp + xpAmount);
  await userRankProfileRepo.updateByUserId(userId, { totalXp: newXp, lastCalculatedAt: new Date() });

  await writeAuditLog({
    adminId,
    adminName: adminInfo.name,
    adminEmail: adminInfo.email,
    action: 'XP_ADJUSTMENT',
    entityType: 'USER',
    entityId: String(userId),
    beforeSummary: { totalXp: profile.totalXp },
    afterSummary: { totalXp: newXp, xpAmount, reason },
    result: 'SUCCESS',
    ipAddress: adminInfo.ipAddress,
    note: reason,
  });

  return {
    id: String(transaction._id),
    userId: String(transaction.userId),
    transactionType: transaction.transactionType,
    sourceType: transaction.sourceType,
    sourceId: transaction.sourceId,
    xpAmount: transaction.xpAmount,
    description: transaction.description,
    idempotencyKey: transaction.idempotencyKey,
    createdAt: transaction.createdAt,
  };
};

// ─── 8. Rank History của User ──────────────────────────────────────────────────

const getUserRankHistory = async (userId, query) => {
  const user = await userRepository.findById(userId);
  if (!user) {throw new NotFoundError('Không tìm thấy người dùng');}

  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(parseInt(query.limit) || 20, 100);

  const RankHistory = require('../models/RankHistory');
  const skip = (page - 1) * limit;

  const mongoose = require('mongoose');
  const uid = mongoose.Types.ObjectId.isValid(userId)
    ? new mongoose.Types.ObjectId(userId)
    : userId;

  const [items, total] = await Promise.all([
    RankHistory.find({ userId: uid })
      .populate('previousRankId', 'code name level')
      .populate('newRankId', 'code name level')
      .sort({ changedAt: -1 })
      .skip(skip)
      .limit(limit),
    RankHistory.countDocuments({ userId: uid }),
  ]);

  return {
    data: items.map((h) => ({
      id: String(h._id),
      userId: String(h.userId),
      previousRankCode: h.previousRankId?.code ?? null,
      previousRankName: h.previousRankId?.name ?? null,
      newRankCode: h.newRankId.code,
      newRankName: h.newRankId.name,
      xpAtChange: h.xpAtChange,
      changeType: h.changeType,
      changedAt: h.changedAt,
    })),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
};

// ─── 9. Rank Definitions ───────────────────────────────────────────────────────

const listRanks = async () => {
  const ranks = await rankDefinitionRepo.findAll();
  return ranks.map((r) => ({
    id: String(r._id),
    code: r.code,
    name: r.name,
    description: r.description,
    level: r.level,
    minXp: r.minXp,
    minCompletedJourneys: r.minCompletedJourneys,
    minVisitedProvinces: r.minVisitedProvinces,
    minBadgeCount: r.minBadgeCount,
    minDistanceMeters: r.minDistanceMeters,
    minApprovedContributions: r.minApprovedContributions,
    iconUrl: r.iconUrl,
    status: r.status,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
};

const updateRank = async (adminId, adminInfo, rankId, data) => {
  const RankDefinition = require('../models/RankDefinition');

  const rank = await RankDefinition.findById(rankId);
  if (!rank) {throw new NotFoundError('Không tìm thấy rank definition');}

  // code và level không được thay đổi (spec SRS FR-RANK-16)
  if (data.code !== undefined || data.level !== undefined) {
    throw new BadRequestError('Không thể thay đổi code hoặc level của rank');
  }

  // NEWBIE không thể bị tắt
  if (rank.code === 'NEWBIE' && data.status === 'INACTIVE') {
    throw new BadRequestError('Không thể tắt rank NEWBIE');
  }

  const allowedFields = [
    'name', 'description', 'minXp', 'minCompletedJourneys',
    'minVisitedProvinces', 'minBadgeCount', 'minDistanceMeters',
    'minApprovedContributions', 'iconUrl', 'status',
  ];

  const updateData = {};
  for (const field of allowedFields) {
    if (data[field] !== undefined) {updateData[field] = data[field];}
  }

  const before = {
    name: rank.name, minXp: rank.minXp,
    minCompletedJourneys: rank.minCompletedJourneys,
    minVisitedProvinces: rank.minVisitedProvinces,
    minBadgeCount: rank.minBadgeCount,
    status: rank.status,
  };

  const updated = await RankDefinition.findByIdAndUpdate(
    rankId,
    updateData,
    { new: true, runValidators: true }
  );

  await writeAuditLog({
    adminId,
    adminName: adminInfo.name,
    adminEmail: adminInfo.email,
    action: 'UPDATE',
    entityType: 'RANK',
    entityId: String(rankId),
    beforeSummary: before,
    afterSummary: updateData,
    result: 'SUCCESS',
    ipAddress: adminInfo.ipAddress,
  });

  return {
    id: String(updated._id),
    code: updated.code,
    name: updated.name,
    description: updated.description,
    level: updated.level,
    minXp: updated.minXp,
    minCompletedJourneys: updated.minCompletedJourneys,
    minVisitedProvinces: updated.minVisitedProvinces,
    minBadgeCount: updated.minBadgeCount,
    minDistanceMeters: updated.minDistanceMeters,
    minApprovedContributions: updated.minApprovedContributions,
    iconUrl: updated.iconUrl,
    status: updated.status,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
  };
};

// ─── 10. Dashboard ─────────────────────────────────────────────────────────────

const getDashboard = require('./dashboard.service').getDashboard;

// ─── 11. Audit Logs ────────────────────────────────────────────────────────────

const listAuditLogs = async (query) => {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(parseInt(query.limit) || 20, 100);

  const result = await auditLogRepo.findPaginated({
    page,
    limit,
    adminId: query.adminId,
    action: query.action,
    entityType: query.entityType,
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
    result: query.result,
  });

  return {
    ...result,
    data: result.data.map((log) => ({
      id: String(log._id),
      timestamp: log.timestamp,
      adminId: String(log.adminId),
      adminName: log.adminName,
      adminEmail: log.adminEmail,
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId,
      beforeSummary: log.beforeSummary,
      afterSummary: log.afterSummary,
      result: log.result,
      ipAddress: log.ipAddress,
      note: log.note,
    })),
  };
};

module.exports = {
  listUsers,
  adminCreateUser,
  getUserById,
  updateUser,
  blockUser,
  unblockUser,
  getUserRankProfile,
  getUserXpTransactions,
  adjustUserXp,
  getUserRankHistory,
  listRanks,
  updateRank,
  getDashboard,
  listAuditLogs,
  writeAuditLog,
};
