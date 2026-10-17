'use strict';

const { Readable } = require('stream');
const cloudinary = require('../config/cloudinary');
const logger = require('../config/logger');

/**
 * Upload buffer lên Cloudinary dùng upload_stream (không cần file trên disk).
 *
 * @param {Buffer} buffer     - File buffer từ multer memoryStorage
 * @param {string} userId     - Dùng làm public_id → mỗi user chỉ có 1 avatar slot
 * @param {string} folder     - Cloudinary folder (default: 'avatars')
 * @returns {Promise<string>} - secure_url của ảnh đã upload
 */
const uploadAvatar = (buffer, userId, folder = 'trekvn/avatars') => {
  return new Promise((resolve, reject) => {
    const uploadOptions = {
      folder,
      public_id: `user_${userId}`,   // overwrite ảnh cũ cùng userId
      overwrite: true,
      resource_type: 'image',
      transformation: [
        { width: 400, height: 400, crop: 'fill', gravity: 'face' },
        { quality: 'auto:good' },
        { fetch_format: 'auto' },
      ],
    };

    const uploadStream = cloudinary.uploader.upload_stream(
      uploadOptions,
      (error, result) => {
        if (error) {
          logger.error(`[Cloudinary] Upload failed for user ${userId}: ${error.message}`);
          return reject(error);
        }
        logger.info(`[Cloudinary] Avatar uploaded for user ${userId}: ${result.secure_url}`);
        resolve(result.secure_url);
      }
    );

    // Chuyển buffer thành Readable stream rồi pipe vào upload_stream
    const readable = new Readable();
    readable.push(buffer);
    readable.push(null);
    readable.pipe(uploadStream);
  });
};

/**
 * Xóa avatar của user khỏi Cloudinary (dùng khi user đổi hoặc xóa avatar).
 * Không throw nếu không tồn tại — fail-safe.
 *
 * @param {string} userId
 * @param {string} folder
 */
const deleteAvatar = async (userId, folder = 'trekvn/avatars') => {
  try {
    const publicId = `${folder}/user_${userId}`;
    await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
    logger.info(`[Cloudinary] Avatar deleted for user ${userId}`);
  } catch (err) {
    logger.warn(`[Cloudinary] Failed to delete avatar for user ${userId}: ${err.message}`);
  }
};

module.exports = { uploadAvatar, deleteAvatar };
