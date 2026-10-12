'use strict';

/**
 * Error classes cho trekking-service.
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
  constructor(message = 'Unauthorized', code = 'UNAUTHORIZED') {
    super(message, 401, code);
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Forbidden', code = 'FORBIDDEN', details = {}) {
    super(message, 403, code, details);
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
  constructor(message = 'Service unavailable', code = 'SERVICE_UNAVAILABLE') {
    super(message, 503, code);
  }
}

// ─── Domain-specific error factories ─────────────────────────────────────────

const Errors = {
  journeyNotFound: (id) =>
    new NotFoundError(`Journey "${id}" không tồn tại`, 'JOURNEY_NOT_FOUND'),

  journeyNotOwner: () =>
    new ForbiddenError('Bạn không có quyền thao tác với journey này', 'JOURNEY_NOT_OWNER'),

  journeyInvalidState: (current, expected) =>
    new BusinessError(
      `Trạng thái journey không hợp lệ: hiện là "${current}", cần "${expected}"`,
      'JOURNEY_INVALID_STATE',
      { current, expected }
    ),

  journeyAlreadyCompleted: () =>
    new ConflictError('Journey này đã hoàn thành', 'JOURNEY_ALREADY_COMPLETED'),

  placeNotFound: (id) =>
    new NotFoundError(`Địa điểm "${id}" không tồn tại`, 'PLACE_NOT_FOUND'),

  routeNotFound: (id) =>
    new NotFoundError(`Tuyến đường "${id}" không tồn tại`, 'ROUTE_NOT_FOUND'),

  milestoneNotFound: (id) =>
    new NotFoundError(`Milestone "${id}" không tồn tại`, 'MILESTONE_NOT_FOUND'),

  markerNotFound: (id) =>
    new NotFoundError(`Marker "${id}" không tồn tại`, 'MARKER_NOT_FOUND'),

  markerDuplicate: (clientMarkerId) =>
    new ConflictError(
      `Marker với clientMarkerId "${clientMarkerId}" đã tồn tại`,
      'MARKER_DUPLICATE',
      { clientMarkerId }
    ),

  markerNotOwner: () =>
    new ForbiddenError('Bạn không có quyền thao tác với marker này', 'MARKER_NOT_OWNER'),

  reviewNotFound: (id) =>
    new NotFoundError(`Review "${id}" không tồn tại`, 'REVIEW_NOT_FOUND'),

  reviewNotOwner: () =>
    new ForbiddenError('Bạn không có quyền thao tác với review này', 'REVIEW_NOT_OWNER'),

  contributionNotFound: (id) =>
    new NotFoundError(`Contribution "${id}" không tồn tại`, 'CONTRIBUTION_NOT_FOUND'),

  contributionNotOwner: () =>
    new ForbiddenError('Bạn không có quyền thao tác với contribution này', 'CONTRIBUTION_NOT_OWNER'),

  contributionInvalidState: (current) =>
    new BusinessError(
      `Contribution ở trạng thái "${current}" không thể thực hiện thao tác này`,
      'CONTRIBUTION_INVALID_STATE',
      { current }
    ),

  contributionAlreadyReviewed: (id) =>
    new ConflictError(
      `Contribution "${id}" đã được review bởi người khác`,
      'CONTRIBUTION_ALREADY_REVIEWED',
      { id }
    ),

  idempotencyConflict: (key) =>
    new ConflictError(
      `Idempotency key "${key}" đã được dùng`,
      'IDEMPOTENCY_CONFLICT',
      { key }
    ),

  badgeNotFound: (id) =>
    new NotFoundError(`Badge "${id}" không tồn tại`, 'BADGE_NOT_FOUND'),
};

module.exports = {
  AppError,
  NotFoundError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  BusinessError,
  ServiceUnavailableError,
  Errors,
};
