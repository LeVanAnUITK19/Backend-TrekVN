'use strict';
const Joi = require('joi');
const { AppError } = require('../utils/errors');
const id = Joi.string().hex().length(24);
const images = Joi.array().items(Joi.string().uri({ scheme: ['https'] }).max(2048)).max(5);
const postFields = {
  content: Joi.string().trim().max(10000).allow(''),
  images,
  type: Joi.string().valid('NORMAL', 'JOURNEY_SHARE', 'BADGE_SHARE'),
  journeyId: id.allow(null),
  trekkingPlaceId: id.allow(null),
  visibility: Joi.string().valid('PUBLIC', 'PRIVATE'),
};
const post = Joi.object(postFields);
const editPost = post.min(1);
const comment = Joi.object({ content: Joi.string().trim().min(1).max(2000).required(), parentCommentId: id });
const editComment = Joi.object({ content: Joi.string().trim().min(1).max(2000).required() });
const query = Joi.object({
  page: Joi.number().integer().min(1).max(10000).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  userId: Joi.string().max(128),
  type: postFields.type,
  trekkingPlaceId: id,
});
const commentQuery = Joi.object({
  page: Joi.number().integer().min(1).max(10000).default(1),
  limit: Joi.number().integer().min(1).max(100).default(50),
});
function validate(schema, source = 'body') {
  return (req, _res, next) => {
    const result = schema.validate(req[source], { abortEarly: false, allowUnknown: false });
    if (result.error) return next(new AppError(400, 'VALIDATION_ERROR', result.error.details.map((e) => e.message).join('; ')));
    req[source] = result.value;
    next();
  };
}
function validateIds(req, _res, next) {
  for (const value of Object.values(req.params)) {
    if (id.validate(value).error) return next(new AppError(400, 'INVALID_ID', 'ID không hợp lệ'));
  }
  next();
}
module.exports = { post, editPost, comment, editComment, query, commentQuery, validate, validateIds };
