import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createLoopbackAgent } from '../scripts/smoke-network.mjs';
import { listen, freePorts } from './helpers.mjs';

test('smoke client resolves locally while preserving hostname and Origin on the wire', async (t) => {
  const server = http.createServer((request, response) => {
    response.end(JSON.stringify(request.headers));
  });
  const port = await listen(server);
  const agent = createLoopbackAgent('game.test');
  t.after(() => { agent.destroy(); server.closeAllConnections(); server.close(); });
  const headers = await new Promise((resolve, reject) => {
    const request = http.get(`http://game.test:${port}/socket.io/?transport=polling`, {
      agent, headers: { Origin: 'https://frontend.test' }, signal: AbortSignal.timeout(2000),
    }, (response) => {
      let body = '';
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve(JSON.parse(body)));
      response.on('error', reject);
    });
    request.on('error', reject);
  });
  assert.equal(headers.host, `game.test:${port}`);
  assert.equal(headers.origin, 'https://frontend.test');
});

test('port reservations return a distinct set', async () => {
  const ports = await freePorts(20);
  assert.equal(new Set(ports).size, 20);
});
// Posted by ChatGPT Chat on behalf of @virakngauv.
