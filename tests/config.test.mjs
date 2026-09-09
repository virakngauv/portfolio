import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readConfig, childEnvironment, hostname } from '../runtime/config.mjs';
import { forwardedHeaders } from '../runtime/gateway.mjs';
import { environment } from './helpers.mjs';

test('configuration requires explicit distinct hosts, origins and ports', () => {
  assert.throws(() => readConfig({}), /must be configured/);
  const config = readConfig(environment);
  assert.deepEqual(config.games.map((game) => game.port), [3200, 3225]);
  for (const patch of [
    { PORT: '3200' }, { PIC_MATCH_PORT: '3225' }, { PORT: '-1' }, { PORT: '65536' },
    { PORT: '12foo' }, { SECRET_HITMAN_HOSTS: 'pic.test' }, { PIC_MATCH_HOSTS: '*.test' },
    { PIC_MATCH_HOSTS: 'pic.test:80' }, { CLIENT_IP_MODE: 'trust-anything' },
    { LOG_LEVEL: 'debug' }, { SHUTDOWN_TIMEOUT_MS: 'Infinity' },
  ]) assert.throws(() => readConfig({ ...environment, ...patch }));
});

test('origins must be exact HTTPS origins, except loopback development', () => {
  for (const origin of ['*', 'http://public.example', 'https://pic.example/', 'https://pic.example/path', 'null', 'https://user:pass@pic.example']) {
    assert.throws(() => readConfig({ ...environment, PIC_MATCH_ALLOWED_ORIGINS: origin }));
  }
  assert.equal(readConfig({ ...environment, PIC_MATCH_ALLOWED_ORIGINS: 'http://localhost:3000' }).games[0].origins[0], 'http://localhost:3000');
});

test('hostname normalization rejects URL tricks and wildcard suffixes', () => {
  assert.equal(hostname('PIC.TEST:8080'), 'pic.test');
  for (const value of ['pic.test.evil/', 'pic.test@evil', 'pic.test:99999', 'pic..test', '.pic.test', 'pic.test.', undefined]) {
    assert.equal(hostname(value), null);
  }
});

test('children receive isolated production configuration without parent secrets', () => {
  const config = readConfig(environment);
  const child = childEnvironment(config.games[0], config, { PATH: '/bin', CLERK_SECRET_KEY: 'secret', NODE_OPTIONS: '--require evil', ALLOWED_ORIGINS: '*' });
  assert.equal(child.HOST, '127.0.0.1');
  assert.equal(child.PORT, '3200');
  assert.equal(child.ALLOWED_ORIGINS, 'https://pic.example');
  assert.equal(child.ALLOW_PRIVATE_NETWORK_ORIGINS, 'false');
  assert.equal(child.TRUST_DIGITALOCEAN_PROXY, 'false');
  assert.equal(child.CLERK_SECRET_KEY, undefined);
  assert.equal(child.NODE_OPTIONS, undefined);
});

test('direct mode overwrites spoofed IP headers and preserves policy headers', () => {
  const headers = forwardedHeaders({ socket: { remoteAddress: '127.0.0.1' }, headers: {
    host: 'pic.test', origin: 'https://pic.example', connection: 'origin, host, x-private',
    'x-private': 'remove', forwarded: 'for=spoof', 'x-forwarded-host': 'evil',
    'x-forwarded-for': '8.8.8.8', 'x-real-ip': '8.8.8.8', 'do-connecting-ip': '8.8.8.8',
  } }, 'direct');
  assert.equal(headers['x-forwarded-for'], '127.0.0.1');
  for (const key of ['forwarded', 'x-forwarded-host', 'x-private', 'x-real-ip', 'do-connecting-ip']) assert.equal(headers[key], undefined);
  assert.equal(headers.origin, 'https://pic.example');
  assert.equal(headers.host, 'pic.test');
});

test('DigitalOcean mode requires one valid provider IP and never trusts X-Forwarded-For', () => {
  const req = { socket: { remoteAddress: '10.0.0.1' }, headers: { 'do-connecting-ip': '2001:db8::1', 'x-forwarded-for': 'spoof' } };
  assert.equal(forwardedHeaders(req, 'digitalocean')['x-forwarded-for'], '2001:db8::1');
  for (const value of [undefined, 'spoof', '1.2.3.4, 5.6.7.8', ['1.2.3.4']]) {
    assert.equal(forwardedHeaders({ ...req, headers: { 'do-connecting-ip': value } }, 'digitalocean'), null);
  }
});
// Posted by ChatGPT Chat on behalf of @virakngauv.
