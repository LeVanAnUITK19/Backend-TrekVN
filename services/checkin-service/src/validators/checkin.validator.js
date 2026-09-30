const Joi = require('joi');

// ─── Online check-in ──────────────────────────────────────────────────────────

// strip client-injected extra fields (userId, provinceId, trekkingPlaceId, ...)
// Dùng .unknown(false) là mặc định — extra fields sẽ bị validate.js stripUnknown trước khi đến đây
const createCheckinSchema = Joi.object({
  journeyId: Joi.string().trim().required().messages({
    'any.required': 'journeyId là bắt buộc',
    'string.empty': 'journeyId không được để trống',
  }),
  milestoneId: Joi.string().trim().required().messages({
    'any.required': 'milestoneId là bắt buộc',
    'string.empty': 'milestoneId không được để trống',
  }),
  latitude: Joi.number().min(-90).max(90).required().messages({
    'number.base': 'latitude phải là số',
    'number.min': 'latitude phải >= -90',
    'number.max': 'latitude phải <= 90',
    'any.required': 'latitude là bắt buộc',
  }),
  longitude: Joi.number().min(-180).max(180).required().messages({
    'number.base': 'longitude phải là số',
    'number.min': 'longitude phải >= -180',
    'number.max': 'longitude phải <= 180',
    'any.required': 'longitude là bắt buộc',
  }),
  accuracyMeters: Joi.number().positive().required().messages({
    'number.base': 'accuracyMeters phải là số dương',
    'any.required': 'accuracyMeters là bắt buộc',
  }),
  checkedAt: Joi.string().isoDate().required().messages({
    'string.isoDate': 'checkedAt phải là ISO 8601 date string',
    'any.required': 'checkedAt là bắt buộc',
  }),
});

// ─── Sync item schema ─────────────────────────────────────────────────────────

const syncItemSchema = Joi.object({
  clientCheckinId: Joi.string().trim().required().messages({
    'any.required': 'clientCheckinId là bắt buộc cho mỗi sync item',
    'string.empty': 'clientCheckinId không được để trống',
  }),
  journeyId: Joi.string().trim().required(),
  milestoneId: Joi.string().trim().required(),
  latitude: Joi.number().min(-90).max(90).required(),
  longitude: Joi.number().min(-180).max(180).required(),
  accuracyMeters: Joi.number().positive().required(),
  checkedAt: Joi.string().isoDate().required(),
});

const syncCheckinSchema = Joi.object({
  items: Joi.array().items(syncItemSchema).min(1).max(100).required().messages({
    'array.min': 'items phải có ít nhất 1 phần tử',
    'array.max': 'items không được quá 100 phần tử',
    'any.required': 'items là bắt buộc',
  }),
});

// ─── Province manual mark ─────────────────────────────────────────────────────

const manualMarkSchema = Joi.object({
  visited: Joi.boolean().required().messages({
    'any.required': 'visited là bắt buộc',
    'boolean.base': 'visited phải là boolean',
  }),
});

module.exports = {
  createCheckinSchema,
  syncCheckinSchema,
  manualMarkSchema,
};
