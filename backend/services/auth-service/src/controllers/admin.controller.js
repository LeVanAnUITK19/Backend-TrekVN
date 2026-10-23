'use strict';

const adminService = require('../services/admin.service');
const authService = require('../services/auth.service');

// ─── Helper: lấy thông tin admin từ req ──────────────────────────────────────
const getAdminInfo = (req) => ({
  name: req.user.displayName || req.user.email || 'Admin',
  email: req.user.email,
  ipAddress: req.ip || req.headers['x-forwarded-for'] || null,
});

// ─── Auth (admin-specific) ────────────────────────────────────────────────────

/**
 * POST /auth/login — Admin login.
 * Tái sử dụng auth.service.login nhưng thêm guard: role phải là ADMIN.
 * Refresh token được set vào HttpOnly Cookie VÀ trả trong body (BR-11).
 */
const adminLogin = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const result = await authService.login({ email, password });

    const user = result.user;

    // Guard: chỉ ADMIN mới đăng nhập được qua admin portal
    if (user.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Tài khoản không có quyền truy cập Admin Portal',
        statusCode: 403,
      });
    }

    // Ghi audit log LOGIN
    await adminService.writeAuditLog({
      adminId: user.userId || user._id,
      adminName: user.displayName || user.name,
      adminEmail: user.email,
      action: 'LOGIN',
      entityType: 'USER',
      entityId: String(user.userId || user._id),
      afterSummary: { email: user.email },
      result: 'SUCCESS',
      ipAddress: req.ip || req.headers['x-forwarded-for'] || null,
    });

    // Set HttpOnly cookie
    const cookieMaxAge = (parseInt(process.env.JWT_REFRESH_EXPIRES_DAYS) || 30) * 24 * 60 * 60 * 1000;
    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: cookieMaxAge,
      path: '/',
    });

    res.json({
      success: true,
      data: {
        accessToken: result.accessToken,
        user: {
          id: user.userId || user._id,
          email: user.email,
          name: user.displayName || user.email || 'Admin',
          role: user.role,
          status: user.status,
          avatarUrl: user.avatarUrl ?? null,
          createdAt: user.createdAt,
        },
      },
    });
  } catch (err) { next(err); }
};

/**
 * POST /auth/logout — Admin logout (vô hiệu hóa refresh token).
 */
const adminLogout = async (req, res, next) => {
  try {
    // Lấy refresh token từ cookie hoặc body
    const rawRefreshToken =
      req.cookies?.refreshToken || req.body?.refreshToken || null;

    if (req.user) {
      await adminService.writeAuditLog({
        adminId: req.user.id,
        adminName: req.user.email,
        adminEmail: req.user.email,
        action: 'LOGOUT',
        entityType: 'USER',
        entityId: String(req.user.id),
        result: 'SUCCESS',
        ipAddress: req.ip || null,
      });
    }

    await authService.logout(req.user?.id, rawRefreshToken);

    res.clearCookie('refreshToken', { path: '/' });
    res.json({ success: true, message: 'Đăng xuất thành công' });
  } catch (err) { next(err); }
};

/**
 * GET /auth/me — Thông tin admin đang đăng nhập.
 */
const getMe = async (req, res, next) => {
  try {
    const profile = await authService.getProfile(req.user.id);

    if (profile.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Tài khoản không có quyền truy cập Admin Portal',
        statusCode: 403,
      });
    }

    res.json({
      success: true,
      data: {
        id: profile.userId || profile.id,
        email: profile.email,
        name: profile.displayName || profile.email || 'Admin',
        role: profile.role,
        status: profile.status,
        avatarUrl: profile.avatarUrl ?? null,
        createdAt: profile.createdAt,
      },
    });
  } catch (err) { next(err); }
};

/**
 * POST /auth/refresh — Làm mới access token.
 * Ưu tiên cookie, fallback body.
 */
