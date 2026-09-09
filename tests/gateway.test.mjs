import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { createHash } from 'node:crypto';
import { createGateway } from '../runtime/gateway.mjs';
import { readConfig } from '../runtime/config.mjs';
import { listen, request, environment } from './helpers.mjs';

async function setup(t, mode = 'direct') {
  const config = readConfig({ ...environment, CLIENT_IP_MODE: mode });
  for (const game of config.games) {
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ game: game.id, url: req.url, headers: req.headers, body, method: req.method }));
      });
    });
    server.on('upgrade', (req, socket) => {
      const accept = createHash('sha1').update(`${req.headers['sec-websocket-key']}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
      socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
      // A raw tunnel fixture, not a Socket.IO game or a browser test.
      socket.write(`${game.id}|${req.url}|${req.headers['x-forwarded-for']}\n`);
      socket.on('data', (data) => socket.write(data));
      socket.on('error', () => socket.destroy());
    });
    game.port = await listen(server);
    t.after(() => { server.closeAllConnections(); server.close(); });
  }
  let ready = true;
  const gateway = createGateway(config, () => ready);
  const port = await listen(gateway.server);
  t.after(() => { gateway.destroyConnections(); gateway.server.close(); });
  return { port, config, setReady: (value) => { ready = value; } };
}

test('HTTP routing preserves body, query, method and isolated target', async (t) => {
  const { port } = await setup(t);
  for (const [host, origin, expected] of [
    ['PIC.TEST:8080', 'https://pic.example', 'pic-match'],
    ['hitman.test', 'https://hitman.example', 'secret-hitman-5'],
  ]) {
    const result = await request(port, { path: '/leave-intent?check=1', method: 'POST', headers: { Host: host, Origin: origin, 'content-type': 'application/x-www-form-urlencoded' }, body: 'token=test&roomCodes=ABC' });
    assert.equal(result.status, 200);
    const data = JSON.parse(result.text);
    assert.equal(data.game, expected);
    assert.equal(data.url, '/leave-intent?check=1');
    assert.equal(data.body, 'token=test&roomCodes=ABC');
    assert.equal(data.method, 'POST');
    assert.equal(data.headers.origin, origin);
  }
});

test('unknown hosts, foreign origins and absolute-form URLs fail closed', async (t) => {
  const { port } = await setup(t);
  assert.equal((await request(port, { headers: { Host: 'unknown.test' } })).status, 421);
  assert.equal((await request(port, { headers: { Host: 'pic.test', Origin: 'https://hitman.example' } })).status, 403);
  assert.equal((await request(port, { path: 'http://evil.test/', headers: { Host: 'pic.test' } })).status, 400);
});

test('readiness is available to platform probes and gates both games', async (t) => {
  const { port, setReady } = await setup(t);
  assert.equal((await request(port, { path: '/_runtime/healthz' })).status, 200);
  setReady(false);
  assert.equal((await request(port, { path: '/_runtime/healthz' })).status, 503);
  assert.equal((await request(port, { headers: { Host: 'pic.test' } })).status, 503);
  assert.equal((await request(port, { headers: { Host: 'hitman.test' } })).status, 503);
});

test('provider mode validates headers over the real HTTP forwarding path', async (t) => {
  const { port } = await setup(t, 'digitalocean');
  assert.equal((await request(port, { headers: { Host: 'pic.test' } })).status, 400);
  const response = await request(port, { headers: { Host: 'pic.test', 'do-connecting-ip': '192.0.2.10', 'x-forwarded-for': 'spoof' } });
  assert.equal(JSON.parse(response.text).headers['x-forwarded-for'], '192.0.2.10');
});

function tunnel(port, host, origin) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1');
    let result = '';
    let sent = false;
    socket.setTimeout(2000, () => socket.destroy(new Error('Tunnel timeout')));
    socket.on('error', reject);
    socket.on('connect', () => socket.write(
      `GET /socket.io/?EIO=4&transport=websocket HTTP/1.1\r\nHost: ${host}\r\nOrigin: ${origin}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n`,
    ));
    socket.on('data', (data) => {
      result += data;
      if (result.includes('\r\n\r\n') && !result.startsWith('HTTP/1.1 101')) { socket.destroy(); resolve(result); }
      else if (result.includes('|127.0.0.1\n') && !sent) { sent = true; socket.write('round-trip'); }
      if (result.endsWith('round-trip')) { socket.destroy(); resolve(result); }
    });
  });
}

test('WebSocket upgrade tunnels both directions to the right host without path rewriting', async (t) => {
  const { port } = await setup(t);
  for (const [host, origin, game] of [
    ['pic.test', 'https://pic.example', 'pic-match'],
    ['hitman.test', 'https://hitman.example', 'secret-hitman-5'],
  ]) {
    const text = await tunnel(port, host, origin);
    assert.match(text, /^HTTP\/1.1 101/);
    assert.ok(text.includes(`${game}|/socket.io/?EIO=4&transport=websocket|127.0.0.1\nround-trip`));
  }
});

test('WebSocket upgrade enforces the same host and origin policy', async (t) => {
  const { port } = await setup(t);
  assert.match(await tunnel(port, 'evil.test', 'https://pic.example'), /^HTTP\/1.1 421/);
  assert.match(await tunnel(port, 'pic.test', 'https://hitman.example'), /^HTTP\/1.1 403/);
});

test('unreachable HTTP upstream returns 502 instead of crashing the gateway', async (t) => {
  const config = readConfig(environment);
  // Port 0 cannot contain a listening upstream.
  config.games[0].port = 0;
  const gateway = createGateway(config, () => true);
  const port = await listen(gateway.server);
  t.after(() => { gateway.destroyConnections(); gateway.server.close(); });
  assert.equal((await request(port, { headers: { Host: 'pic.test' } })).status, 502);
  assert.equal((await request(port, { path: '/_runtime/healthz' })).status, 200);
});
// Posted by ChatGPT Chat on behalf of @virakngauv.
