/**
 * MongoDB in-memory setup cho Jest
 *
 * Luồng:
 *   Jest start
 *     ↓ connect() — tạo MongoDB tạm, kết nối mongoose
 *     ↓ clearCollections() — xoá data giữa các test
 *     ↓ disconnect() — xoá database, tắt MongoDB
 */

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

let mongod;

/**
 * Khởi động MongoMemoryServer và kết nối mongoose
 */
const connect = async () => {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri);
};

/**
 * Xoá toàn bộ collections (gọi sau mỗi test / describe block)
 */
const clearCollections = async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
};

/**
 * Ngắt kết nối mongoose và tắt MongoMemoryServer
 */
const disconnect = async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
  await mongod.stop();
};

module.exports = { connect, clearCollections, disconnect };
