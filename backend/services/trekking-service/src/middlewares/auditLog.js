'use strict';

const axios = require('axios');

/**
 * Audit Log Middleware cho Trekking Service
 * 
 * Ghi lại các thao tác quan trọng của Admin vào audit log (centralized tại auth-service).
 * Middleware này chạy SAU KHI operation thành công (gắn vào response).
 */

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:3001';
const SERVICE_TOKEN = process.env.TREKVIET_INTERNAL_TOKEN || process.env.SERVICE_TOKEN;

/**
 * Ghi audit log vào auth-service.
 * Best-effort: không throw error nếu thất bại.
 */
const writeAuditLog = async (logData) => {
  try {
    console.log('[AuditLog] Sending to auth-service:', {
      url: `${AUTH_SERVICE_URL}/internal/v1/audit-logs`,
      hasToken: !!SERVICE_TOKEN,
      data: logData
    });
    
    await axios.post(
      `${AUTH_SERVICE_URL}/internal/v1/audit-logs`,
      logData,
      {
        headers: {
          'X-Service-Token': SERVICE_TOKEN,
          'Content-Type': 'application/json',
        },
        timeout: 3000,
      }
    );
    
    console.log('[AuditLog] Successfully wrote audit log for', logData.action, logData.entityType);
  } catch (err) {
    console.error('[AuditLog] Failed to write audit log:', err.message);
    console.error('[AuditLog] Error details:', {
      status: err.response?.status,
      data: err.response?.data,
      config: {
        url: err.config?.url,
        method: err.config?.method,
      }
    });
    // Không throw - audit log failure không nên block business operation
  }
};

/**
 * Middleware factory: tạo audit log sau khi response thành công.
 * 
 * @param {string} action - Action type (CREATE, UPDATE, DELETE, APPROVE, REJECT, etc.)
 * @param {string} entityType - Entity type (PLACE, ROUTE, MILESTONE, CONTRIBUTION, etc.)
 * @param {function} getEntityId - Function nhận (req, res) và trả về entityId
 * @param {function} getSummary - Optional function nhận (req, res) và trả về afterSummary object
 */
const createAuditLogMiddleware = (action, entityType, getEntityId, getSummary = null) => {
  return async (req, res, next) => {
    // Lưu original res.json để wrap
    const originalJson = res.json.bind(res);

    // Override res.json để chặn sau khi response thành công
    res.json = function (data) {
      // Gọi original json trước để response về client ngay
      const result = originalJson(data);

      // Chỉ ghi audit log nếu success
      if (data.success) {
        // Extract admin info từ req.user (đã set bởi authenticate + requireAdmin middleware)
        const adminId = req.user?.id || req.user?.userId || 'system';
        const adminName = req.user?.name || req.user?.displayName || req.user?.email || 'system';
        const adminEmail = req.user?.email || null;

        // Debug log
        console.log('[AuditLog] Preparing to write audit log:', {
          action,
          entityType,
          adminId,
          adminName,
          adminEmail,
          hasUser: !!req.user,
          userKeys: req.user ? Object.keys(req.user) : []
        });

        // Get entity ID
        const entityId = getEntityId ? getEntityId(req, res, data) : null;

        // Get summary if provided
        const afterSummary = getSummary ? getSummary(req, res, data) : null;

        // Write audit log asynchronously (non-blocking)
        setImmediate(() => {
          writeAuditLog({
            adminId,
            adminName,
            adminEmail,
            action,
            entityType,
            entityId: entityId || req.params.id || req.params.placeId || req.params.routeId || 'unknown',
            beforeSummary: null, // Trekking service không lưu before state
            afterSummary,
            result: 'SUCCESS',
            ipAddress: req.ip || req.connection.remoteAddress || null,
            note: null,
          });
        });
      }

      return result;
    };

    next();
  };
};

/**
 * Preset audit log middlewares cho các operations phổ biến
 */

// Places
const auditPlaceCreate = createAuditLogMiddleware(
  'CREATE',
  'PLACE',
  (req, res, data) => data.data?.trekkingPlaceId || data.data?._id || data.data?.id,
  (req, res, data) => ({
    name: data.data?.name,
    provinceId: data.data?.provinceId,
    status: data.data?.status,
  })
);

const auditPlaceUpdate = createAuditLogMiddleware(
  'UPDATE',
  'PLACE',
  (req) => req.params.id,
  (req, res, data) => ({
    name: data.data?.name,
    status: data.data?.status,
  })
);

