'use strict';

// Run with trekking-service stopped. Dry run unless --apply is supplied.
require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false });
  const Review = require('../src/models/DetailEvaluate');
  const duplicates = await Review.aggregate([
    { $group: { _id: { trekkingPlaceId: '$trekkingPlaceId', userId: '$userId' }, count: { $sum: 1 }, reviewIds: { $push: '$_id' } } },
    { $match: { count: { $gt: 1 } } },
  ]);
  if (duplicates.length) {
    console.log(JSON.stringify(duplicates, null, 2));
    throw new Error('Duplicate reviews found. Reconcile these records before applying the unique index; no data was changed.');
  }
  if (!process.argv.includes('--apply')) {
    console.log('No duplicate reviews. Stop trekking-service, then rerun with --apply to convert the review index.');
    return;
  }
  const indexes = await Review.collection.indexes();
  const old = indexes.find((index) => Object.keys(index.key).length === 2 && index.key.trekkingPlaceId === 1 && index.key.userId === 1);
  if (old && !old.unique) await Review.collection.dropIndex(old.name);
  await Review.collection.createIndex({ trekkingPlaceId: 1, userId: 1 }, { unique: true });
  await Review.updateMany({ editCount: { $exists: false } }, { $set: { editCount: 0 } });
  console.log('Unique review index installed; legacy reviews have one edit available.');
}

main().catch((err) => { console.error(err.message); process.exitCode = 1; }).finally(() => mongoose.disconnect());
