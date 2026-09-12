import { expect, test, type Page } from "@playwright/test";

// Then & Now comparison E2E — runs against the deterministic fake driver via
// NEXT_PUBLIC_ENABLE_THEN_NOW=true + NEXT_PUBLIC_COMPARISON_DRIVER=fake
// (see playwright.config.ts webServer env). No Google requests are made.

function trackGoogleRequests(page: Page) {
  const requests: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (/maps\.googleapis|maps\.google\.|streetview|google\.com\/maps/.test(url))
      requests.push(url);
  });
  return requests;
}

test("preview: split appears beside the same world, toggles without a new session", async ({
  page,
}) => {
  const googleRequests = trackGoogleRequests(page);
  await page.goto("/?model=lingbot-world-2");
  await page.getByRole("button", { name: /Try a local UI preview/ }).click();

  const now = page.locator(".present-pane");
  await expect(now).toBeVisible();
  await expect(now).toContainText("Present-day reference · simulated imagery");
  await expect(now).toContainText("Captured Jan 2024");
  await expect(now).toContainText("Verified photo reference");
  await expect(now).toContainText(/Independent exploration/);
  await expect(page.getByRole("separator", { name: /Resize/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Return to reference" })).toBeVisible();

  // Divider keyboard control + reset-to-equal.
  const divider = page.getByRole("separator", { name: /Resize/ });
  const thenPane = page.locator(".pane-then");
  const before = await thenPane.evaluate((el) => el.getBoundingClientRect().width);
  await divider.press("ArrowRight");
  const after = await thenPane.evaluate((el) => el.getBoundingClientRect().width);
  expect(after).toBeGreaterThan(before);
  await divider.press("Enter");
  const reset = await thenPane.evaluate((el) => el.getBoundingClientRect().width);
  expect(Math.abs(reset - before)).toBeLessThan(40);

  // Toggle collapses and restores the pane — the world session is untouched.
  await page.getByRole("button", { name: /Then & Now/ }).click();
  await expect(now).toBeHidden();
  await expect(page.locator(".world-video")).toBeVisible();
  await page.getByRole("button", { name: /Then & Now/ }).click();
  await expect(now).toBeVisible();

  // The map widget is temporarily hidden; the driver still receives a map host.
  await expect(page.locator(".loc-widget")).toHaveCount(0);
  await expect(page.locator(".loc-map")).toBeAttached();

  expect(googleRequests).toEqual([]);
});

test("input isolation: pointer interaction with the present pane releases held keys", async ({
  page,
}) => {
  await page.goto("/?model=lingbot-world-2");
  await page.getByRole("button", { name: /Try a local UI preview/ }).click();
  await expect(page.locator(".present-pane")).toBeVisible();
  await page.getByRole("button", { name: "Try keyboard controls" }).click();
  await page.keyboard.down("w");
  await expect(page.locator("kbd.down")).toHaveText("W");
  // Clicking into the comparison pane must publish IDLE + release held keys.
  // (.pano-host is where a real Street View panorama would receive the click.)
  await page.locator(".pano-host").click();
  await expect(page.locator("kbd.down")).toHaveCount(0);
  await page.keyboard.up("w");
  // And focusing comparison UI does the same.
  await page.getByRole("button", { name: "Try keyboard controls" }).click();
  await page.keyboard.down("d");
  await expect(page.locator("kbd.down")).toHaveText("D");
  await page.getByRole("button", { name: "Return to reference" }).focus();
  await expect(page.locator("kbd.down")).toHaveCount(0);
  await page.keyboard.up("d");
});

test("reseed to an unlocated alternate shows the choose-a-point flow", async ({ page }) => {
  await page.goto("/?model=lingbot-world-2");
  await page.getByRole("button", { name: /Try a local UI preview/ }).click();
  await expect(page.locator(".present-pane")).toContainText("Captured Jan 2024");

  await page.getByRole("button", { name: /Try another photograph/ }).click();
  const now = page.locator(".present-pane");
  await expect(now).toContainText("Photo location unknown — choose a reference point");
  // The widget is hidden, but the hidden driver map host remains attached.
  await expect(page.locator(".loc-widget")).toHaveCount(0);
  await expect(page.locator(".loc-map")).toBeAttached();
  await expect(page.getByRole("button", { name: "Explore city center instead" })).toBeVisible();

  // A manual map pick through the driver contract becomes an unverified
  // manual target — never a fabricated camera location.
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const driver = (
      window as unknown as {
        __cttPresentDriver?: {
          setMapExpanded: (expanded: boolean) => void;
          simulateManualClick: (p: { lat: number; lng: number }) => void;
        };
      }
    ).__cttPresentDriver;
    driver?.setMapExpanded(true);
    driver?.simulateManualClick({ lat: 52.373, lng: 4.892 });
  });
  await expect(now).toContainText("User-selected reference · not verified against the photo");
  await expect(now).toContainText("Captured Jan 2024");

  // Returning to the located seed via another reseed restores the anchor.
  await page.getByRole("button", { name: /Try another photograph/ }).click();
  await expect(now).toContainText("Verified photo reference");
});

test("backend mock journey: camera anchor then unlocated seed via stripped payload", async ({
  page,
}) => {
  const googleRequests = trackGoogleRequests(page);
  // Strip location from the selected seed at the wire boundary — exercises the
  // "no seed.location → needs-location" path end-to-end while alternates keep
  // their own anchors. meta.cityLocation stays so the city-center action shows.
  await page.route("**/api/world", async (route) => {
    const response = await route.fetch();
    const lines = (await response.text()).trim().split("\n");
    try {
      const last = JSON.parse(lines[lines.length - 1]);
      if (last.seed) delete last.seed.location;
      lines[lines.length - 1] = JSON.stringify(last);
    } catch {
      // progress/error lines pass through untouched
    }
    await route.fulfill({ response, body: lines.join("\n") });
  });
  await page.goto("/?model=happy-oyster-adventure");
  await page.getByRole("button", { name: "Explore this era" }).click();
  await expect(page.getByText("Backend mock · no live world")).toBeVisible();
  const now = page.locator(".present-pane");
  await expect(now).toBeVisible();
  await expect(now).toContainText("Present-day reference · simulated imagery");
  await expect(now).toContainText("Photo location unknown — choose a reference point");
  // City context exists, so the deliberate city-center action is offered —
  // it must not auto-open as a same-location claim.
  const cityAction = page.getByRole("button", { name: "Explore city center instead" });
  await expect(cityAction).toBeVisible();
  await expect(page.locator(".loc-widget")).toHaveCount(0);
  await expect(page.locator(".loc-map")).toBeAttached();

  // The deliberate city fallback resolves as an explicitly unverified city
  // reference; it must not remain stuck in needs-location in fake mode.
  await cityAction.click();
  await expect(now).toContainText("City-center reference · not verified against the photo");
  await expect(now).toContainText("Captured Jan 2024");
  await expect(page.locator(".loc-widget")).toHaveCount(0);

  // A driver-level map pick still becomes an unverified manual target.
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const driver = (
      window as unknown as {
        __cttPresentDriver?: {
          setMapExpanded: (expanded: boolean) => void;
          simulateManualClick: (p: { lat: number; lng: number }) => void;
        };
      }
    ).__cttPresentDriver;
    driver?.setMapExpanded(true);
    driver?.simulateManualClick({ lat: 52.371, lng: 4.9 });
  });
  await expect(now).toContainText("User-selected reference · not verified against the photo");

  // Re-seed swaps to the alternate's own anchor — a subject, labelled weaker
  // than a camera location and never inheriting the previous seed's pin.
  await page.getByRole("button", { name: /Try another photograph/ }).click();
  await expect(now).toContainText("Near the photographed subject · camera location unknown");

  // Collapse keeps the world running; re-open keeps the same state.
  await page.getByRole("button", { name: "Hide present-day comparison" }).click();
  await expect(now).toBeHidden();
  await page.getByRole("button", { name: /Then & Now/ }).click();
  await expect(now).toBeVisible();
  await expect(now).toContainText("Near the photographed subject");
  expect(googleRequests).toEqual([]);
});

test("narrow viewport switches to Then / Present-day tabs", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?model=lingbot-world-2");
  await page.getByRole("button", { name: /Try a local UI preview/ }).click();
  const tabs = page.locator(".comparison-tabs");
  await expect(page.getByRole("tab", { name: /Then/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Present-day" })).toBeVisible();
  await expect(page.locator(".present-pane")).toBeHidden();
  await expect(page.locator(".world-shell")).toBeVisible();
  await tabs.getByRole("tab", { name: "Present-day" }).click();
  await expect(page.locator(".present-pane")).toBeVisible();
  await expect(page.locator(".world-shell")).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
