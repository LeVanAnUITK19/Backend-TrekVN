'use strict';

const multer = require('multer');

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Multer middleware dùng memory storage.
 * File không được ghi ra disk — buffer được upload thẳng lên Cloudinary.
 *
 * Giới hạn:
 *   - Loại file: JPEG, PNG, WebP, GIF
 *   - Kích thước tối đa: 5 MB
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter(_req, file, cb) {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        Object.assign(new Error('Chỉ chấp nhận ảnh JPEG, PNG, WebP hoặc GIF'), {
          statusCode: 400,
          code: 'INVALID_FILE_TYPE',
        })
      );
    }
  },
});

module.exports = upload;
