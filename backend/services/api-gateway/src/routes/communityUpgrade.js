'use strict';
const httpProxy = require('http-proxy');
const env = require('../config/env');

// The upstream authenticates the first JSON frame and closes unauthenticated
// connections within six seconds. No credentials in URLs or identity headers.
function attachCommunityUpgrade(server) {
  const proxy = httpProxy.createProxyServer({ target: env.COMMUNITY_SERVICE_URL, changeOrigin: true, ws: true });
  const sockets = new Set();
  proxy.on('proxyReqWs', (request) => {
    for (const header of ['x-service-token', 'x-user-id', 'x-user-role', 'x-admin-id']) request.removeHeader(header);
  });
  proxy.on('error', (_err, _req, socket) => {
    if (!socket.destroyed) socket.destroy();
  });
  const upgrade = (req, socket, head) => {
    socket.on('error', () => {});
    if (req.url !== '/api/v1/community/ws' ||
      (req.headers.origin && !env.ALLOWED_ORIGINS.includes(req.headers.origin))) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return;
    }
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
    proxy.ws(req, socket, head);
  };
  server.on('upgrade', upgrade);
  return () => {
    server.off('upgrade', upgrade);
    for (const socket of sockets) socket.destroy();
    proxy.close();
  };
}
module.exports = { attachCommunityUpgrade };
