'use strict';

const express = require('express');
const router = express.Router();
const adminCtrl = require('../controllers/admin.controller');
const { authenticate } = require('../middlewares/auth');
const { authenticateService } = require('../middlewares/authenticateService');
const cookieParser = require('cookie-parser');

// ─── requireAdmin middleware (inline vì auth service chưa có file riêng) ──────
const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'ADMIN') {
    return res.status(403).json({
      success: false,
      message: 'Chỉ Admin mới có quyền thực hiện thao tác này',
      statusCode: 403,
    });
  }
  next();
};

// ─── authenticateEither: cho phép cả user token và service token ─────────────
const authenticateEither = (req, res, next) => {
  // Nếu có X-Service-Token, dùng service auth
  if (req.headers['x-service-token']) {
    return authenticateService(req, res, next);
  }
  // Nếu không, dùng user auth
  return authenticate(req, res, next);
};

// ─── requireAdminOrService: cho phép admin user hoặc service token ────────────
const requireAdminOrService = (req, res, next) => {
  // Nếu đã auth bằng service token (không có req.user), cho phép
  if (!req.user) {
    return next();
  }
  // Nếu có req.user, kiểm tra role
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({
      success: false,
      message: 'Chỉ Admin mới có quyền thực hiện thao tác này',
      statusCode: 403,
    });
  }
  next();
};

// ─── Sử dụng cookie-parser cho refresh token trong cookie ─────────────────────
router.use(cookieParser());

// ════════════════════════════════════════════════════════════════════════════════
// Auth endpoints (không cần authenticate trước — dùng cho login/refresh)
// ════════════════════════════════════════════════════════════════════════════════

/**
 * POST /auth/login
 * Admin đăng nhập — kiểm tra role === ADMIN, set HttpOnly Cookie.
 */
router.post('/auth/login', adminCtrl.adminLogin);

/**
 * POST /auth/logout
 * Vô hiệu hóa refresh token (Bearer token optional vì có thể đã hết hạn).
 */
router.post('/auth/logout', adminCtrl.adminLogout);

/**
 * POST /auth/refresh
 * Làm mới access token từ HttpOnly Cookie hoặc body.refreshToken.
 */
router.post('/auth/refresh', adminCtrl.refreshToken);

/**
 * GET /auth/me
 * Lấy thông tin admin đang đăng nhập (restore session).
 */
router.get('/auth/me', authenticate, requireAdmin, adminCtrl.getMe);

// ════════════════════════════════════════════════════════════════════════════════
// READ-ONLY routes: cho phép cả Admin user và Service token (agent-service)
// ════════════════════════════════════════════════════════════════════════════════

// ─── Dashboard ────────────────────────────────────────────────────────────────
router.get('/admin/dashboard', authenticateEither, requireAdminOrService, adminCtrl.getDashboard);

// ─── Statistics (alias của dashboard) ────────────────────────────────────────
router.get('/admin/statistics', authenticateEither, requireAdminOrService, adminCtrl.getDashboard);

// ─── Users (READ-ONLY) ────────────────────────────────────────────────────────
router.get('/admin/users', authenticateEither, requireAdminOrService, adminCtrl.listUsers);
router.get('/admin/users/:id', authenticateEither, requireAdminOrService, adminCtrl.getUserById);
router.get('/admin/users/:id/rank-profile', authenticateEither, requireAdminOrService, adminCtrl.getUserRankProfile);
router.get('/admin/users/:id/xp-transactions', authenticateEither, requireAdminOrService, adminCtrl.getUserXpTransactions);
router.get('/admin/users/:id/rank-history', authenticateEither, requireAdminOrService, adminCtrl.getUserRankHistory);

// ─── Ranks (READ-ONLY) ────────────────────────────────────────────────────────
router.get('/admin/ranks', authenticateEither, requireAdminOrService, adminCtrl.listRanks);

// ════════════════════════════════════════════════════════════════════════════════
// WRITE routes: CHỈ cho phép Admin user (Bearer JWT + ADMIN role)
// ════════════════════════════════════════════════════════════════════════════════
router.use('/admin', authenticate, requireAdmin);

// ─── Users (WRITE) ────────────────────────────────────────────────────────────
router.post('/admin/users', adminCtrl.createUser);
router.patch('/admin/users/:id', adminCtrl.updateUser);

/**
 * POST /admin/users/:id/block   — Khóa tài khoản
 * POST /admin/users/:id/unblock — Mở khóa tài khoản
 */
router.post('/admin/users/:id/block', adminCtrl.blockUser);
router.post('/admin/users/:id/unblock', adminCtrl.unblockUser);

/**
 * POST /admin/users/:id/xp-adjustments — Tạo điều chỉnh XP thủ công (chỉ Admin user)
 */
router.post('/admin/users/:id/xp-adjustments', adminCtrl.adjustUserXp);

// ─── Rank Definitions (WRITE) ─────────────────────────────────────────────────

/**
 * PATCH /admin/ranks/:id   — Cập nhật rank (chỉ Admin user)
 */
router.patch('/admin/ranks/:id', adminCtrl.updateRank);

// ─── Audit Logs ───────────────────────────────────────────────────────────────

/**
 * GET /admin/audit-logs — Danh sách audit logs với đầy đủ filter
 */
router.get('/admin/audit-logs', adminCtrl.listAuditLogs);

module.exports = router;
