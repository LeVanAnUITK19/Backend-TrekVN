const mongoose = require('mongoose');
const logger = require('./logger');

const connectDB = async () => {
  const uri = process.env.MONGODB_URI;
  await mongoose.connect(uri);
  logger.info('MongoDB connected: auth-service-trekVN');
};

module.exports = { connectDB };
