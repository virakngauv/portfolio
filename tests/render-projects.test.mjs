import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { format } from "prettier";
import { renderProject, renderProjects } from "../scripts/render-projects.mjs";

const project = {
  title: 'Notes & "Lists"',
  description: "Write and organize notes.",
  image: "assets/notes.jpg",
  url: "https://example.com/notes",
  github: { url: "https://github.com/example/notes", private: false },
};

test("the checked-in gallery matches the project data and renderer", async () => {
  const entries = JSON.parse(
    readFileSync(new URL("../site/projects.json", import.meta.url), "utf8"),
  );
  const expected = await format(renderProjects(entries), { parser: "html" });
  assert.equal(
    readFileSync(new URL("../site/projects.html", import.meta.url), "utf8"),
    expected,
    "Run pnpm projects:build and commit the generated gallery",
  );
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
  assert.match(html, /aria-label="Visit project, Notes &amp; &quot;Lists&quot;"/);
  assert.throws(
    () => renderProject({ ...project, github: { url: project.github.url } }),
    /Set github.private/,
  );
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
  assert.equal([...html.matchAll(/loading="eager"/g)].length, 3);
  assert.equal([...html.matchAll(/loading="lazy"/g)].length, 4);
});
