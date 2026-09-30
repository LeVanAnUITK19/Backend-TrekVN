const { BadRequestError } = require('../utils/errors');

/**
 * Middleware validate request body bằng Joi schema.
 * Dùng: router.post('/path', validate(mySchema), controller)
 */
const validate = (schema) => (req, _res, next) => {
  // stripUnknown: silently drop extra fields client gửi lên (userId, provinceId, ...)
  const { error, value } = schema.validate(req.body, { abortEarly: false, stripUnknown: true });
  if (!error) { req.body = value; }
  if (error) {
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
  }
  next();
};

module.exports = { validate };
