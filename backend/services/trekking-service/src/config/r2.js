'use strict';

/**
 * Cloudflare R2 public configuration.
 *
 * Chỉ cần R2_PUBLIC_BASE_URL — bucket hiện public nên client tải thẳng.
 * KHÔNG đưa R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY vào client (Flutter).
 *
 * Build download URL:
 *   buildR2Url(objectKey)  →  "https://pub-xxx.r2.dev/ba-den/v1/ba-den-v1-flutter.zip"
 */

const R2_PUBLIC_BASE_URL = (process.env.R2_PUBLIC_BASE_URL || '').replace(/\/$/, '');

if (!R2_PUBLIC_BASE_URL) {
  // Cảnh báo lúc startup — không crash, offline map sẽ trả downloadUrl = null
  console.warn('[r2] WARNING: R2_PUBLIC_BASE_URL is not set. Offline map downloadUrl will be null.');
}

/**
 * Build full download URL từ objectKey.
 * @param {string|null|undefined} objectKey  e.g. "ba-den/v1/ba-den-v1-flutter.zip"
 * @returns {string|null}  full URL hoặc null nếu thiếu config / key
 */
const buildR2Url = (objectKey) => {
  if (!R2_PUBLIC_BASE_URL || !objectKey) {return null;}
  // objectKey có thể bắt đầu bằng "/" hoặc không — chuẩn hoá
  const key = objectKey.replace(/^\//, '');
  return `${R2_PUBLIC_BASE_URL}/${key}`;
};

// Agent map artifacts can live in a separate public bucket from media.
const MAP_R2_PUBLIC_BASE_URL = (process.env.MAP_R2_PUBLIC_BASE_URL || R2_PUBLIC_BASE_URL).replace(/\/$/, '');
const buildMapR2Url = (objectKey) => {
  if (!MAP_R2_PUBLIC_BASE_URL || !objectKey) {return null;}
  return `${MAP_R2_PUBLIC_BASE_URL}/${objectKey.replace(/^\/+/, '')}`;
};
module.exports = { R2_PUBLIC_BASE_URL, MAP_R2_PUBLIC_BASE_URL, buildR2Url, buildMapR2Url };
