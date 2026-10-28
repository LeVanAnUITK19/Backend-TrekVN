'use strict';
const { WebSocketServer, WebSocket } = require('ws');
const { verifyToken } = require('../middlewares/auth');
const logger = require('../config/logger');
const WS_PATH = '/api/v1/community/ws';

// First-frame authentication works with native and browser WebSocket clients.
// Tokens are never placed in URLs, query strings or invalidation messages.
function attachRealtime(server, events, options = {}) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 8192, perMessageDeflate: false });
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const authenticate = options.authenticate || (async (token) => {
    const user = verifyToken(token);
    const response = await fetch(`${process.env.AUTH_SERVICE_URL || 'http://localhost:3001'}/api/v1/auth/verify`, {
      headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error('Session is invalid');
    const verified = await response.json();
    if (verified.success !== true || String(verified.data?.id) !== user.userId) throw new Error('Session identity mismatch');
    return user;
  });
  const sessionCheckMs = options.sessionCheckMs || Number(process.env.WS_SESSION_CHECK_MS) || 60000;
  const upgrade = (req, socket, head) => {
    socket.on('error', () => {});
    if (req.url !== WS_PATH || (req.headers.origin && !allowedOrigins.includes(req.headers.origin))) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return;
    }
    if (wss.clients.size >= (Number(process.env.WS_MAX_CONNECTIONS) || 1000)) {
      socket.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n'); return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  };
  server.on('upgrade', upgrade);
  function send(ws, data) {
    if (ws.readyState !== WebSocket.OPEN) return;
    if (ws.bufferedAmount > 256 * 1024) { ws.close(1013, 'Slow client; reconnect and refetch'); return; }
    ws.send(JSON.stringify(data));
  }
  wss.on('connection', (ws) => {
    ws.alive = true;
    let authenticating = false;
    let expiryTimer;
    let sessionTimer;
    let revalidating = false;
    const authTimer = setTimeout(() => ws.close(4401, 'Authentication required'), 6000);
    ws.on('pong', () => { ws.alive = true; });
    ws.on('error', () => {});
    ws.on('message', async (raw, binary) => {
      if (ws.user || authenticating) { ws.close(1008, 'Server sends updates only'); return; }
      if (binary) { ws.close(1008, 'JSON required'); return; }
      authenticating = true;
      try {
        const message = JSON.parse(raw.toString());
        if (message.type !== 'auth' || typeof message.token !== 'string') throw new Error('Authentication required');
        const user = await authenticate(message.token);
        if (ws.readyState !== WebSocket.OPEN) return;
        if (user.exp * 1000 <= Date.now()) throw new Error('Expired token');
        clearTimeout(authTimer);
        ws.user = user;
        expiryTimer = setTimeout(() => ws.close(4401, 'Token expired'), Math.min(2147483647, user.exp * 1000 - Date.now()));
        // Account blocks/password resets must also close existing sockets.
        // Keep one bounded request per socket in flight and fail closed.
        sessionTimer = setInterval(async () => {
          if (revalidating || ws.readyState !== WebSocket.OPEN) return;
          revalidating = true;
          try {
            await authenticate(message.token);
          } catch {
            ws.user = null;
            ws.close(4401, 'Session ended');
          } finally { revalidating = false; }
        }, sessionCheckMs);
        sessionTimer.unref();
        send(ws, { type: 'ready' });
      } catch { ws.close(4401, 'Invalid or expired session'); }
    });
    ws.on('close', () => { clearTimeout(authTimer); clearTimeout(expiryTimer); clearInterval(sessionTimer); });
  });
  const unsubscribe = events.on((event) => {
    for (const ws of wss.clients) {
      if (!ws.user || ws.user.exp * 1000 <= Date.now()) continue;
      if (event.public || ws.user.userId === event.authorId) {
        send(ws, { type: event.type, postId: event.postId, eventId: event.eventId, occurredAt: event.occurredAt });
      }
    }
  });
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.alive) { ws.terminate(); continue; }
      ws.alive = false;
      ws.ping();
    }
  }, 30000);
  heartbeat.unref();
  wss.on('error', (err) => logger.error({ message: 'WebSocket error', reason: err.message }));
  return {
    wss,
    close: () => new Promise((resolve) => {
      clearInterval(heartbeat);
      unsubscribe();
      server.off('upgrade', upgrade);
      for (const ws of wss.clients) ws.terminate();
      wss.close(resolve);
    }),
  };
}
module.exports = { attachRealtime, WS_PATH };
