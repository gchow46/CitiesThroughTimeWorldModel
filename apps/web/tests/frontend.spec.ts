import { expect, test } from "@playwright/test";

for (const model of ["lingbot-world-2", "happy-oyster-adventure"]) {
  test(`preview contract, keyboard controls and repeat search: ${model}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`/?model=${model}`);
    await expect(page.getByRole("heading", { name: /Walk into/ })).toBeVisible();
    await expect
      .poll(() =>
        page
          .getByAltText("Stylized illustration of a canal street")
          .evaluate((image: HTMLImageElement) => image.naturalWidth),
      )
      .toBeGreaterThan(0);
    await page.getByRole("button", { name: /Try a local UI preview/ }).click();
    await expect(page.getByText("No API calls · no live world")).toBeVisible();
    await page.getByRole("button", { name: "Try keyboard controls" }).click();
    await page.keyboard.down("w");
    await expect(page.locator("kbd.down")).toHaveText("W");
    await page.keyboard.up("w");
    await expect(page.locator("kbd.down")).toHaveCount(0);
    await page.keyboard.down("d");
    await page.keyboard.press("Escape");
    await expect(page.locator("kbd.down")).toHaveCount(0);
    await page.keyboard.up("d");
    await expect(page.getByRole("button", { name: "Try keyboard controls" })).toBeVisible();
    await page.getByRole("button", { name: /New search/ }).click();
    await page.getByRole("button", { name: /Try a local UI preview/ }).click();
    await expect(page.getByRole("button", { name: "Try keyboard controls" })).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test("reseed swaps in the next archival photograph", async ({ page }) => {
  await page.goto("/?model=lingbot-world-2");
  await page.getByRole("button", { name: /Try a local UI preview/ }).click();
  const credit = page.locator(".seed-credit p");
  await expect(credit).toContainText("Imagined canal street");
  await page.getByRole("button", { name: /Try another photograph/ }).click();
  await expect(credit).toContainText("Alternate UI illustration");
  // The previous seed cycles back into alternates — button stays available.
  await expect(page.getByRole("button", { name: /Try another photograph/ })).toBeEnabled();
});

test("backend failure is actionable and never reflects arbitrary server messages", async ({
  page,
}) => {
  await page.route("**/api/world", (route) =>
    route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({
        error: "insufficient_archival_photos",
        message: "secret-do-not-reflect",
        closestDecade: 1970,
      }),
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Explore this era" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Try the 1970s");
  await expect(page.getByRole("main").getByRole("alert")).not.toContainText(
    "secret-do-not-reflect",
  );
  await expect(page.getByRole("button", { name: /Explore this era/ })).toBeEnabled();
});

test("cancelling an in-flight request returns to search", async ({ page }) => {
  await page.route("**/api/world", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await route
      .fulfill({
        status: 502,
        contentType: "application/json",
        body: JSON.stringify({ error: "upstream_failed" }),
      })
      .catch(() => undefined);
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Explore this era" }).click();
  await page.getByRole("button", { name: "Cancel journey" }).click();
  await expect(page.getByRole("heading", { name: /Walk into/ })).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
});

test("unknown model is rejected without a network request", async ({ page }) => {
  let requests = 0;
  await page.route("**/api/world", (route) => {
    requests++;
    return route.abort();
  });
  await page.goto("/?model=not-enabled");
  await page.getByRole("button", { name: "Explore this era" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("isn't enabled");
  expect(requests).toBe(0);
});

test("small screen has no horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
