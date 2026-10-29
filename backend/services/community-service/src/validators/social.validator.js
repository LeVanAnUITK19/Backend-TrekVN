'use strict';
const Joi = require('joi');
const id = Joi.string().hex().length(24);
const page = { page: Joi.number().integer().min(1).max(10000).default(1), limit: Joi.number().integer().min(1).max(100).default(20) };
module.exports = {
  page: Joi.object(page),
  discovery: Joi.object({ email: Joi.string().email().max(254).trim().lowercase(), qr: Joi.string().pattern(/^trekviet:\/\/community\/user\/[a-f0-9]{48}$/) }).xor('email', 'qr'),
  profile: Joi.object({ bio: Joi.string().trim().max(500).allow('').required() }),
  direct: Joi.object({ userId: id.required() }),
  group: Joi.object({ name: Joi.string().trim().min(1).max(100).required(), memberIds: Joi.array().items(id.required()).unique().min(1).max(49).required() }),
  groupEdit: Joi.object({ name: Joi.string().trim().min(1).max(100), ownerId: id }).min(1),
  member: Joi.object({ userId: id.required() }),
  message: Joi.object({ content: Joi.string().trim().min(1).max(4000).required(), clientMessageId: Joi.string().pattern(/^[a-zA-Z0-9_-]{8,80}$/).required() }),
  messages: Joi.object({ before: Joi.number().integer().min(1), limit: page.limit }),
  read: Joi.object({ sequence: Joi.number().integer().min(0).required() }),
  reason: Joi.object({ reason: Joi.string().trim().min(3).max(1000).required() }),
  resolve: Joi.object({ action: Joi.string().valid('REMOVE', 'DISMISS').required(), reason: Joi.string().trim().min(3).max(1000).required() }),
  adminGroups: Joi.object({ ...page, disabled: Joi.boolean() }),
  reports: Joi.object({ ...page, status: Joi.string().valid('OPEN', 'RESOLVED', 'DISMISSED') }),
};
