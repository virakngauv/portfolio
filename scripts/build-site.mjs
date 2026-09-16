import { cpSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("../", import.meta.url)));

export function buildSite({
  source = resolve(repositoryRoot, "site"),
  destination = resolve(repositoryRoot, "dist"),
} = {}) {
  rmSync(destination, { force: true, recursive: true });
  mkdirSync(destination, { recursive: true });
  cpSync(source, destination, { recursive: true });

  return readdirSync(destination, { recursive: true }).sort();
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const files = buildSite();
  console.log(`Built portfolio site in dist/ (${files.length} entries).`);
}

// Posted by ChatGPT Chat on behalf of @virakngauv.
