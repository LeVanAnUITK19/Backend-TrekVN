'use strict';

const mongoose = require('mongoose');
const net = require('node:net');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongoServer;

const connect = async () => {
  // Let the OS select an available port, avoiding Windows excluded port ranges.
  const port = await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const selected = probe.address().port;
      probe.close(() => resolve(selected));
    });
  });
  mongoServer = await MongoMemoryServer.create({ instance: { port, ip: '127.0.0.1' } });
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
};

const disconnect = async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  }
  if (mongoServer) { await mongoServer.stop(); }
};

const clearDatabase = async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
};

module.exports = { connect, disconnect, clearDatabase };
