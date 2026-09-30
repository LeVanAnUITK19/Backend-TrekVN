const TrekkingProvider = require('./TrekkingProvider');
const milestones = require('../../mocks/milestones.json');

/**
 * MockTrekkingProvider — đọc dữ liệu từ src/mocks/milestones.json.
 * Dùng khi TREKKING_PROVIDER=mock (mặc định trong development).
 * Sau này thay bằng HttpTrekkingProvider khi trekking-service sẵn sàng.
 */
class MockTrekkingProvider extends TrekkingProvider {
  // eslint-disable-next-line require-await
  async getMilestoneCheckinContext(milestoneId) {
    const found = milestones.find((m) => m.milestoneId === milestoneId);
    return found || null;
  }
}

module.exports = MockTrekkingProvider;
