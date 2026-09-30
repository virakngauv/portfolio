import assert from "node:assert/strict";
import { test } from "node:test";
import { renderProject, renderProjects } from "../scripts/render-projects.mjs";

const project = {
  title: 'Notes & "Lists"',
  description: "Write and organize notes.",
  image: "assets/notes.jpg",
  url: "https://example.com/notes",
  github: { url: "https://github.com/example/notes", private: false },
};

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
    /aria-label="GitHub for Notes &amp; &quot;Lists&quot; \(private\)"/,
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
});
