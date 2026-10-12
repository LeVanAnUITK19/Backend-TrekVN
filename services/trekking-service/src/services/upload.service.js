'use strict';

/**
 * UploadService — generates Cloudinary presigned upload parameters.
 *
 * Client receives upload credentials, uploads directly to Cloudinary,
 * then sends back the publicUrl to update marker.images / contribution.images.
 *
 * Purposes:
 *   AVATAR              → auth-service handles this, not here
 *   JOURNEY_MARKER      → markers/
 *   PLACE_REVIEW        → reviews/
 *   ROUTE_CONTRIBUTION  → contributions/
 *   PLACE_SUGGESTION    → suggestions/
 *   GPX                 → gpx/  (raw upload)
 *
 * Cloudinary unsigned upload uses a signed timestamp to prevent abuse.
 * expireIn: 15 minutes (900 seconds).
 */

const cloudinary = require('../config/cloudinary');
const logger = require('../config/logger');

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
]);

const GPX_MIME_TYPES = new Set([
  'application/gpx+xml',
  'application/xml',
  'text/xml',
  'application/octet-stream',
]);

const MAX_FILE_SIZE_BYTES = {
  JOURNEY_MARKER: 10 * 1024 * 1024,     // 10 MB
  PLACE_REVIEW: 10 * 1024 * 1024,
  ROUTE_CONTRIBUTION: 20 * 1024 * 1024,
  PLACE_SUGGESTION: 20 * 1024 * 1024,
  GPX: 50 * 1024 * 1024,               // 50 MB for GPX files
};

const FOLDER_MAP = {
  JOURNEY_MARKER: 'trekvn/markers',
  PLACE_REVIEW: 'trekvn/reviews',
  ROUTE_CONTRIBUTION: 'trekvn/contributions',
  PLACE_SUGGESTION: 'trekvn/suggestions',
  GPX: 'trekvn/gpx',
};

const VALID_PURPOSES = Object.keys(FOLDER_MAP);

/**
 * Generate Cloudinary upload signature for client-side direct upload.
 * The client uses these params to POST directly to Cloudinary upload API.
 *
 * @param {object} opts
 * @param {string} opts.purpose - one of VALID_PURPOSES
 * @param {string} opts.fileName - original file name (sanitized)
 * @param {string} opts.contentType - MIME type
 * @param {number} opts.fileSizeBytes
 * @param {string} opts.userId - for folder scoping
 */
const generatePresignedUpload = (opts) => {
  const { purpose, fileName, contentType, fileSizeBytes, userId } = opts;

  // Validate purpose
  if (!VALID_PURPOSES.includes(purpose)) {
    const { BadRequestError } = require('../utils/errors');
    throw new BadRequestError(
      `purpose không hợp lệ. Phải là một trong: ${VALID_PURPOSES.join(', ')}`,
      'INVALID_PURPOSE'
    );
  }

  // Validate content type
  const allowedMimes = purpose === 'GPX' ? GPX_MIME_TYPES : ALLOWED_MIME_TYPES;
  if (!allowedMimes.has(contentType)) {
    const { BadRequestError } = require('../utils/errors');
    throw new BadRequestError(
      `contentType không hợp lệ cho purpose ${purpose}`,
      'INVALID_CONTENT_TYPE'
    );
  }

  // Validate file size
  const maxSize = MAX_FILE_SIZE_BYTES[purpose] || 10 * 1024 * 1024;
  if (fileSizeBytes > maxSize) {
    const { BadRequestError } = require('../utils/errors');
    throw new BadRequestError(
      `File quá lớn. Tối đa ${Math.round(maxSize / 1024 / 1024)}MB cho ${purpose}`,
      'FILE_TOO_LARGE'
    );
  }

  const folder = FOLDER_MAP[purpose];
  // Backend controls the public_id — client cannot choose arbitrary path
  const safeFileName = (fileName || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
  const objectKey = `${folder}/${userId}/${Date.now()}_${safeFileName}`;

  const timestamp = Math.round(Date.now() / 1000);
  const EXPIRE_IN = 900; // 15 minutes

  // Build params to sign
  const paramsToSign = {
    folder,
    public_id: objectKey,
    timestamp,
  };

  const signature = cloudinary.utils.api_sign_request(
    paramsToSign,
    process.env.CLOUDINARY_API_SECRET
  );

  const publicUrl = cloudinary.url(objectKey, {
    resource_type: purpose === 'GPX' ? 'raw' : 'image',
    fetch_format: purpose === 'GPX' ? undefined : 'auto',
    quality: purpose === 'GPX' ? undefined : 'auto',
  });

  logger.info(`[UploadService] Presign generated for purpose=${purpose} userId=${userId}`);

  return {
    uploadUrl: `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/${purpose === 'GPX' ? 'raw' : 'image'}/upload`,
    objectKey,
    publicUrl,
    expiresIn: EXPIRE_IN,
    // Cloudinary upload params (client sends these in the multipart form)
    uploadParams: {
      api_key: process.env.CLOUDINARY_API_KEY,
      timestamp,
      signature,
      folder,
      public_id: objectKey,
    },
  };
};

module.exports = { generatePresignedUpload, VALID_PURPOSES };
