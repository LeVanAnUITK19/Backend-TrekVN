'use strict';
const http = require('http');
const { once } = require('events');
const { WebSocket } = require('ws');
const jwt = require('jsonwebtoken');
const { attachRealtime } = require('../src/realtime/websocket');
const { createEventBus } = require('../src/realtime/eventBus');

let server, realtime, events, url;
const sockets = [];
const sign = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '1h' });
const { verifyToken } = require('../src/middlewares/auth');
async function connect(id) {
  const socket = new WebSocket(url);
  sockets.push(socket);
  await once(socket, 'open');
  const ready = once(socket, 'message');
  socket.send(JSON.stringify({ type: 'auth', token: sign(id) }));
  expect(JSON.parse((await ready)[0])).toEqual({ type: 'ready' });
  return socket;
}
beforeEach(async () => {
  events = createEventBus();
  server = http.createServer();
  realtime = attachRealtime(server, events, { authenticate: async (token) => verifyToken(token) });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  url = `ws://127.0.0.1:${server.address().port}/api/v1/community/ws`;
});
afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.terminate();
  await realtime.close();
  await new Promise((resolve) => server.close(resolve));
  await events.close();
});

test('public invalidations reach both clients; private events only reach the author', async () => {
  const alice = await connect('alice');
  const bob = await connect('bob');
  const publicA = once(alice, 'message'), publicB = once(bob, 'message');
  events.publish({ type: 'post.created', postId: 'public-post', authorId: 'alice', public: true });
  expect(JSON.parse((await publicA)[0]).postId).toBe('public-post');
  expect(JSON.parse((await publicB)[0]).postId).toBe('public-post');
  const receivedB = [];
  bob.on('message', (raw) => receivedB.push(JSON.parse(raw)));
  const privateA = once(alice, 'message');
  events.publish({ type: 'comment.created', postId: 'private-post', authorId: 'alice', public: false });
  const privateMessage = JSON.parse((await privateA)[0]);
  expect(privateMessage.postId).toBe('private-post');
  expect(privateMessage.authorId).toBeUndefined();
  // The public marker proves the previous private event was not queued for Bob.
  const marker = once(bob, 'message');
  events.publish({ type: 'post.updated', postId: 'marker', authorId: 'alice', public: true });
  await marker;
  expect(receivedB.map((e) => e.postId)).toEqual(['marker']);
});

test('rejects bad credentials, client writes, query tokens and untrusted origins', async () => {
  const socket = new WebSocket(url);
  sockets.push(socket);
  await once(socket, 'open');
  const closed = once(socket, 'close');
  socket.send(JSON.stringify({ type: 'auth', token: 'invalid' }));
  expect((await closed)[0]).toBe(4401);
  const authenticated = await connect('alice');
  const writeClosed = once(authenticated, 'close');
  authenticated.send(JSON.stringify({ type: 'createPost', content: 'forged' }));
  expect((await writeClosed)[0]).toBe(1008);
  for (const [target, options] of [[url + '?token=secret', {}], [url, { origin: 'https://untrusted.example' }]]) {
    const rejected = new WebSocket(target, options);
    sockets.push(rejected);
    const error = await new Promise((resolve) => rejected.on('error', resolve));
    expect(error.message).toContain('403');
  }
});

test('socket closes when the JWT expires', async () => {
  const socket = new WebSocket(url);
  sockets.push(socket);
  await once(socket, 'open');
  const ready = once(socket, 'message');
  socket.send(JSON.stringify({ type: 'auth', token: jwt.sign({ id: 'alice' }, process.env.JWT_SECRET, { expiresIn: 2 }) }));
  await ready;
  expect((await once(socket, 'close'))[0]).toBe(4401);
});
