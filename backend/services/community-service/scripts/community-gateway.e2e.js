'use strict';
// npm ci in both community-service and api-gateway before running npm run test:e2e.
// Uses an ephemeral replica set and a local auth HTTP contract stub, never .env DBs.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'ephemeral-community-e2e-secret';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const { WebSocket } = require('ws');
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const createApp = require('../src/app');
const { createEventBus } = require('../src/realtime/eventBus');
const { attachRealtime } = require('../src/realtime/websocket');

test('gateway REST commits broadcast to authenticated gateway WebSocket clients', { timeout: 90000 }, async () => {
  let db, authServer, communityServer, gatewayServer, realtime, socket, closeUpgrade;
  const bus = createEventBus();
  const alice = new mongoose.Types.ObjectId().toString();
  const bob = new mongoose.Types.ObjectId().toString();
  const token = (id, role = 'USER') => jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const listen = (server) => new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const message = (ws) => once(ws, 'message', { signal: AbortSignal.timeout(5000) }).then(([raw]) => JSON.parse(raw));
  try {
    db = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: '7.0.14' } });
    process.env.MONGODB_URI = db.getUri('community_gateway_e2e');
    await require('../src/config/database').connectDB();
    authServer = http.createServer((req, res) => {
      try {
        const user = jwt.verify((req.headers.authorization || '').slice(7), process.env.JWT_SECRET, { algorithms: ['HS256'] });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, data: user }));
      } catch { res.writeHead(401); res.end(); }
    });
    await listen(authServer);
    process.env.AUTH_SERVICE_URL = `http://127.0.0.1:${authServer.address().port}`;
    communityServer = http.createServer(createApp({ events: bus }));
    realtime = attachRealtime(communityServer, bus);
    await listen(communityServer);
    process.env.COMMUNITY_SERVICE_URL = `http://127.0.0.1:${communityServer.address().port}`;
    gatewayServer = http.createServer(require('../../api-gateway/src/app'));
    closeUpgrade = require('../../api-gateway/src/routes/communityUpgrade').attachCommunityUpgrade(gatewayServer);
    await listen(gatewayServer);
    socket = new WebSocket(`ws://127.0.0.1:${gatewayServer.address().port}/api/v1/community/ws`);
    await once(socket, 'open');
    const ready = message(socket);
    socket.send(JSON.stringify({ type: 'auth', token: token(alice) }));
    assert.equal((await ready).type, 'ready');
    const event = message(socket);
    const created = await request(gatewayServer).post('/api/v1/posts').auth(token(alice), { type: 'bearer' })
      .send({ content: 'Gateway realtime journey' });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const published = await event;
    assert.equal(published.type, 'post.created'); assert.equal(published.postId, created.body.data.postId);
    const commentsEvent = message(socket);
    const reply = await request(gatewayServer).post(`/api/v1/posts/${created.body.data.postId}/comments`)
      .auth(token(bob), { type: 'bearer' }).send({ content: 'Reply from another client' });
    assert.equal(reply.status, 201);
    assert.equal((await commentsEvent).type, 'comment.created');
    const read = await request(gatewayServer).get(`/api/v1/posts/${created.body.data.postId}`).auth(token(alice), { type: 'bearer' });
    assert.equal(read.body.data.commentCount, 1);
    const postId = created.body.data.postId;
    const adminPath = `/api/v1/admin/community/posts/${postId}`;
    assert.equal((await request(gatewayServer).get(adminPath).auth(token(bob), { type: 'bearer' })).status, 403);
    const hiddenEvent = message(socket);
    const hidden = await request(gatewayServer).patch(`${adminPath}/hide`).auth(token(bob, 'ADMIN'), { type: 'bearer' })
      .send({ reason: 'Local moderation integration check' });
    assert.equal(hidden.status, 200, JSON.stringify(hidden.body));
    assert.equal(hidden.body.data.status, 'HIDDEN');
    assert.equal((await hiddenEvent).type, 'post.updated');
    assert.equal((await request(gatewayServer).get(`/api/v1/posts/${postId}`).auth(token(alice), { type: 'bearer' })).status, 404);
    const publishedEvent = message(socket);
    const restored = await request(gatewayServer).patch(`${adminPath}/publish`).auth(token(bob, 'ADMIN'), { type: 'bearer' })
      .send({ reason: 'Local content verified' });
    assert.equal(restored.status, 200, JSON.stringify(restored.body));
    assert.equal((await publishedEvent).type, 'post.updated');
    const detail = await request(gatewayServer).get(adminPath).auth(token(bob, 'ADMIN'), { type: 'bearer' });
    assert.equal(detail.status, 200);
    assert.equal(detail.body.data.recentActions.length, 2);
    assert.equal((await request(gatewayServer).get(`/api/v1/posts/${postId}`).auth(token(alice), { type: 'bearer' })).status, 200);
    assert.equal((await request(gatewayServer).get('/api/v1/posts')).status, 401);
  } finally {
    socket?.terminate(); closeUpgrade?.(); await realtime?.close(); await bus.close();
    for (const server of [gatewayServer, communityServer, authServer]) {
      if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
    }
    await mongoose.disconnect(); await db?.stop();
  }
});
