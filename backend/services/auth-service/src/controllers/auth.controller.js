const authService = require('../services/auth.service');

// ─── Auth ─────────────────────────────────────────────────────────────────────

const register = async (req, res, next) => {
  try {
    const result = await authService.register(req.body);
    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
};

const verifyEmail = async (req, res, next) => {
  try {
    const result = await authService.verifyEmail(req.body);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const resendVerificationOtp = async (req, res, next) => {
  try {
    const result = await authService.resendVerificationOtp(req.body);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const login = async (req, res, next) => {
  try {
    const result = await authService.login(req.body);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const refresh = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    const result = await authService.refresh(refreshToken);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const logout = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    await authService.logout(req.user?.id, refreshToken);
    res.json({ success: true, message: 'Đăng xuất thành công' });
  } catch (err) { next(err); }
};

const verifyToken = (req, res, next) => {
  try {
    res.json({ success: true, data: req.user });
  } catch (err) { next(err); }
};

const forgotPassword = async (req, res, next) => {
  try {
    const result = await authService.forgotPassword(req.body);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const verifyResetOtp = async (req, res, next) => {
  try {
    const result = await authService.verifyResetOtp(req.body);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const resetPassword = async (req, res, next) => {
  try {
    const result = await authService.resetPassword(req.body);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

// ─── Profile ──────────────────────────────────────────────────────────────────

const getMe = async (req, res, next) => {
  try {
    const user = await authService.getProfile(req.user.id);
    res.json({ success: true, data: user });
  } catch (err) { next(err); }
};

const updateMe = async (req, res, next) => {
  try {
    const user = await authService.updateProfile(req.user.id, req.body);
    res.json({ success: true, data: user });
  } catch (err) { next(err); }
};

const changePassword = async (req, res, next) => {
  try {
    const result = await authService.changePassword(req.user.id, req.body);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const uploadAvatar = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Không có file ảnh được gửi lên' });
    }
    const { uploadAvatar: upload } = require('../services/upload.service');
    const avatarUrl = await upload(req.file.buffer, req.user.id);
    const user = await authService.updateProfile(req.user.id, { avatarUrl });
    res.json({ success: true, data: user });
  } catch (err) { next(err); }
};

const updateBio = async (req, res, next) => {
  try {
    const user = await authService.updateProfile(req.user.id, { bio: req.body.bio });
    res.json({ success: true, data: user });
  } catch (err) { next(err); }
};

// ─── Google Sign-In ───────────────────────────────────────────────────────────

const googleSignIn = async (req, res, next) => {
  try {
    const { idToken } = req.body;
    const { googleSignIn: doGoogleSignIn } = require('../services/googleAuth.service');
    const result = await doGoogleSignIn(idToken);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

// ─── Settings ─────────────────────────────────────────────────────────────────

const getSettings = async (req, res, next) => {
  try {
    const settings = await authService.getSettings(req.user.id);
    res.json({ success: true, data: settings });
  } catch (err) { next(err); }
};

const updateSettings = async (req, res, next) => {
  try {
    const settings = await authService.updateSettings(req.user.id, req.body);
    res.json({ success: true, data: settings });
  } catch (err) { next(err); }
};

module.exports = {
  register, verifyEmail, resendVerificationOtp,
  login, refresh, logout, verifyToken,
  forgotPassword, verifyResetOtp, resetPassword,
  googleSignIn,
  getMe, updateMe, changePassword, uploadAvatar, updateBio,
  getSettings, updateSettings,
};
