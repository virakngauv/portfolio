import http from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';

export async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return server.address().port;
}
export async function freePort() {
  const server = http.createServer();
  const port = await listen(server);
  await new Promise((resolve) => server.close(resolve));
  return port;
}
export async function waitFor(condition, timeout = 5000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await condition()) return;
    await delay(25);
  }
  throw new Error('Timed out waiting for condition');
}
export function request(port, { path = '/', method = 'GET', headers = {}, body = '' } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path, method, headers, agent: false }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { text += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text }));
      res.on('error', reject);
    });
    req.setTimeout(2000, () => req.destroy(new Error('Test request timeout')));
    req.on('error', reject);
    req.end(body);
  });
}
export const environment = {
  PIC_MATCH_HOSTS: 'pic.test', SECRET_HITMAN_HOSTS: 'hitman.test',
  PIC_MATCH_ALLOWED_ORIGINS: 'https://pic.example', SECRET_HITMAN_ALLOWED_ORIGINS: 'https://hitman.example',
};
// Posted by ChatGPT Chat on behalf of @virakngauv.
