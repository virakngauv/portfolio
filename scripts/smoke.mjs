import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readConfig } from '../runtime/config.mjs';

const config = readConfig();
if (config.mode !== 'direct') throw new Error('This local smoke test requires CLIENT_IP_MODE=direct');
const root = fileURLToPath(new URL('../', import.meta.url));
for (const game of config.games) {
  const child = spawn(process.execPath, ['--import', 'tsx', `${root}scripts/smoke-game.mjs`], {
    cwd: `${root}projects/${game.id}`,
    env: {
      ...process.env, SMOKE_GAME: game.id, SMOKE_HOST: game.hosts[0],
      SMOKE_ORIGIN: game.origins[0], SMOKE_URL: `http://127.0.0.1:${config.port}`,
    },
    stdio: 'inherit',
  });
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (status) => resolve(status ?? 1));
  });
  if (code !== 0) process.exit(code);
}
// Posted by ChatGPT Chat on behalf of @virakngauv.
