'use strict';

const Joi = require('joi');

const createReview = Joi.object({
  point: Joi.number().integer().min(1).max(5).required(),
  isAnonymous: Joi.boolean().default(false),
  content: Joi.string().max(5000).allow('', null),
  imagesUrl: Joi.array().items(Joi.string().uri()).max(10).default([]),
  videoUrl: Joi.array().items(Joi.string().uri()).max(3).default([]),
});

const updateReview = Joi.object({
  point: Joi.number().integer().min(1).max(5),
  isAnonymous: Joi.boolean(),
  content: Joi.string().max(5000).allow('', null),
  imagesUrl: Joi.array().items(Joi.string().uri()).max(10),
  videoUrl: Joi.array().items(Joi.string().uri()).max(3),
}).min(1);

module.exports = { createReview, updateReview };
