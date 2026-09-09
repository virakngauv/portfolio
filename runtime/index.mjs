import { readConfig } from './config.mjs';
import { startRuntime } from './supervisor.mjs';

try {
  const runtime = await startRuntime(readConfig());
  const shutdown = () => { void runtime.stop(0); };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  process.exitCode = await runtime.done;
  process.removeListener('SIGINT', shutdown);
  process.removeListener('SIGTERM', shutdown);
} catch (error) {
  console.error(JSON.stringify({ event: 'runtime_failed', message: error.message }));
  process.exitCode = 1;
}

// Posted by ChatGPT Chat on behalf of @virakngauv.
