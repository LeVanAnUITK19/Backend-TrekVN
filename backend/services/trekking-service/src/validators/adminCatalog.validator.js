'use strict';
const Joi = require('joi');
const pagination = { page: Joi.number().integer().min(1).max(10000).default(1), limit: Joi.number().integer().min(1).max(100).default(20), search: Joi.string().trim().max(200).allow('') };
const reviews = Joi.object({ ...pagination, placeId: Joi.string().hex().length(24), point: Joi.number().integer().min(1).max(5), status: Joi.string().valid('ACTIVE', 'DELETED', 'ALL').default('ACTIVE') });
const maps = Joi.object({ ...pagination, available: Joi.string().valid('all', 'true', 'false').default('true') });
module.exports = { reviews, maps };
