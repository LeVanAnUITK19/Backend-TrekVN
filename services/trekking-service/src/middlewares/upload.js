'use strict';

const multer = require('multer');
const { BadRequestError } = require('../utils/errors');

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB cho marker/contribution images

const fileFilter = (_req, file, cb) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new BadRequestError(
      `Định dạng file không được hỗ trợ: ${file.mimetype}. Chỉ chấp nhận: ${ALLOWED_MIME_TYPES.join(', ')}`,
      'UNSUPPORTED_MEDIA_TYPE'
    ), false);
  }
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter,
});

module.exports = { upload };
