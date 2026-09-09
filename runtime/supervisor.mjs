import { spawn } from 'node:child_process';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { childEnvironment } from './config.mjs';
import { createGateway } from './gateway.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

function spawnGame(game, config) {
  return spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    cwd: `${root}projects/${game.id}`, env: childEnvironment(game, config),
    stdio: ['ignore', 'inherit', 'inherit'],
  });
}

export function healthy(port, timeout = 750) {
  return new Promise((resolve) => {
    let timer;
    const finish = (value) => { clearTimeout(timer); resolve(value); };
    const request = http.get({ hostname: '127.0.0.1', port, path: '/healthz', agent: false }, (response) => {
      let body = '';
      response.on('data', (chunk) => {
        body += chunk;
        if (body.length > 1024) request.destroy();
      });
      response.on('end', () => {
        try { finish(response.statusCode === 200 && JSON.parse(body).status === 'ok'); }
        catch { finish(false); }
      });
      response.on('error', () => finish(false));
    });
    timer = setTimeout(() => request.destroy(), timeout);
    request.on('error', () => finish(false));
  });
}

export async function startRuntime(config, options = {}) {
  let ready = false;
  let stopping = false;
  let checking = false;
  let everReady = false;
  let failures = 0;
  let interval;
  let startupTimer;
  let stopPromise;
  let resolveDone;
  const done = new Promise((resolve) => { resolveDone = resolve; });
  const records = [];
  const gateway = createGateway(config, () => ready && !stopping);
  const log = options.log ?? ((event) => console.log(JSON.stringify(event)));

  async function stop(code = 0) {
    if (stopPromise) return stopPromise;
    stopping = true;
    ready = false;
    clearInterval(interval);
    clearTimeout(startupTimer);
    stopPromise = (async () => {
      log({ event: 'runtime_stopping', code });
      const closed = new Promise((resolve) => gateway.server.close(() => resolve()));
      for (const { child } of records) {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
      }
      const killTimer = setTimeout(() => {
        for (const { child } of records) {
          if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
        }
        gateway.destroyConnections();
      }, config.shutdownMs);
      await Promise.all([closed, ...records.map((record) => record.exited)]);
      clearTimeout(killTimer);
      resolveDone(code);
    })();
    return stopPromise;
  }

  gateway.server.on('error', (error) => {
    log({ event: 'gateway_error', message: error.message });
    void stop(1);
  });
  for (const game of config.games) {
    let child;
    try { child = (options.spawnGame ?? spawnGame)(game, config); }
    catch (error) {
      log({ event: 'game_spawn_failed', game: game.id, message: error.message });
      await stop(1);
      throw error;
    }
    const exited = new Promise((resolve) => {
      child.once('error', (error) => {
        resolve();
        log({ event: 'game_error', game: game.id, message: error.message });
        if (!stopping) void stop(1);
      });
      child.once('exit', (code, signal) => {
        resolve();
        log({ event: 'game_exit', game: game.id, code, signal });
        if (!stopping) void stop(1);
      });
    });
    records.push({ child, exited });
  }
  gateway.server.listen(config.port, config.host);
  startupTimer = setTimeout(() => {
    log({ event: 'startup_timeout' });
    void stop(1);
  }, config.startupMs);
  async function check() {
    if (checking || stopping) return;
    checking = true;
    const results = await Promise.all(config.games.map((game) => healthy(game.port)));
    checking = false;
    if (stopping) return;
    ready = results.every(Boolean) && gateway.server.listening;
    if (ready) {
      if (!everReady) log({ event: 'runtime_ready', port: config.port });
      everReady = true;
      failures = 0;
      clearTimeout(startupTimer);
    } else if (everReady && ++failures >= 5) {
      log({ event: 'health_checks_failed' });
      void stop(1);
    }
  }
  interval = setInterval(() => void check(), options.checkIntervalMs ?? 1000);
  void check();
  return { gateway, children: records.map((record) => record.child), done, stop, isReady: () => ready && !stopping };
}

// Posted by ChatGPT Chat on behalf of @virakngauv.
