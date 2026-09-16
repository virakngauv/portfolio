import assert from "node:assert/strict";
import { test } from "node:test";

test("blank Playwright base URLs use the managed loopback server", async () => {
  const previousBaseUrl = process.env.PLAYWRIGHT_BASE_URL;
  process.env.PLAYWRIGHT_BASE_URL = "   ";

  try {
    const { default: config, playwrightPort } = await import(
      `../playwright.config.mjs?blank-base-url=${Date.now()}`
    );
    assert.match(config.use.baseURL, /^http:\/\/127\.0\.0\.1:/);
    assert.ok(config.webServer);
    assert.equal(playwrightPort(undefined), 4194);
    assert.equal(playwrightPort(" 4200 "), 4200);
    for (const value of ["0", "65536", "4194px", "NaN"])
      assert.throws(() => playwrightPort(value), /integer from 1 to 65535/);
  } finally {
    if (previousBaseUrl === undefined) delete process.env.PLAYWRIGHT_BASE_URL;
    else process.env.PLAYWRIGHT_BASE_URL = previousBaseUrl;
  }
});

// Posted by ChatGPT Chat on behalf of @virakngauv.
