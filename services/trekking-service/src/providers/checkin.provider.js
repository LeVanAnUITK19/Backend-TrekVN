'use strict';

const logger = require('../config/logger');

const CHECKIN_SERVICE_URL = process.env.CHECKIN_SERVICE_URL || 'http://checkin-service:3002';
const TIMEOUT_MS = parseInt(process.env.CHECKIN_HTTP_TIMEOUT_MS) || 5000;

/**
 * CheckinProvider — internal HTTP calls to checkin-service.
 * Used for: province lookup by region (region filter for places).
 *
 * Only called when region query param is provided.
 * Results are NOT cached to keep impl simple for MVP.
 * Can add in-memory TTL cache here if latency becomes a concern.
 */

/**
 * Get province IDs for a given region.
 * Calls: GET /internal/v1/provinces?region=<region>  (checkin-service internal API)
 *
 * @param {string} region - e.g. 'NORTH', 'SOUTH', 'CENTRAL'
 * @returns {string[]} array of provinceId strings
 */
const getProvinceIdsByRegion = async (region) => {
  const url = `${CHECKIN_SERVICE_URL}/internal/v1/provinces?region=${encodeURIComponent(region)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) {
      logger.warn(`[CheckinProvider] getProvinceIdsByRegion returned ${res.status} for region=${region}`);
      return [];
    }

    const body = await res.json();
    // Expect: { success: true, data: [{ provinceId: '...' }, ...] }
    const provinces = body.data || [];
    return provinces.map((p) => String(p.provinceId || p._id)).filter(Boolean);
  } catch (err) {
    clearTimeout(timer);
    logger.warn(`[CheckinProvider] getProvinceIdsByRegion failed for region=${region}: ${err.message}`);
    return []; // fail-open: nếu không lấy được province, bỏ filter region
  }
};

module.exports = { getProvinceIdsByRegion };
