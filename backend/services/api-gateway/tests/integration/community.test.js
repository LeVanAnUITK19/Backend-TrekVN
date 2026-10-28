'use strict';
const http = require('http');
const net = require('net');
const crypto = require('crypto');
const request = require('supertest');
let upstream, gateway, app, closeUpgrade, lastUpgrade;
const sockets = new Set();
const originalEnv = { ...process.env };
beforeAll(async () => {
  upstream = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/api/v1/auth/verify') { res.end(JSON.stringify({ success: true, data: { id: 'user', role: 'USER' } })); return; }
    res.end(JSON.stringify({ url: req.url, serviceToken: req.headers['x-service-token'], userId: req.headers['x-user-id'] }));
  });
  upstream.on('upgrade', (req, socket) => {
    lastUpgrade = req;
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    const accept = crypto.createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    // A small upstream event frame verifies that response bytes reach clients.
    const message = Buffer.from('{"type":"ready"}');
    socket.write(Buffer.concat([Buffer.from([0x81, message.length]), message]));
  });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  process.env.NODE_ENV = 'test';
  process.env.COMMUNITY_SERVICE_URL = `http://127.0.0.1:${upstream.address().port}`;
  process.env.AUTH_SERVICE_URL = process.env.COMMUNITY_SERVICE_URL;
  process.env.ALLOWED_ORIGINS = 'http://localhost:5173';
  jest.resetModules();
  app = require('../../src/app');
  gateway = http.createServer(app);
  closeUpgrade = require('../../src/routes/communityUpgrade').attachCommunityUpgrade(gateway);
  await new Promise((resolve) => gateway.listen(0, '127.0.0.1', resolve));
});
afterAll(async () => {
  closeUpgrade();
  for (const socket of sockets) socket.destroy();
  gateway.closeAllConnections();
  upstream.closeAllConnections();
  await new Promise((resolve) => gateway.close(resolve));
  await new Promise((resolve) => upstream.close(resolve));
  process.env = originalEnv;
});

test('community REST routes enforce authentication, preserve path and strip forged credentials', async () => {
  for (const path of ['/api/v1/posts', '/api/v1/comments/id/like']) {
    expect((await request(app).get(path)).status).toBe(401);
    const response = await request(app).get(path + '?page=2').set('Authorization', 'Bearer valid')
      .set('X-Service-Token', 'forged').set('X-User-Id', 'forged');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ url: path + '?page=2' });
  }
});

function upgrade(path, origin = 'http://localhost:5173') {
  return new Promise((resolve, reject) => {
    const socket = net.connect(gateway.address().port, '127.0.0.1');
    let data = Buffer.alloc(0);
    socket.on('error', reject);
    socket.on('connect', () => socket.write([
      `GET ${path} HTTP/1.1`, 'Host: localhost', 'Connection: Upgrade', 'Upgrade: websocket',
      'Sec-WebSocket-Version: 13', 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
      `Origin: ${origin}`, 'X-Service-Token: forged', 'X-User-Id: forged', '', '',
    ].join('\r\n')));
    socket.on('data', (chunk) => {
      data = Buffer.concat([data, chunk]);
      if (data.includes(Buffer.from('"ready"')) || data.toString().startsWith('HTTP/1.1 403')) {
        socket.destroy(); resolve(data.toString());
      }
    });
  });
}
test('gateway forwards WebSocket upgrades and upstream events without forged identity headers', async () => {
  const response = await upgrade('/api/v1/community/ws');
  expect(response).toContain('101 Switching Protocols');
  expect(response).toContain('"type":"ready"');
  expect(lastUpgrade.url).toBe('/api/v1/community/ws');
  expect(lastUpgrade.headers['x-user-id']).toBeUndefined();
  expect(lastUpgrade.headers['x-service-token']).toBeUndefined();
});
test('gateway rejects query credentials, other upgrade paths and disallowed origins', async () => {
  expect(await upgrade('/api/v1/community/ws?token=secret')).toContain('403');
  expect(await upgrade('/internal/v1/ws')).toContain('403');
  expect(await upgrade('/api/v1/community/ws', 'https://untrusted.example')).toContain('403');
});