const refreshToken = async (req, res, next) => {
  try {
    const rawRefreshToken =
      req.cookies?.refreshToken || req.body?.refreshToken;

    const result = await authService.refresh(rawRefreshToken);

    // Rotate cookie
    const cookieMaxAge = (parseInt(process.env.JWT_REFRESH_EXPIRES_DAYS) || 30) * 24 * 60 * 60 * 1000;
    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: cookieMaxAge,
      path: '/',
    });

    res.json({ success: true, data: { accessToken: result.accessToken } });
  } catch (err) { next(err); }
};

// ─── Dashboard ────────────────────────────────────────────────────────────────

const getDashboard = async (req, res, next) => {
  try {
    const range = req.query.range || '7d'; // 7d, 30d, or 90d
    const data = await adminService.getDashboard(range);
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

// ─── Users ────────────────────────────────────────────────────────────────────

const listUsers = async (req, res, next) => {
  try {
    const result = await adminService.listUsers(req.query);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const createUser = async (req, res, next) => {
  try {
    const adminInfo = getAdminInfo(req);
    const user = await adminService.adminCreateUser(req.user.id, adminInfo, req.body);
    res.status(201).json({ success: true, data: user });
  } catch (err) { next(err); }
};

const getUserById = async (req, res, next) => {
  try {
    const user = await adminService.getUserById(req.params.id);
    res.json({ success: true, data: user });
  } catch (err) { next(err); }
};

const updateUser = async (req, res, next) => {
  try {
    const adminInfo = getAdminInfo(req);
    const user = await adminService.updateUser(req.user.id, adminInfo, req.params.id, req.body);
    res.json({ success: true, data: user });
  } catch (err) { next(err); }
};

const blockUser = async (req, res, next) => {
  try {
    const adminInfo = getAdminInfo(req);
    const { reason } = req.body;
    const user = await adminService.blockUser(req.user.id, adminInfo, req.params.id, reason);
    res.json({ success: true, data: user });
  } catch (err) { next(err); }
};

const unblockUser = async (req, res, next) => {
  try {
    const adminInfo = getAdminInfo(req);
    const user = await adminService.unblockUser(req.user.id, adminInfo, req.params.id);
    res.json({ success: true, data: user });
  } catch (err) { next(err); }
};

// ─── User Gamification ────────────────────────────────────────────────────────

const getUserRankProfile = async (req, res, next) => {
  try {
    const data = await adminService.getUserRankProfile(req.params.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

const getUserXpTransactions = async (req, res, next) => {
  try {
    const result = await adminService.getUserXpTransactions(req.params.id, req.query);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const adjustUserXp = async (req, res, next) => {
  try {
    const adminInfo = getAdminInfo(req);
    const { xpAmount, reason, description } = req.body;
    const transaction = await adminService.adjustUserXp(
      req.user.id,
      adminInfo,
      req.params.id,
      { xpAmount, reason, description }
    );
    res.status(201).json({ success: true, data: transaction });
  } catch (err) { next(err); }
};

const getUserRankHistory = async (req, res, next) => {
  try {
    const result = await adminService.getUserRankHistory(req.params.id, req.query);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

// ─── Ranks ────────────────────────────────────────────────────────────────────

const listRanks = async (req, res, next) => {
  try {
    const data = await adminService.listRanks();
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

const updateRank = async (req, res, next) => {
  try {
    const adminInfo = getAdminInfo(req);
    const data = await adminService.updateRank(req.user.id, adminInfo, req.params.id, req.body);
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

// ─── Audit Logs ───────────────────────────────────────────────────────────────

const listAuditLogs = async (req, res, next) => {
  try {
    const result = await adminService.listAuditLogs(req.query);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

module.exports = {
  // Auth
  adminLogin, adminLogout, getMe, refreshToken,
  // Dashboard
  getDashboard,
  // Users
  listUsers, createUser, getUserById, updateUser, blockUser, unblockUser,
  // Gamification
  getUserRankProfile, getUserXpTransactions, adjustUserXp, getUserRankHistory,
  // Ranks
  listRanks, updateRank,
  // Audit
  listAuditLogs,
};
