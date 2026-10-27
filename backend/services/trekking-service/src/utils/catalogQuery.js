'use strict';

const { AppError } = require('./errors');
const REGIONS = { NORTH: 'mien-bac', CENTRAL: 'mien-trung', SOUTH: 'mien-nam' };
const numberParam = (value, fallback, max) => {
  if (value === undefined) { return fallback; }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) { throw new AppError('Phân trang không hợp lệ', 400, 'VALIDATION_ERROR'); }
  return Math.min(parsed, max);
};
const catalogQuery = (query) => {
  for (const name of ['q', 'region', 'mien', 'sort', 'provinceId', 'difficulty', 'tags']) {
    if (query[name] !== undefined && typeof query[name] !== 'string') {
      throw new AppError('Bộ lọc không hợp lệ', 400, 'VALIDATION_ERROR');
    }
  }
  const mien = query.mien || REGIONS[query.region?.toUpperCase()];
  if ((query.region && !REGIONS[query.region.toUpperCase()]) ||
      (mien && !Object.values(REGIONS).includes(mien)) ||
      (query.sort && !['popular', 'default'].includes(query.sort)) ||
      (query.q?.length > 200)) {
    throw new AppError('Bộ lọc không hợp lệ', 400, 'VALIDATION_ERROR');
  }
  return {
    q: query.q?.trim() || '', mien: mien || '', sort: query.sort || 'default',
    provinceId: query.provinceId || '', difficulty: query.difficulty || '',
    tags: query.tags ? query.tags.split(',').map((tag) => tag.trim()).filter(Boolean).sort().join(',') : '',
    page: numberParam(query.page, 1, 100000), limit: numberParam(query.limit, 20, 50),
  };
};
module.exports = { catalogQuery };
