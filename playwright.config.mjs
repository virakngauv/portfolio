import { defineConfig, devices } from "@playwright/test";

const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL?.trim() || undefined;

export function playwrightPort(value) {
  const candidate = value?.trim();
  if (!candidate) return 4194;
  if (!/^\d+$/.test(candidate))
    throw new Error("PLAYWRIGHT_PORT must be an integer from 1 to 65535.");

  const port = Number(candidate);
  if (!Number.isInteger(port) || port < 1 || port > 65_535)
    throw new Error("PLAYWRIGHT_PORT must be an integer from 1 to 65535.");
  return port;
}

const port = playwrightPort(process.env.PLAYWRIGHT_PORT);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: externalBaseUrl ?? `http://127.0.0.1:${port}`,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: externalBaseUrl
    ? undefined
    : {
        command: "pnpm build && node scripts/serve-site.mjs",
        env: {
          ...process.env,
          DEV_LAN: "false",
          SITE_PORT: String(port),
          SITE_ROOT: "dist",
        },
        reuseExistingServer:
          process.env.PW_REUSE_SERVER === "1" && !process.env.CI,
        timeout: 30_000,
        url: `http://127.0.0.1:${port}`,
      },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { height: 720, width: 1280 },
      },
    },
    {
      name: "firefox",
      use: {
        ...devices["Desktop Firefox"],
        viewport: { height: 768, width: 1024 },
      },
    },
    {
      name: "webkit",
      use: {
        ...devices["Desktop Safari"],
        viewport: { height: 844, width: 390 },
      },
    },
  ],
});
