/* global document, window */
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const projects = JSON.parse(
  readFileSync(new URL("../site/projects.json", import.meta.url), "utf8"),
);

test("primary navigation and project links are usable", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Virak Ngauv",
  );
  await page.getByRole("link", { name: "View my projects" }).click();
  await expect(page).toHaveURL(/\/projects.html$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Projects");
  for (const project of projects) {
    const { title: name, url: product, github } = project;
    const source = github.url;
    const sourceName = `GitHub for ${name}${github.private ? " (private)" : ""}`;
    await expect(
      page.getByRole("link", { name: `Visit ${name}`, exact: true }),
    ).toHaveAttribute("href", product);
    await expect(
      page.getByRole("link", { name: sourceName, exact: true }),
    ).toHaveAttribute("href", source);
    await expect(
      page.getByRole("link", { name: sourceName, exact: true }),
    ).toHaveText(github.private ? "GitHub (private)" : "GitHub");
  }
  await page.getByRole("link", { name: "Home", exact: true }).click();
  await expect(page.getByRole("heading", { name: "About me" })).toBeVisible();
});

test("keyboard users can reveal and use the skip link", async ({
  browserName,
  page,
}) => {
  await page.goto("/");

  const skipLink = page.getByRole("link", { name: "Skip to content" });
  if (browserName === "webkit") await skipLink.focus();
  else await page.keyboard.press("Tab");
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toBeVisible();
  await expect(skipLink).toHaveCSS("outline-style", "solid");
  await skipLink.press("Enter");
  await expect(page).toHaveURL(/#main-content$/);
});

test("custom not-found page returns a real 404 with a recovery action", async ({
  page,
}) => {
  const response = await page.goto("/nested/missing-page/");

  expect(response?.status()).toBe(404);
  await expect(page.locator('link[rel="stylesheet"]')).toHaveAttribute(
    "href",
    "/styles.css",
  );
  await expect(
    page.getByRole("heading", { name: "Page not found" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Return home" }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("project cards follow the active responsive layout", async ({ page }) => {
  await page.goto("/projects.html");
  const cards = page.locator(".project-card");
  const first = await cards.nth(0).boundingBox();
  const second = await cards.nth(1).boundingBox();
  expect(first).not.toBeNull();
  expect(second).not.toBeNull();

  const width = page.viewportSize()?.width ?? 0;
  if (width <= 700) {
    expect(second.y).toBeGreaterThan(first.y + first.height);
    for (const name of ["Home", "Projects"]) {
      const link = page.getByRole("link", { name, exact: true });
      await expect(link).toBeVisible();
      await link.focus();
      await expect(link).toBeFocused();
      await expect(link).toHaveCSS("outline-style", "solid");
    }
  } else expect(Math.abs(second.y - first.y)).toBeLessThan(2);
});

test("project artwork loads with an image content type", async ({
  page,
  request,
}) => {
  await page.goto("/projects.html");
  const images = page.locator(".project img");
  for (const image of await images.all()) {
    await image.scrollIntoViewIfNeeded();
    await expect
      .poll(() =>
        image.evaluate(
          (element) => element.complete && element.naturalWidth > 0,
        ),
      )
      .toBe(true);
    const response = await request.get(await image.getAttribute("src"));
    expect(response.headers()["content-type"]).toBe("image/jpeg");
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
