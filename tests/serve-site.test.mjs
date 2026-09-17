import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  lanAddresses,
  parsePort,
  resolveRequest,
} from "../scripts/serve-site.mjs";

const siteRoot = fileURLToPath(new URL("../site/", import.meta.url));

test("site server accepts valid ports and rejects ambiguous values", () => {
  assert.equal(parsePort("4173"), 4173);
  for (const value of ["0", "65536", "4173x", "-1", ""]) {
    assert.throws(() => parsePort(value), /SITE_PORT/);
  }
});

test("site server resolves local assets without allowing traversal", () => {
  assert.match(resolveRequest(siteRoot, "/"), /index\.html$/);
  assert.match(resolveRequest(siteRoot, "/styles.css"), /styles\.css$/);
  assert.equal(resolveRequest(siteRoot, "/../package.json"), null);
  assert.equal(resolveRequest(siteRoot, "/%2e%2e/package.json"), null);
  assert.equal(resolveRequest(siteRoot, "/%E0%A4%A"), null);
});

test("LAN address reporting includes only external IPv4 addresses", () => {
  const interfaces = {
    en0: [
      { address: "192.168.1.4", family: "IPv4", internal: false },
      { address: "fe80::1", family: "IPv6", internal: false },
    ],
    lo0: [{ address: "127.0.0.1", family: "IPv4", internal: true }],
  };
  assert.deepEqual(lanAddresses(interfaces), ["192.168.1.4"]);
});

// Posted by ChatGPT Chat on behalf of @virakngauv.
