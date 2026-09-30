import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const index = readFileSync(
  new URL("../site/index.html", import.meta.url),
  "utf8",
);
const projects = readFileSync(
  new URL("../site/projects.html", import.meta.url),
  "utf8",
);
const styles = readFileSync(
  new URL("../site/styles.css", import.meta.url),
  "utf8",
);
const appSpec = readFileSync(
  new URL("../.do/app.example.yaml", import.meta.url),
  "utf8",
);
const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");

test("portfolio page exposes its primary content and accessible landmarks", () => {
  assert.match(index, /<html lang="en">/);
  assert.match(index, /<a class="skip-link" href="#main-content">/);
  assert.match(index, /<nav aria-label="Primary navigation">/);
  assert.match(index, /<main id="main-content" tabindex="-1">/);
  assert.match(index, /<h1>Virak Ngauv<\/h1>/);
  assert.match(index, /href="\.\/projects.html"/);
  assert.match(projects, /<h1>Projects<\/h1>/);
  assert.match(index, /<section class="about" aria-labelledby="about-title">/);
});

test("portfolio links to every featured project and its live games", () => {
  const entries = JSON.parse(
    readFileSync(new URL("../site/projects.json", import.meta.url), "utf8"),
  );
  for (const entry of entries) {
    for (const href of [entry.url, entry.github.url]) {
      assert.ok(projects.includes(`href="${href}"`));
    }
  }

  assert.match(
    appSpec,
    /PIC_MATCH_ALLOWED_ORIGINS\n {8}value: [^\n]*https:\/\/pic-match\.vercel\.app/,
  );
  assert.match(
    appSpec,
    /SECRET_HITMAN_ALLOWED_ORIGINS\n {8}value: [^\n]*https:\/\/secret-hitman-5\.vercel\.app/,
  );
});

test("every linked local asset exists", () => {
  const localAssets = [
    ...(index + projects).matchAll(/(?:href|src)="\.\/([^"#?]+)"/g),
  ].map((match) => match[1]);
  assert.ok(localAssets.length > 0);

  for (const asset of localAssets) {
    assert.equal(
      existsSync(new URL(`../site/${asset}`, import.meta.url)),
      true,
      asset,
    );
  }
});

test("styles include keyboard, mobile, and reduced-motion behavior", () => {
  assert.match(
    styles,
    /a:focus-visible\s*\{[^}]*outline: 2px solid currentColor/s,
  );
  assert.match(styles, /@media \(max-width: 700px\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
});

test("DigitalOcean example routes the root portfolio domain to a static component", () => {
  assert.match(
    readme,
    /importing the complete reviewed \[`.do\/app\.example\.yaml`\]/,
  );
  assert.match(
    readme,
    /`portfolio-site` static component[^\n]+serving `dist\/`/,
  );
  assert.match(
    readme,
    /Before the initial import, change both `deploy_on_push` entries to `false`/,
  );
  assert.match(appSpec, /static_sites:\n {2}- name: portfolio-site/);
  assert.match(
    appSpec,
    /build_command: pnpm install --frozen-lockfile && pnpm build/,
  );
  assert.match(appSpec, /output_dir: dist/);
  assert.match(appSpec, /exact: virakngauv\.com/);

  const ingress = appSpec.slice(
    appSpec.indexOf("ingress:\n"),
    appSpec.indexOf("\nalerts:"),
  );
  const portfolioRoute = ingress
    .split(/\n {4}- match:\n/)
    .find((route) => route.includes("exact: virakngauv.com"));
  assert.ok(portfolioRoute);
  assert.match(portfolioRoute, /component:\n {8}name: portfolio-site/);
});

// Posted by ChatGPT Chat on behalf of @virakngauv.
