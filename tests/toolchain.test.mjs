import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("package metadata pins the supported development toolchain", () => {
  const packageJson = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  );

  assert.equal(packageJson.engines.node, ">=24 <25");
  assert.equal(packageJson.engines.pnpm, "11.9.0");
  assert.equal(packageJson.packageManager, "pnpm@11.9.0");
});

// Posted by ChatGPT Chat on behalf of @virakngauv.
