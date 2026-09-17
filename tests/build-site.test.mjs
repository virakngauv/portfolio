import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { buildSite } from "../scripts/build-site.mjs";

test("static build is deterministic and removes stale output", () => {
  const root = mkdtempSync(join(tmpdir(), "portfolio-build-"));
  const destination = join(root, "dist");

  try {
    buildSite({ source: new URL("../site/", import.meta.url), destination });
    writeFileSync(join(destination, "stale.txt"), "remove me");
    const first = buildSite({
      source: new URL("../site/", import.meta.url),
      destination,
    });
    const second = buildSite({
      source: new URL("../site/", import.meta.url),
      destination,
    });

    assert.deepEqual(first, second);
    assert.equal(first.includes("stale.txt"), false);
    assert.equal(
      readFileSync(join(destination, "index.html"), "utf8").includes(
        '<main id="main-content">',
      ),
      true,
    );
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

// Posted by ChatGPT Chat on behalf of @virakngauv.
