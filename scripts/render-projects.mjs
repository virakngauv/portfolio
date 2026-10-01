import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const escape = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

export function renderProject(project, index = 0) {
  if (typeof project.github.private !== "boolean")
    throw new Error(`Set github.private for ${project.title}`);
  const label = project.github.private ? "GitHub (private)" : "GitHub";
  return `
          <article class="project-card">
            <a class="project" href="${escape(project.url)}" aria-label="View ${escape(project.title)}">
              <img src="./${escape(project.image)}" alt="" width="1000" height="667" loading="${index < 3 ? "eager" : "lazy"}" />
              <h2>${escape(project.title)}</h2>
            </a>
            <p>${escape(project.description)}</p>
            <div class="project-links">
              <a href="${escape(project.url)}" aria-label="Visit project, ${escape(project.title)}">Visit project</a>
              <a href="${escape(project.github.url)}" aria-label="${label} for ${escape(project.title)}">${label}</a>
            </div>
          </article>`;
}

export function renderProjects(projects) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="description" content="Software projects by Virak Ngauv." />
    <meta name="theme-color" content="#ffffff" />
    <title>Projects | Virak Ngauv</title>
    <link rel="icon" href="./favicon.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body class="gallery-page">
    <a class="skip-link" href="#main-content">Skip to content</a>
    <div class="page">
      <header>
        <nav aria-label="Primary navigation">
          <a href="./index.html">Home</a>
          <a href="./projects.html" aria-current="page">Projects</a>
        </nav>
        <a href="https://github.com/virakngauv">GitHub</a>
      </header>
      <main id="main-content" tabindex="-1">
        <h1>Projects</h1>
        <div class="gallery">${projects.map(renderProject).join("")}
        </div>
      </main>
    </div>
  </body>
</html>
`;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const projects = JSON.parse(
    readFileSync(new URL("../site/projects.json", import.meta.url), "utf8"),
  );
  const { format } = await import("prettier");
  writeFileSync(
    new URL("../site/projects.html", import.meta.url),
    await format(renderProjects(projects), { parser: "html" }),
  );
}
