/**
 * Error classes cho checkin-service.
 * Mỗi class mang error code để trả về trong response theo spec.
 */

class AppError extends Error {
  constructor(message, statusCode, code, details = {}) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Not found', code = 'NOT_FOUND', details = {}) {
    super(message, 404, code, details);
  }
}

class BadRequestError extends AppError {
  constructor(message = 'Bad request', code = 'VALIDATION_ERROR', details = {}) {
    super(message, 400, code, details);
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized', code = 'AUTH_REQUIRED') {
    super(message, 401, code);
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Forbidden', code = 'FORBIDDEN') {
    super(message, 403, code);
  }
}

class ConflictError extends AppError {
  constructor(message = 'Conflict', code = 'CONFLICT', details = {}) {
    super(message, 409, code, details);
  }
}

class BusinessError extends AppError {
  constructor(message, code, details = {}) {
    super(message, 422, code, details);
  }
}

class ServiceUnavailableError extends AppError {
  constructor(message = 'Service unavailable', code = 'TREKKING_SERVICE_UNAVAILABLE') {
    super(message, 503, code);
  }
}

module.exports = {
  AppError,
  NotFoundError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  BusinessError,
  ServiceUnavailableError,
};
