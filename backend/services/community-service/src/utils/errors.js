'use strict';
class AppError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}
const notFound = () => new AppError(404, 'NOT_FOUND', 'Không tìm thấy nội dung hoặc bạn không có quyền xem');
const forbidden = () => new AppError(403, 'FORBIDDEN', 'Bạn không có quyền thay đổi nội dung này');
module.exports = { AppError, notFound, forbidden };
