'use strict';
const Joi = require('joi');
const id = Joi.string().hex().length(24);
const list = Joi.object({
  page: Joi.number().integer().min(1).max(10000).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  search: Joi.string().trim().max(200).allow(''),
  status: Joi.string().valid('ACTIVE', 'HIDDEN', 'DELETED'),
  authorId: Joi.string().trim().max(128),
  postId: id,
});
const posts = list.keys({
  visibility: Joi.string().valid('PUBLIC', 'PRIVATE'),
  type: Joi.string().valid('NORMAL', 'JOURNEY_SHARE', 'BADGE_SHARE'),
}).fork('postId', (schema) => schema.forbidden());
const moderation = Joi.object({ reason: Joi.string().trim().min(3).max(1000).required() });
module.exports = { posts, comments: list, moderation };
