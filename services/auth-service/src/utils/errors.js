class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    Error.captureStackTrace(this, this.constructor);
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Not found') { super(message, 404); }
}

class BadRequestError extends AppError {
  constructor(message = 'Bad request') { super(message, 400); }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') { super(message, 401); }
}

class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') { super(message, 403); }
}

class TooManyRequestsError extends AppError {
  constructor(message = 'Too many requests') { super(message, 429); }
}

module.exports = { AppError, NotFoundError, BadRequestError, UnauthorizedError, ForbiddenError, TooManyRequestsError };
