import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { format } from "prettier";
import {
  renderHome,
  renderProject,
  renderProjects,
} from "../scripts/render-projects.mjs";

const project = {
  title: 'Notes & "Lists"',
  description: "Write and organize notes.",
  image: "assets/notes.jpg",
  url: "https://example.com/notes",
  github: { url: "https://github.com/example/notes", private: false },
};

test("the checked-in pages match the shared project data and renderer", async () => {
  const entries = JSON.parse(
    readFileSync(new URL("../site/projects.json", import.meta.url), "utf8"),
  );
  for (const [file, render] of [
    ["projects.html", renderProjects],
    ["index.html", renderHome],
  ]) {
    assert.equal(
      readFileSync(new URL(`../site/${file}`, import.meta.url), "utf8"),
      await format(render(entries), { parser: "html" }),
      "Run pnpm projects:build and commit both generated pages",
    );
  }
});

test("public source links have no visibility label; private links identify restricted access", () => {
  const publicHtml = renderProject(project);
  assert.match(publicHtml, />GitHub<\/a>/);
  assert.doesNotMatch(publicHtml, /\(public\)|\(private\)/);
  const privateHtml = renderProject({
    ...project,
    github: { ...project.github, private: true },
  });
  assert.match(privateHtml, />GitHub \(private\)<\/a>/);
  assert.match(
    privateHtml,
    /aria-label="GitHub \(private\) for Notes &amp; &quot;Lists&quot;"/,
  );
  assert.match(privateHtml, /href="https:\/\/github.com\/example\/notes"/);
});

test("project images and titles link to the product and GitHub stays a separate link", () => {
  const html = renderProject(project);
  assert.match(html, /href="https:\/\/example.com\/notes"/);
  assert.match(html, /<h2>Notes &amp; &quot;Lists&quot;<\/h2>/);
  let depth = 0;
  for (const match of html.matchAll(/<a\s[^>]*>|<\/a>/g)) {
    depth += match[0].startsWith("</") ? -1 : 1;
    assert.ok(depth >= 0 && depth <= 1, "links must not be nested");
  }
  assert.equal(depth, 0);
  assert.match(
    html,
    /aria-label="Visit project, Notes &amp; &quot;Lists&quot;"/,
  );
  assert.throws(
    () => renderProject({ ...project, github: { url: project.github.url } }),
    /Set github.private/,
  );
});

test("image zoom variants follow project data instead of gallery position", () => {
  const defaultHtml = renderProject(project);
  assert.match(defaultHtml, /class="project-media"/);
  assert.doesNotMatch(defaultHtml, /project-media--gentle-zoom/);

  const gentleHtml = renderProject({ ...project, imageZoom: "gentle" });
  assert.match(gentleHtml, /class="project-media project-media--gentle-zoom"/);

  const noZoomHtml = renderProject({ ...project, imageZoom: "none" });
  assert.match(noZoomHtml, /class="project-media project-media--no-zoom"/);
});

test("the gallery grows with additional projects without requiring a category", () => {
  const html = renderProjects(
    Array.from({ length: 7 }, (_, index) => ({
      ...project,
      title: `Project ${index + 1}`,
    })),
  );
  assert.equal([...html.matchAll(/class="project-card"/g)].length, 7);
  assert.match(html, /<h2>Project 7<\/h2>/);
  assert.equal([...html.matchAll(/loading="eager"/g)].length, 1);
  assert.equal([...html.matchAll(/loading="lazy"/g)].length, 6);
});

test("homepage shows selected work with nested headings and escaped engineering details", () => {
  const html = renderHome(
    Array.from({ length: 4 }, (_, index) => ({
      ...project,
      title: `Project ${index + 1}`,
      detail: 'Rooms <resume> & "recover"',
    })),
  );
  assert.equal([...html.matchAll(/class="project-card"/g)].length, 3);
  assert.match(html, /<h3>Project 3<\/h3>/);
  assert.doesNotMatch(html, /Project 4/);
  assert.match(html, /Rooms &lt;resume&gt; &amp; &quot;recover&quot;/);
});
