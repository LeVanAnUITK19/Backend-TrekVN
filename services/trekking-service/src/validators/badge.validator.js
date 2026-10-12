'use strict';

const Joi = require('joi');
const { BADGE_CATEGORIES, BADGE_RARITIES } = require('../constants/badge');

const { CONDITION_TYPES } = require('../services/badgeCondition');
const condition = Joi.object({
  type: Joi.string().valid(...CONDITION_TYPES).required(),
  value: Joi.number().positive().when('type', { is: 'SPECIFIC_PLACE', then: Joi.optional(), otherwise: Joi.required() }),
  placeId: Joi.string().pattern(/^[a-fA-F0-9]{24}$/).when('type', { is: 'SPECIFIC_PLACE', then: Joi.required(), otherwise: Joi.forbidden() }),
  unit: Joi.string().valid('KILOMETERS', 'METERS').when('type', { is: 'DISTANCE_TOTAL', then: Joi.optional(), otherwise: Joi.forbidden() }),
});

const createBadge = Joi.object({
  code: Joi.string().uppercase().trim().min(2).max(100).required(),
  name: Joi.string().trim().min(2).max(200).required(),
  description: Joi.string().max(2000).allow('', null),
  iconUrl: Joi.string().uri().allow('', null),
  category: Joi.string().valid(...BADGE_CATEGORIES).allow(null),
  rarity: Joi.string().valid(...BADGE_RARITIES).allow(null),
  condition: condition.required(),
  status: Joi.string().valid('ACTIVE', 'INACTIVE').default('ACTIVE'),
});

const updateBadge = Joi.object({
  name: Joi.string().trim().min(2).max(200),
  description: Joi.string().max(2000).allow('', null),
  iconUrl: Joi.string().uri().allow('', null),
  category: Joi.string().valid(...BADGE_CATEGORIES).allow(null),
  rarity: Joi.string().valid(...BADGE_RARITIES).allow(null),
  condition,
}).min(1);

const updateStatus = Joi.object({
  status: Joi.string().valid('ACTIVE', 'INACTIVE').required(),
});

module.exports = { createBadge, updateBadge, updateStatus };
