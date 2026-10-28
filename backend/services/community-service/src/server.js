'use strict';
const http = require('http');
const mongoose = require('mongoose');
const createApp = require('./app');
const { connectDB } = require('./config/database');
const { createEventBus } = require('./realtime/eventBus');
const { attachRealtime } = require('./realtime/websocket');
const logger = require('./config/logger');

async function startServer() {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is required');
  await connectDB();
  const events = createEventBus();
  await events.start();
  const server = http.createServer(createApp({ events }));
  const realtime = attachRealtime(server, events);
  await new Promise((resolve) => server.listen(Number(process.env.PORT) || 3004, resolve));
  logger.info({ message: 'Community service listening', port: server.address().port });
  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    const deadline = setTimeout(() => process.exit(1), 10000);
    deadline.unref();
    await realtime.close();
    await new Promise((resolve) => server.close(resolve));
    await events.close();
    await mongoose.disconnect();
    clearTimeout(deadline);
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
  return { server, shutdown };
}
module.exports = { startServer };
