const TrekkingProvider = require('./TrekkingProvider');
const milestones = require('../../mocks/milestones.json');

/**
 * MockTrekkingProvider — đọc dữ liệu từ src/mocks/milestones.json.
 * Chỉ dùng khi đặt TREKKING_PROVIDER=mock cho test/demo.
 */
class MockTrekkingProvider extends TrekkingProvider {
  // eslint-disable-next-line require-await
  async getMilestoneCheckinContext(milestoneId) {
    const found = milestones.find((m) => m.milestoneId === milestoneId);
    return found || null;
  }
}

module.exports = MockTrekkingProvider;
