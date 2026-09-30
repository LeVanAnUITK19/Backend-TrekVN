const logger = require('../../config/logger');

/**
 * Factory — trả về TrekkingProvider instance dựa theo ENV.
 * TREKKING_PROVIDER=mock  → MockTrekkingProvider (mặc định)
 * TREKKING_PROVIDER=http  → HttpTrekkingProvider
 */
const getTrekkingProvider = () => {
  const providerType = (process.env.TREKKING_PROVIDER || 'mock').toLowerCase();

  if (providerType === 'http') {
    const HttpTrekkingProvider = require('./HttpTrekkingProvider');
    logger.info('TrekkingProvider: using HttpTrekkingProvider');
    return new HttpTrekkingProvider();
  }

  const MockTrekkingProvider = require('./MockTrekkingProvider');
  logger.info('TrekkingProvider: using MockTrekkingProvider');
  return new MockTrekkingProvider();
};

// Singleton để không khởi tạo lại mỗi request
let _instance = null;
const getTrekkingProviderInstance = () => {
  if (!_instance) {
    _instance = getTrekkingProvider();
  }
  return _instance;
};

// Cho phép reset singleton trong test
const resetTrekkingProviderInstance = () => {
  _instance = null;
};

module.exports = { getTrekkingProviderInstance, resetTrekkingProviderInstance };
