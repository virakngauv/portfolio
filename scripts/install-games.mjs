import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
for (const id of ['pic-match', 'secret-hitman-5']) {
  const cwd = `${root}projects/${id}`;
  if (!existsSync(`${cwd}/server/index.ts`)) {
    throw new Error(`Missing ${id} submodule. Run: git submodule update --init --recursive`);
  }
  const pkg = JSON.parse(readFileSync(`${cwd}/package.json`, 'utf8'));
  if (pkg.scripts['start:server'] !== 'tsx server/index.ts') {
    throw new Error(`${id}'s server entry point changed; review its runtime integration before deploying`);
  }
  const result = spawnSync('pnpm', ['install', '--prod', '--frozen-lockfile'], { cwd, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
// Posted by ChatGPT Chat on behalf of @virakngauv.
