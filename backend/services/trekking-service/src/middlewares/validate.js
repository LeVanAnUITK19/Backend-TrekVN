'use strict';

const { BadRequestError } = require('../utils/errors');

/**
 * Middleware validate request body bằng Joi schema.
 * stripUnknown: silently drop extra fields client gửi lên
 * (prevents userId injection từ body).
 */
const validate = (schema) => (req, _res, next) => {
  const { error, value } = schema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (!error) {
    req.body = value;
    return next();
  }

  const details = {};
  error.details.forEach((d) => {
    const field = d.path.join('.');
    details[field] = d.message;
  });

  return next(
    new BadRequestError(
      error.details.map((d) => d.message).join('; '),
      'VALIDATION_ERROR',
      details
    )
  );
};

/**
 * Validate query params.
 */
const validateQuery = (schema) => (req, _res, next) => {
  const { error, value } = schema.validate(req.query, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (!error) {
    req.query = value;
    return next();
  }

  const details = {};
  error.details.forEach((d) => {
    const field = d.path.join('.');
    details[field] = d.message;
  });

  return next(
    new BadRequestError(
      error.details.map((d) => d.message).join('; '),
      'VALIDATION_ERROR',
      details
    )
  );
};

module.exports = { validate, validateQuery };
