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

test("external Playwright servers do not depend on the local port", async () => {
  const previousBaseUrl = process.env.PLAYWRIGHT_BASE_URL;
  const previousPort = process.env.PLAYWRIGHT_PORT;
  process.env.PLAYWRIGHT_BASE_URL = " https://portfolio.example/test/ ";
  process.env.PLAYWRIGHT_PORT = "invalid";

  try {
    const { default: config } = await import(
      `../playwright.config.mjs?external-base-url=${Date.now()}`
    );
    assert.equal(config.use.baseURL, "https://portfolio.example/test/");
    assert.equal(config.webServer, undefined);
  } finally {
    if (previousBaseUrl === undefined) delete process.env.PLAYWRIGHT_BASE_URL;
    else process.env.PLAYWRIGHT_BASE_URL = previousBaseUrl;
    if (previousPort === undefined) delete process.env.PLAYWRIGHT_PORT;
    else process.env.PLAYWRIGHT_PORT = previousPort;
  }
});

// Posted by ChatGPT Chat on behalf of @virakngauv.
