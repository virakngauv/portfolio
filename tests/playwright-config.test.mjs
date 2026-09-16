import assert from "node:assert/strict";
import { test } from "node:test";

test("blank Playwright base URLs use the managed loopback server", async () => {
  const previousBaseUrl = process.env.PLAYWRIGHT_BASE_URL;
  process.env.PLAYWRIGHT_BASE_URL = "   ";

  try {
    const { default: config } = await import(
      `../playwright.config.mjs?blank-base-url=${Date.now()}`
    );
    assert.match(config.use.baseURL, /^http:\/\/127\.0\.0\.1:/);
    assert.ok(config.webServer);
  } finally {
    if (previousBaseUrl === undefined) delete process.env.PLAYWRIGHT_BASE_URL;
    else process.env.PLAYWRIGHT_BASE_URL = previousBaseUrl;
  }
});

// Posted by ChatGPT Chat on behalf of @virakngauv.
