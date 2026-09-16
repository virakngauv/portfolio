import { expect, test } from "@playwright/test";

test("primary navigation and project links are usable", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Software for the moments people share.",
  );
  await page.getByRole("link", { name: "Explore selected work" }).click();
  await expect(page).toHaveURL(/#work$/);
  await expect(
    page.getByRole("heading", {
      name: "Made to be played, shared, and relied on.",
    }),
  ).toBeVisible();

  await expect(
    page.getByRole("link", { name: "Play Pic Match" }),
  ).toHaveAttribute("href", "https://pic-match.vercel.app");
  await expect(
    page.getByRole("link", { name: "Play Secret Hitman" }),
  ).toHaveAttribute("href", "https://secret-hitman-5.vercel.app");
  await expect(
    page.getByRole("link", { name: "Explore the system" }),
  ).toHaveAttribute("href", "https://github.com/virakngauv/portfolio");
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
  const response = await page.goto("/missing-page");

  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { name: "This page wandered off." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Return home" }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("project cards follow the active responsive layout", async ({ page }) => {
  await page.goto("/");
  const cards = page.locator(".project-card");
  const first = await cards.nth(0).boundingBox();
  const second = await cards.nth(1).boundingBox();
  expect(first).not.toBeNull();
  expect(second).not.toBeNull();

  const width = page.viewportSize()?.width ?? 0;
  if (width <= 580) {
    expect(second.y).toBeGreaterThan(first.y + first.height);
    for (const name of ["Work", "About"]) {
      const link = page.getByRole("link", { name, exact: true });
      await expect(link).toBeVisible();
      await link.focus();
      await expect(link).toBeFocused();
      await expect(link).toHaveCSS("outline-style", "solid");
    }
  } else expect(Math.abs(second.y - first.y)).toBeLessThan(2);
});
