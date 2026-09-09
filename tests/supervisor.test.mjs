import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import { readConfig } from '../runtime/config.mjs';
import { startRuntime } from '../runtime/supervisor.mjs';
import { freePorts, waitFor, request, environment } from './helpers.mjs';

async function fixture(t, extra = {}, configExtra = {}) {
  const [port, picPort, hitmanPort] = await freePorts(3);
  const config = readConfig({ ...environment, PORT: String(port), PIC_MATCH_PORT: String(picPort), SECRET_HITMAN_PORT: String(hitmanPort), SHUTDOWN_TIMEOUT_MS: '200', ...configExtra });
  const runtime = await startRuntime(config, {
    log() {}, checkIntervalMs: 25,
    spawnGame(game) {
      return spawn(process.execPath, [fileURLToPath(new URL('./fixtures/game.mjs', import.meta.url))], {
        env: { ...process.env, PORT: String(game.port), ...extra }, stdio: 'ignore',
      });
    },
  });
  t.after(() => runtime.stop());
  return { runtime, config };
}

test('readiness waits for both processes and SIGTERM shutdown reaps both', async (t) => {
  const { runtime, config } = await fixture(t);
  await waitFor(runtime.isReady);
  assert.equal((await request(config.port, { path: '/_runtime/healthz' })).status, 200);
  await runtime.stop();
  assert.equal(await runtime.done, 0);
  assert.ok(runtime.children.every((child) => child.exitCode !== null || child.signalCode !== null));
  assert.equal(runtime.isReady(), false);
});

test('any unexpected child exit shuts down its sibling and exits unsuccessfully', async (t) => {
  const { runtime } = await fixture(t);
  await waitFor(runtime.isReady);
  runtime.children[0].kill('SIGKILL');
  assert.equal(await runtime.done, 1);
  assert.ok(runtime.children[1].exitCode !== null || runtime.children[1].signalCode !== null);
});

test('startup timeout fails closed and cleans up unready children', async (t) => {
  const { runtime } = await fixture(t, { NEVER_READY: '1' }, { STARTUP_TIMEOUT_MS: '200' });
  assert.equal(await runtime.done, 1);
  assert.equal(runtime.isReady(), false);
});

test('children ignoring SIGTERM are killed after the shutdown deadline', async (t) => {
  const { runtime } = await fixture(t, { IGNORE_TERM: '1' });
  await waitFor(runtime.isReady);
  const started = Date.now();
  await runtime.stop();
  assert.ok(Date.now() - started < 3000);
  assert.ok(runtime.children.every((child) => child.signalCode === 'SIGKILL'));
});

test('spawn errors stop the entire runtime without leaving its sibling running', async (t) => {
  const [port, picPort, hitmanPort] = await freePorts(3);
  const config = readConfig({ ...environment, PORT: String(port), PIC_MATCH_PORT: String(picPort), SECRET_HITMAN_PORT: String(hitmanPort), SHUTDOWN_TIMEOUT_MS: '200' });
  const runtime = await startRuntime(config, {
    log() {},
    spawnGame() { return spawn('/no/such/portfolio-executable', [], { stdio: 'ignore' }); },
  });
  t.after(() => runtime.stop());
  assert.equal(await runtime.done, 1);
});

test('failed spawn handles without a PID are never signalled', async (t) => {
  const [port, picPort, hitmanPort] = await freePorts(3);
  const config = readConfig({ ...environment, PORT: String(port), PIC_MATCH_PORT: String(picPort), SECRET_HITMAN_PORT: String(hitmanPort), SHUTDOWN_TIMEOUT_MS: '200' });
  let signals = 0;
  const runtime = await startRuntime(config, {
    log() {},
    spawnGame() {
      const child = Object.assign(new EventEmitter(), {
        pid: undefined, exitCode: null, signalCode: null,
        kill() { signals++; return false; },
      });
      process.nextTick(() => child.emit('error', new Error('spawn failed')));
      return child;
    },
  });
  t.after(() => runtime.stop());
  assert.equal(await runtime.done, 1);
  assert.equal(signals, 0);
});
// Posted by ChatGPT Chat on behalf of @virakngauv.
