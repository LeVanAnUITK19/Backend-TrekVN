'use strict';
const mongoose = require('mongoose');
const models = require('../models');

async function connectDB() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  if (!hello.setName && hello.msg !== 'isdbgrid') {
    await mongoose.disconnect();
    throw new Error('Community writes require a MongoDB replica set (transactions)');
  }
  // These are new, service-owned collections. init creates the declared indexes.
  await Promise.all(Object.values(models).map((model) => model.init()));
}
module.exports = { connectDB };
