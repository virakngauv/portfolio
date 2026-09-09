import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

// Run with the game's own tsx loader and dependencies; no protocol version copies.
const require = createRequire(`${process.cwd()}/package.json`);
const { io } = require('socket.io-client');
const protocol = await import(pathToFileURL(`${process.cwd()}/lib/game-protocol.ts`).href);
const GAME_PROTOCOL_VERSION = protocol.GAME_PROTOCOL_VERSION ?? protocol.default?.GAME_PROTOCOL_VERSION;
assert.notEqual(GAME_PROTOCOL_VERSION, undefined, 'Missing upstream protocol version');
const url = process.env.SMOKE_URL;
const headers = { Host: process.env.SMOKE_HOST, Origin: process.env.SMOKE_ORIGIN };
const clients = [];
const deadline = setTimeout(() => { console.error('Smoke test timed out'); process.exit(1); }, 60000);

async function connect(transports, token = randomBytes(16).toString('hex')) {
  const client = io(url, {
    auth: { token, protocolVersion: GAME_PROTOCOL_VERSION },
    extraHeaders: headers, forceNew: true, transports, reconnection: false, timeout: 5000,
  });
  clients.push(client);
  await new Promise((resolve, reject) => {
    client.once('connect', resolve);
    client.once('connect_error', reject);
  });
  return client;
}

try {
  for (const transports of [['polling'], ['websocket'], ['polling', 'websocket']]) {
    const token = randomBytes(16).toString('hex');
    const host = await connect(transports, token);
    const guest = await connect(transports);
    const created = await host.timeout(5000).emitWithAck('room:create', { name: 'Runtime smoke host' });
    assert.equal(created.status, 'success', JSON.stringify(created));
    const roomCode = created.roomCode;
    const joined = await guest.timeout(5000).emitWithAck('room:join', { roomCode, name: 'Runtime smoke guest' });
    assert.equal(joined.status, 'success', JSON.stringify(joined));
    if (transports.length === 2 && host.io.engine.transport.name !== 'websocket') {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Polling did not upgrade to WebSocket')), 5000);
        host.io.engine.once('upgrade', () => { clearTimeout(timer); resolve(); });
      });
    }
    host.disconnect();
    const resumedClient = await connect(transports, token);
    const resumed = await resumedClient.timeout(5000).emitWithAck('session:resume', { roomCode });
    assert.equal(resumed.status, 'success', JSON.stringify(resumed));
    assert.ok(resumed.snapshot);
    console.log(JSON.stringify({ game: process.env.SMOKE_GAME, transports, create: true, join: true, resume: true }));
    for (const client of clients.splice(0)) client.disconnect();
  }
  // Verify the extra HTTP endpoint still reaches Secret Hitman, not a frontend/404.
  if (process.env.SMOKE_GAME === 'secret-hitman-5') {
    const response = await fetch(`${url}/leave-intent`, {
      method: 'POST', headers: { ...headers, 'content-type': 'application/x-www-form-urlencoded' },
      body: '', signal: AbortSignal.timeout(5000),
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).status, 'invalid');
  }
} finally {
  clearTimeout(deadline);
  for (const client of clients) client.disconnect();
}
// Posted by ChatGPT Chat on behalf of @virakngauv.