const auditPlaceDelete = createAuditLogMiddleware(
  'DELETE',
  'PLACE',
  (req) => req.params.id
);

const auditPlaceStatusUpdate = createAuditLogMiddleware(
  'UPDATE',
  'PLACE',
  (req) => req.params.id,
  (req) => ({ status: req.body.status })
);

// Routes
const auditRouteCreate = createAuditLogMiddleware(
  'CREATE',
  'ROUTE',
  (req, res, data) => data.data?.trekkingRouteId || data.data?._id || data.data?.id,
  (req, res, data) => ({
    name: data.data?.name,
    trekkingPlaceId: data.data?.trekkingPlaceId,
    status: data.data?.status,
  })
);

const auditRouteUpdate = createAuditLogMiddleware(
  'UPDATE',
  'ROUTE',
  (req) => req.params.id || req.params.routeId,
  (req, res, data) => ({
    name: data.data?.name,
    status: data.data?.status,
  })
);

const auditRouteDelete = createAuditLogMiddleware(
  'DELETE',
  'ROUTE',
  (req) => req.params.id || req.params.routeId
);

const auditRouteStatusUpdate = createAuditLogMiddleware(
  'UPDATE',
  'ROUTE',
  (req) => req.params.id || req.params.routeId,
  (req) => ({ status: req.body.status })
);

// Milestones
const auditMilestoneCreate = createAuditLogMiddleware(
  'CREATE',
  'MILESTONE',
  (req, res, data) => data.data?.milestoneId || data.data?._id || data.data?.id,
  (req, res, data) => ({
    name: data.data?.name,
    type: data.data?.type,
    routeId: req.params.routeId,
  })
);

const auditMilestoneUpdate = createAuditLogMiddleware(
  'UPDATE',
  'MILESTONE',
  (req) => req.params.milestoneId,
  (req, res, data) => ({
    name: data.data?.name,
    type: data.data?.type,
  })
);

const auditMilestoneDelete = createAuditLogMiddleware(
  'DELETE',
  'MILESTONE',
  (req) => req.params.milestoneId
);

// Contributions
const auditContributionReview = createAuditLogMiddleware(
  'REVIEW',
  'CONTRIBUTION',
  (req) => req.params.id,
  (req) => ({
    decision: req.body.decision,
    adminNote: req.body.adminNote,
  })
);

// Offline Maps
const auditOfflineMapUpdate = createAuditLogMiddleware(
  'UPDATE',
  'OFFLINE_MAP',
  (req) => req.params.id || req.params.routeId,
  (req, res, data) => ({
    version: req.body.version || data.data?.offlineMap?.version,
    available: req.body.available,
  })
);

const auditOfflineMapPublish = createAuditLogMiddleware(
  'PUBLISH',
  'OFFLINE_MAP',
  (req) => req.params.id,
  (_req, _res, _data) => ({
    status: 'PUBLISHED',
  })
);

// Badges
const auditBadgeCreate = createAuditLogMiddleware(
  'CREATE',
  'BADGE',
  (req, res, data) => data.data?.badgeId || data.data?._id || data.data?.id,
  (req, res, data) => ({
    name: data.data?.name,
    rarity: data.data?.rarity,
    category: data.data?.category,
  })
);

const auditBadgeUpdate = createAuditLogMiddleware(
  'UPDATE',
  'BADGE',
  (req) => req.params.badgeId || req.params.id,
  (req, res, data) => ({
    name: data.data?.name,
    status: data.data?.status,
  })
);

const auditBadgeStatusUpdate = createAuditLogMiddleware(
  'UPDATE',
  'BADGE',
  (req) => req.params.badgeId || req.params.id,
  (req) => ({ status: req.body.status })
);

module.exports = {
  createAuditLogMiddleware,
  writeAuditLog,
  // Places
  auditPlaceCreate,
  auditPlaceUpdate,
  auditPlaceDelete,
  auditPlaceStatusUpdate,
  // Routes
  auditRouteCreate,
  auditRouteUpdate,
  auditRouteDelete,
  auditRouteStatusUpdate,
  // Milestones
  auditMilestoneCreate,
  auditMilestoneUpdate,
  auditMilestoneDelete,
  // Contributions
  auditContributionReview,
  // Offline Maps
  auditOfflineMapUpdate,
  auditOfflineMapPublish,
  // Badges
  auditBadgeCreate,
  auditBadgeUpdate,
  auditBadgeStatusUpdate,
};
