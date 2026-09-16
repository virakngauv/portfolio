import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("../", import.meta.url)));
const allowedRoots = new Map([
  ["site", resolve(repositoryRoot, "site")],
  ["dist", resolve(repositoryRoot, "dist")],
]);

export function parsePort(value) {
  if (!/^\d+$/.test(value))
    throw new Error("SITE_PORT must be an integer from 1 to 65535");

  const port = Number.parseInt(value, 10);
  if (port < 1 || port > 65535) {
    throw new Error("SITE_PORT must be an integer from 1 to 65535");
  }

  return port;
}

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".svg", "image/svg+xml"],
]);

export function resolveRequest(siteRoot, pathname) {
  const normalizedRoot = resolve(siteRoot);
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  const requested =
    decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const candidate = resolve(normalizedRoot, requested);

  if (!candidate.startsWith(`${normalizedRoot}${sep}`)) return null;

  try {
    if (statSync(candidate).isFile()) return candidate;
  } catch {
    // Missing files use the custom 404 page below.
  }

  return null;
}

export function createSiteServer(siteRoot) {
  return createServer((request, response) => {
    let pathname;
    try {
      pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    } catch {
      response.writeHead(400).end("Bad request");
      return;
    }

    const path = resolveRequest(siteRoot, pathname);
    const responsePath = path ?? resolve(siteRoot, "404.html");
    const status = path ? 200 : 404;
    const headers = {
      "Content-Type":
        contentTypes.get(extname(responsePath)) ?? "application/octet-stream",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    };

    response.writeHead(status, headers);
    if (request.method === "HEAD") response.end();
    else createReadStream(responsePath).pipe(response);
  });
}

export function lanAddresses(interfaces = networkInterfaces()) {
  return Object.values(interfaces)
    .flatMap((addresses) => addresses ?? [])
    .filter((address) => address.family === "IPv4" && !address.internal)
    .map((address) => address.address);
}

export function startSiteServer({ env = process.env } = {}) {
  const rootName = env.SITE_ROOT ?? "site";
  const siteRoot = allowedRoots.get(rootName);
  if (!siteRoot) throw new Error("SITE_ROOT must be either site or dist");

  const port = parsePort(env.SITE_PORT ?? "4173");
  const lanEnabled = env.DEV_LAN === "true";
  const host = lanEnabled ? "0.0.0.0" : "127.0.0.1";
  const server = createSiteServer(siteRoot);

  server.listen(port, host, () => {
    console.log(`Portfolio site: http://127.0.0.1:${port}`);
    if (lanEnabled) {
      const addresses = lanAddresses();
      if (addresses.length === 0)
        console.log("LAN access enabled; no external IPv4 address found.");
      for (const address of addresses)
        console.log(`Portfolio site (LAN): http://${address}:${port}`);
    }
  });

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => server.close(() => process.exit(0)));
  }

  return server;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  startSiteServer();

// Posted by ChatGPT Chat on behalf of @virakngauv.
