'use strict';
const http = require('http');
const { once } = require('events');
const jwt = require('jsonwebtoken');
const { WebSocket } = require('ws');
const { attachRealtime } = require('../src/realtime/websocket');
const { createEventBus } = require('../src/realtime/eventBus');

let upstream, server, realtime, bus, url;
let active, verifiedId, seenAuthorization;
const clients = [];
const previousAuthUrl = process.env.AUTH_SERVICE_URL;
beforeEach(async () => {
  active = true; verifiedId = 'alice'; seenAuthorization = null;
  upstream = http.createServer((req, res) => {
    seenAuthorization = req.headers.authorization;
    res.writeHead(active ? 200 : 401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: active, data: { id: verifiedId, role: 'USER' } }));
  });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  process.env.AUTH_SERVICE_URL = `http://127.0.0.1:${upstream.address().port}`;
  server = http.createServer(); bus = createEventBus();
  realtime = attachRealtime(server, bus, { sessionCheckMs: 100 });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  url = `ws://127.0.0.1:${server.address().port}/api/v1/community/ws`;
});
afterEach(async () => {
  for (const ws of clients.splice(0)) ws.terminate();
  await realtime.close(); await bus.close();
  await new Promise((resolve) => server.close(resolve));
  upstream.closeAllConnections();
  await new Promise((resolve) => upstream.close(resolve));
  if (previousAuthUrl === undefined) delete process.env.AUTH_SERVICE_URL;
  else process.env.AUTH_SERVICE_URL = previousAuthUrl;
});
async function open() {
  const socket = new WebSocket(url); clients.push(socket);
  await once(socket, 'open');
  return socket;
}
const token = () => jwt.sign({ id: 'alice' }, process.env.JWT_SECRET, { expiresIn: '1h' });

test('uses the auth-service current-account check for handshake and later revocation', async () => {
  const socket = await open();
  const ready = once(socket, 'message');
  const access = token();
  socket.send(JSON.stringify({ type: 'auth', token: access }));
  expect(JSON.parse((await ready)[0])).toEqual({ type: 'ready' });
  expect(seenAuthorization).toBe(`Bearer ${access}`);
  const closed = once(socket, 'close');
  active = false;
  expect((await closed)[0]).toBe(4401);
});

test.each(['blocked', 'identity mismatch', 'upstream unavailable'])('fails closed for %s', async (reason) => {
  if (reason === 'blocked') active = false;
  if (reason === 'identity mismatch') verifiedId = 'bob';
  if (reason === 'upstream unavailable') {
    upstream.closeAllConnections();
    await new Promise((resolve) => upstream.close(resolve));
  }
  const socket = await open();
  const closed = once(socket, 'close');
  socket.send(JSON.stringify({ type: 'auth', token: token() }));
  expect((await closed)[0]).toBe(4401);
});
