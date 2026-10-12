'use strict';

const { Readable } = require('stream');
const cloudinary = require('../config/cloudinary');
const logger = require('../config/logger');

/**
 * Upload marker image lên Cloudinary.
 * Dùng upload_stream để không cần ghi file ra disk.
 *
 * @param {Buffer} buffer    - File buffer từ multer memoryStorage
 * @param {string} markerId  - Dùng làm public_id prefix
 * @param {string} folder    - Cloudinary folder
 * @returns {Promise<string>} secure_url
 */
const uploadMarkerImage = (buffer, markerId, folder = 'trekvn/markers') => {
  return new Promise((resolve, reject) => {
    const uploadOptions = {
      folder,
      public_id: `marker_${markerId}_${Date.now()}`,
      resource_type: 'image',
      transformation: [
        { width: 1200, height: 1200, crop: 'limit' },
        { quality: 'auto:good' },
        { fetch_format: 'auto' },
      ],
    };

    const uploadStream = cloudinary.uploader.upload_stream(
      uploadOptions,
      (error, result) => {
        if (error) {
          logger.error(`[Cloudinary] Marker image upload failed for ${markerId}: ${error.message}`);
          return reject(error);
        }
        logger.info(`[Cloudinary] Marker image uploaded: ${result.secure_url}`);
        resolve(result.secure_url);
      }
    );

    const readable = new Readable();
    readable.push(buffer);
    readable.push(null);
    readable.pipe(uploadStream);
  });
};

/**
 * Upload contribution image lên Cloudinary.
 */
const uploadContributionImage = (buffer, submissionId, folder = 'trekvn/contributions') => {
  return new Promise((resolve, reject) => {
    const uploadOptions = {
      folder,
      public_id: `contribution_${submissionId}_${Date.now()}`,
      resource_type: 'image',
      transformation: [
        { width: 1600, height: 1600, crop: 'limit' },
        { quality: 'auto:good' },
        { fetch_format: 'auto' },
      ],
    };

    const uploadStream = cloudinary.uploader.upload_stream(
      uploadOptions,
      (error, result) => {
        if (error) {
          logger.error(`[Cloudinary] Contribution image upload failed: ${error.message}`);
          return reject(error);
        }
        resolve(result.secure_url);
      }
    );

    const readable = new Readable();
    readable.push(buffer);
    readable.push(null);
    readable.pipe(uploadStream);
  });
};

/**
 * Delete image từ Cloudinary theo URL.
 * Fail-safe: không throw nếu không tìm thấy.
 */
const deleteImage = async (imageUrl) => {
  try {
    // Extract public_id từ URL
    const parts = imageUrl.split('/');
    const filename = parts[parts.length - 1].split('.')[0];
    const folder = parts[parts.length - 2];
    const publicId = `${folder}/${filename}`;
    await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
    logger.info(`[Cloudinary] Deleted image: ${publicId}`);
  } catch (err) {
    logger.warn(`[Cloudinary] Failed to delete image ${imageUrl}: ${err.message}`);
  }
};

/**
 * Upload admin place image lên Cloudinary.
 * Dùng cho admin khi thêm/sửa địa điểm qua Web Admin.
 *
 * @param {Buffer} buffer   - File buffer từ multer memoryStorage
 * @param {string} placeId  - Dùng làm public_id prefix
 * @param {string} folder   - Cloudinary folder
 * @returns {Promise<string>} secure_url
 */
const uploadPlaceImage = (buffer, placeId, folder = 'trekvn/places') => {
  return new Promise((resolve, reject) => {
    const uploadOptions = {
      folder,
      public_id: `place_${placeId}_${Date.now()}`,
      resource_type: 'image',
      transformation: [
        { width: 1600, height: 1200, crop: 'limit' },
        { quality: 'auto:good' },
        { fetch_format: 'auto' },
      ],
    };

    const uploadStream = cloudinary.uploader.upload_stream(
      uploadOptions,
      (error, result) => {
        if (error) {
          logger.error(`[Cloudinary] Place image upload failed for ${placeId}: ${error.message}`);
          return reject(error);
        }
        logger.info(`[Cloudinary] Place image uploaded: ${result.secure_url}`);
        resolve(result.secure_url);
      }
    );

    const readable = new Readable();
    readable.push(buffer);
    readable.push(null);
    readable.pipe(uploadStream);
  });
};

/**
 * Upload admin place map image lên Cloudinary.
 *
 * @param {Buffer} buffer   - File buffer từ multer memoryStorage
 * @param {string} placeId  - Dùng làm public_id prefix
 * @returns {Promise<string>} secure_url
 */
const uploadPlaceMapImage = (buffer, placeId) => {
  return new Promise((resolve, reject) => {
    const uploadOptions = {
      folder: 'trekvn/places/maps',
      public_id: `place_map_${placeId}_${Date.now()}`,
      resource_type: 'image',
      transformation: [
        { width: 2400, height: 2400, crop: 'limit' },
        { quality: 'auto:best' },
        { fetch_format: 'auto' },
      ],
    };

    const uploadStream = cloudinary.uploader.upload_stream(
      uploadOptions,
      (error, result) => {
        if (error) {
          logger.error(`[Cloudinary] Place map image upload failed for ${placeId}: ${error.message}`);
          return reject(error);
        }
        logger.info(`[Cloudinary] Place map image uploaded: ${result.secure_url}`);
        resolve(result.secure_url);
      }
    );

    const readable = new Readable();
    readable.push(buffer);
    readable.push(null);
    readable.pipe(uploadStream);
  });
};

module.exports = { uploadMarkerImage, uploadContributionImage, uploadPlaceImage, uploadPlaceMapImage, deleteImage };
