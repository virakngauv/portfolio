import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const escape = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

export function renderProject(project, index = 0, heading = "h2") {
  if (typeof project.github.private !== "boolean")
    throw new Error(`Set github.private for ${project.title}`);
  const label = project.github.private ? "GitHub (private)" : "GitHub";
  const mediaClass =
    project.imageZoom === "gentle"
      ? " project-media--gentle-zoom"
      : project.imageZoom === "none"
        ? " project-media--no-zoom"
        : "";
  return `
          <article class="project-card">
            <a class="project" href="${escape(project.url)}" aria-label="View ${escape(project.title)}">
              <span class="project-media${mediaClass}"><img src="./${escape(project.image)}" alt="" width="1176" height="1470" loading="${index === 0 ? "eager" : "lazy"}" /></span>
              <${heading}>${escape(project.title)}</${heading}>
            </a>
            <p>${escape(project.description)}</p>
            ${project.detail ? `<p class="project-detail">${escape(project.detail)}</p>` : ""}
            <div class="project-links">
              <a href="${escape(project.url)}" aria-label="Visit project, ${escape(project.title)}">Visit project</a>
              <a href="${escape(project.github.url)}" aria-label="${label} for ${escape(project.title)}">${label}</a>
            </div>
          </article>`;
}

const origin = "https://www.virakngauv.com";

function metadata(title, description, path) {
  return `<meta name="description" content="${escape(description)}" />
    <meta property="og:title" content="${escape(title)}" />
    <meta property="og:description" content="${escape(description)}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${origin}${path}" />
    <meta property="og:image" content="${origin}/assets/pic-match.jpg" />
    <meta property="og:image:alt" content="A two-player Pic Match game" />
    <meta name="twitter:card" content="summary" />
    <link rel="canonical" href="${origin}${path}" />`;
}

export function renderProjects(projects) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    ${metadata("Projects | Virak Ngauv", "Games and web projects by Virak Ngauv, with live demos and source links.", "/projects.html")}
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
        <div class="gallery">${projects.map((project, index) => renderProject(project, index)).join("")}
        </div>
      </main>
    </div>
  </body>
</html>
`;
}

export function renderHome(projects) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    ${metadata("Virak Ngauv", "I build useful web tools and playful games. Explore my projects and try them with friends.", "/")}
    <meta name="theme-color" content="#ffffff" />
    <title>Virak Ngauv</title>
    <link rel="icon" href="./favicon.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body class="home-page">
    <a class="skip-link" href="#main-content">Skip to content</a>
    <div class="page">
      <header>
        <nav aria-label="Primary navigation">
          <a href="./index.html" aria-current="page">Home</a>
          <a href="./projects.html">Projects</a>
        </nav>
        <a href="https://github.com/virakngauv">GitHub</a>
      </header>
      <main id="main-content" tabindex="-1">
        <div class="intro">
          <h1>Virak Ngauv</h1>
          <section class="about" aria-labelledby="about-title">
            <h2 id="about-title">About me</h2>
            <p class="positioning">I build useful web tools and playful games.</p>
            <p>I like turning small ideas into software people can use, whether that's a tool that makes their day easier or a game to play with friends.</p>
          </section>
        </div>
        <section class="selected-projects" aria-labelledby="projects-title">
          <div class="section-heading">
            <h2 id="projects-title">Selected projects</h2>
            <a class="projects-link" href="./projects.html">View my projects</a>
          </div>
          <div class="gallery">${projects
            .slice(0, 3)
            .map((project, index) => renderProject(project, index, "h3"))
            .join("")}
          </div>
        </section>
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
  for (const [file, html] of [
    ["projects.html", renderProjects(projects)],
    ["index.html", renderHome(projects)],
  ]) {
    writeFileSync(
      new URL(`../site/${file}`, import.meta.url),
      await format(html, { parser: "html" }),
    );
  }
}
