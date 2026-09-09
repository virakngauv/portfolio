import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

function check(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) check(path);
    else if (path.endsWith('.mjs')) {
      const result = spawnSync(process.execPath, ['--check', path], { stdio: 'inherit' });
      if (result.error) throw result.error;
      if (result.status !== 0) process.exit(result.status ?? 1);
    }
  }
}
for (const dir of ['runtime', 'scripts', 'tests']) check(dir);
// Posted by ChatGPT Chat on behalf of @virakngauv.
