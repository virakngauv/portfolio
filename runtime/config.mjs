import { isIP } from 'node:net';

export function integer(value, fallback, name, min = 1, max = 65535) {
  if (value === undefined || value === '') return fallback;
  if (!/^\d+$/.test(value) || Number(value) < min || Number(value) > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return Number(value);
}

export function hostname(value) {
  if (typeof value !== 'string' || !/^[a-z\d.-]+(?::\d{1,5})?$/i.test(value)) return null;
  const [name, port] = value.toLowerCase().split(':');
  if (port && (Number(port) < 1 || Number(port) > 65535)) return null;
  if (name.length > 253 || name.endsWith('.') || name.split('.').some(
    (label) => !/^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/.test(label),
  )) return null;
  return name;
}

function list(value, name) {
  const result = value?.split(',').map((item) => item.trim()).filter(Boolean);
  if (!result?.length) throw new Error(`${name} must be configured`);
  return [...new Set(result)];
}

export function readConfig(env = process.env) {
  const mode = env.CLIENT_IP_MODE ?? 'direct';
  if (!['direct', 'digitalocean'].includes(mode)) throw new Error('Invalid CLIENT_IP_MODE');
  const games = [
    ['pic-match', 'PIC_MATCH', 3200],
    ['secret-hitman-5', 'SECRET_HITMAN', 3225],
  ].map(([id, prefix, defaultPort]) => {
    const hosts = list(env[`${prefix}_HOSTS`], `${prefix}_HOSTS`);
    if (hosts.some((host) => hostname(host) !== host || host.includes(':'))) {
      throw new Error(`${prefix}_HOSTS must contain lowercase exact hostnames without ports`);
    }
    const origins = list(env[`${prefix}_ALLOWED_ORIGINS`], `${prefix}_ALLOWED_ORIGINS`);
    for (const origin of origins) {
      let url;
      try { url = new URL(origin); } catch { throw new Error(`Invalid ${prefix}_ALLOWED_ORIGINS`); }
      const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
      if (url.origin !== origin || (url.protocol !== 'https:' && !(url.protocol === 'http:' && local))) {
        throw new Error(`${prefix}_ALLOWED_ORIGINS requires exact HTTPS origins (HTTP only on loopback)`);
      }
    }
    return { id, hosts, origins, port: integer(env[`${prefix}_PORT`], defaultPort, `${prefix}_PORT`) };
  });
  const port = integer(env.PORT, 8080, 'PORT');
  if (new Set([port, ...games.map((game) => game.port)]).size !== 3) {
    throw new Error('Gateway and game ports must be distinct');
  }
  const hosts = games.flatMap((game) => game.hosts);
  if (new Set(hosts).size !== hosts.length) throw new Error('Each hostname must belong to exactly one game');
  const logLevel = env.LOG_LEVEL ?? 'info';
  if (!['info', 'warn', 'error'].includes(logLevel)) throw new Error('Invalid LOG_LEVEL');
  return {
    port, host: env.GATEWAY_HOST ?? '0.0.0.0', games, mode, logLevel,
    startupMs: integer(env.STARTUP_TIMEOUT_MS, 30000, 'STARTUP_TIMEOUT_MS', 100, 120000),
    shutdownMs: integer(env.SHUTDOWN_TIMEOUT_MS, 8000, 'SHUTDOWN_TIMEOUT_MS', 100, 30000),
  };
}

// Each backend trusts only this loopback gateway, never arbitrary forwarded chains.
export function childEnvironment(game, config, env = process.env) {
  const result = {};
  for (const key of ['PATH', 'HOME', 'TMPDIR', 'TEMP', 'SYSTEMROOT']) {
    if (env[key] !== undefined) result[key] = env[key];
  }
  return {
    ...result, NODE_ENV: 'production', HOST: '127.0.0.1', PORT: String(game.port),
    ALLOWED_ORIGINS: game.origins.join(','), ALLOW_PRIVATE_NETWORK_ORIGINS: 'false',
    TRUSTED_PROXIES: '127.0.0.1,::1,::ffff:127.0.0.1',
    TRUST_DIGITALOCEAN_PROXY: 'false', LOG_LEVEL: config.logLevel,
  };
}

export function clientAddress(request, mode) {
  const address = mode === 'digitalocean'
    ? request.headers['do-connecting-ip']
    : request.socket.remoteAddress;
  return typeof address === 'string' && isIP(address) ? address : null;
}

// Posted by ChatGPT Chat on behalf of @virakngauv.
