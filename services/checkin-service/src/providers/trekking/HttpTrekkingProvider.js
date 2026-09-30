const TrekkingProvider = require('./TrekkingProvider');
const logger = require('../../config/logger');
const { ServiceUnavailableError } = require('../../utils/errors');

/**
 * HttpTrekkingProvider — gọi HTTP đến trekking-service.
 * Dùng khi TREKKING_PROVIDER=http và TREKKING_SERVICE_URL được set.
 *
 * Endpoint: GET /internal/v1/milestones/:milestoneId/checkin-context
 */
class HttpTrekkingProvider extends TrekkingProvider {
  constructor() {
    super();
    this.baseUrl = process.env.TREKKING_SERVICE_URL || 'http://trekking-service:3003';
    this.timeoutMs = parseInt(process.env.TREKKING_HTTP_TIMEOUT_MS) || 5000;
  }

  async getMilestoneCheckinContext(milestoneId) {
    const url = `${this.baseUrl}/internal/v1/milestones/${encodeURIComponent(milestoneId)}/checkin-context`;

    let res;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      res = await fetch(url, {
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
      });
      clearTimeout(timer);
    } catch (err) {
      logger.error({ msg: 'HttpTrekkingProvider fetch error', url, err: err.message });
      throw new ServiceUnavailableError(
        'Không thể kết nối đến trekking-service'
      );
    }

    if (res.status === 404) {
      return null;
    }

    if (!res.ok) {
      logger.error({ msg: 'HttpTrekkingProvider non-OK response', status: res.status, url });
      throw new ServiceUnavailableError(
        `trekking-service trả về lỗi ${res.status}`
      );
    }

    try {
      const body = await res.json();
      // Expect: { success: true, data: { ...context } }
      return body.data || body;
    } catch (err) {
      logger.error({ msg: 'HttpTrekkingProvider parse error', err: err.message });
      throw new ServiceUnavailableError('Phản hồi từ trekking-service không hợp lệ');
    }
  }
}

module.exports = HttpTrekkingProvider;
