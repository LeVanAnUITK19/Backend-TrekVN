const Joi = require('joi');

const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  displayName: Joi.string().min(2).max(100).required(),
});

const verifyEmailSchema = Joi.object({
  email: Joi.string().email().required(),
  otp: Joi.string().length(6).pattern(/^\d+$/).required(),
});

const resendOtpSchema = Joi.object({
  email: Joi.string().email().required(),
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

const forgotPasswordSchema = Joi.object({
  email: Joi.string().email().required(),
});

const verifyResetOtpSchema = Joi.object({
  email: Joi.string().email().required(),
  otp: Joi.string().length(6).pattern(/^\d+$/).required(),
});

const resetPasswordSchema = Joi.object({
  resetToken: Joi.string().required(),
  newPassword: Joi.string().min(6).required(),
});

const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: Joi.string().min(6).required(),
});

const updateProfileSchema = Joi.object({
  displayName: Joi.string().min(2).max(100),
  avatarUrl: Joi.string().uri().allow(null, ''),
  bio: Joi.string().max(500).allow(null, ''),
}).min(1);

const updateSettingsSchema = Joi.object({
  language: Joi.string().valid('vi', 'en'),
  theme: Joi.string().valid('light', 'dark'),
  distanceUnit: Joi.string().valid('km', 'mi'),
  notificationEnabled: Joi.boolean(),
}).min(1);

module.exports = {
  registerSchema,
  verifyEmailSchema,
  resendOtpSchema,
  loginSchema,
  forgotPasswordSchema,
  verifyResetOtpSchema,
  resetPasswordSchema,
  changePasswordSchema,
  updateProfileSchema,
  updateSettingsSchema,
};
