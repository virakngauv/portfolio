import http from 'node:http';
import { clientAddress, hostname } from './config.mjs';

const hopHeaders = [
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailer', 'transfer-encoding', 'upgrade', 'proxy-connection',
];

export function cleanHeaders(headers) {
  const result = { ...headers };
  for (const key of [...hopHeaders, ...(headers.connection ?? '').split(',').map((s) => s.trim().toLowerCase())]) {
    delete result[key];
  }
  return result;
}

export function forwardedHeaders(request, mode, upgrade = false) {
  const address = clientAddress(request, mode);
  if (!address) return null;
  const headers = cleanHeaders(request.headers);
  for (const key of Object.keys(headers)) {
    if (key === 'forwarded' || key.startsWith('x-forwarded-') || key === 'do-connecting-ip' || key === 'x-real-ip') {
      delete headers[key];
    }
  }
  // Host and Origin are policy inputs; Connection must not be allowed to erase them.
  headers.host = request.headers.host;
  if (request.headers.origin !== undefined) headers.origin = request.headers.origin;
  headers['x-forwarded-for'] = address;
  if (upgrade) {
    headers.connection = 'Upgrade';
    headers.upgrade = 'websocket';
  }
  return headers;
}

function json(response, code, status) {
  response.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  response.end(JSON.stringify({ status }));
}

function rejectSocket(socket, code) {
  socket.end(`HTTP/1.1 ${code} ${http.STATUS_CODES[code]}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
}

export function createGateway(config, isReady) {
  const sockets = new Set();
  const track = (socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
    socket.on('error', () => socket.destroy());
    return socket;
  };
  function route(request) {
    const host = hostname(request.headers.host);
    const game = config.games.find((candidate) => candidate.hosts.includes(host));
    if (!game) return { error: 421 };
    if (request.headers.origin !== undefined && !game.origins.includes(request.headers.origin)) return { error: 403 };
    if (!request.url?.startsWith('/') || request.url.startsWith('//')) return { error: 400 };
    if (!isReady()) return { error: 503 };
    return { game };
  }
  const server = http.createServer({ maxHeaderSize: 16384 }, (request, response) => {
    if (request.method === 'GET' && request.url === '/_runtime/healthz') {
      json(response, isReady() ? 200 : 503, isReady() ? 'ok' : 'unavailable');
      return;
    }
    const { game, error } = route(request);
    if (error) { json(response, error, http.STATUS_CODES[error]); return; }
    const headers = forwardedHeaders(request, config.mode);
    if (!headers) { json(response, 400, 'invalid_client_ip'); return; }
    const upstream = http.request({
      hostname: '127.0.0.1', port: game.port, path: request.url,
      method: request.method, headers, agent: false,
    });
    upstream.setTimeout(65000, () => upstream.destroy(new Error('Upstream timeout')));
    upstream.on('response', (incoming) => {
      response.writeHead(incoming.statusCode ?? 502, cleanHeaders(incoming.headers));
      incoming.on('error', () => response.destroy());
      incoming.pipe(response);
    });
    upstream.on('error', () => {
      if (!response.headersSent && !response.destroyed) json(response, 502, 'upstream_unavailable');
      else response.destroy();
    });
    request.on('aborted', () => upstream.destroy());
    request.on('error', () => upstream.destroy());
    response.on('close', () => upstream.destroy());
    request.pipe(upstream);
  });
  server.headersTimeout = 10000;
  server.requestTimeout = 70000; // Allow Socket.IO's default long-poll cycle.
  server.on('connection', track);
  server.on('upgrade', (request, socket, head) => {
    const { game, error } = route(request);
    if (error) { rejectSocket(socket, error); return; }
    if (request.method !== 'GET' || request.headers.upgrade?.toLowerCase() !== 'websocket') {
      rejectSocket(socket, 400); return;
    }
    const headers = forwardedHeaders(request, config.mode, true);
    if (!headers) { rejectSocket(socket, 400); return; }
    const upstream = http.request({
      hostname: '127.0.0.1', port: game.port, path: request.url,
      method: 'GET', headers, agent: false,
    });
    const deadline = setTimeout(() => upstream.destroy(new Error('Upgrade timeout')), 10000);
    upstream.on('upgrade', (incoming, peer, upstreamHead) => {
      clearTimeout(deadline);
      if (socket.destroyed) { peer.destroy(); return; }
      track(peer);
      const responseHeaders = cleanHeaders(incoming.headers);
      responseHeaders.connection = 'Upgrade';
      responseHeaders.upgrade = 'websocket';
      const lines = Object.entries(responseHeaders).flatMap(([key, value]) =>
        (Array.isArray(value) ? value : [value]).map((item) => `${key}: ${item}`));
      socket.write(`HTTP/1.1 101 Switching Protocols\r\n${lines.join('\r\n')}\r\n\r\n`);
      if (upstreamHead.length) socket.write(upstreamHead);
      if (head.length) peer.write(head);
      socket.once('close', () => peer.destroy());
      peer.once('close', () => socket.destroy());
      socket.pipe(peer).pipe(socket);
    });
    upstream.on('response', (incoming) => {
      clearTimeout(deadline);
      incoming.resume();
      rejectSocket(socket, incoming.statusCode ?? 502);
    });
    upstream.on('error', () => { clearTimeout(deadline); if (!socket.destroyed) rejectSocket(socket, 502); });
    socket.once('close', () => { clearTimeout(deadline); upstream.destroy(); });
    upstream.end();
  });
  return {
    server,
    destroyConnections() { for (const socket of sockets) socket.destroy(); },
  };
}

// Posted by ChatGPT Chat on behalf of @virakngauv.
