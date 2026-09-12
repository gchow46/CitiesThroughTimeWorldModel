import { expect, test } from "@playwright/test";

// I4 live check — opens a REAL Reactor session end-to-end through the app.
// Runs only when LIVE_E2E=1 (needs REACTOR_API_KEY; costs real sessions).
//   LIVE_E2E=1 pnpm e2e tests/live-session.spec.ts
// For happy-oyster-adventure the seed must be publicly fetchable by Reactor;
// point a tunnel at the dev server and pass its origin:
//   cloudflared tunnel --url http://localhost:3000
//   PUBLIC_SEED_BASE=https://<id>.trycloudflare.com LIVE_E2E=1 pnpm e2e ...
const live = process.env.LIVE_E2E === "1";

test.skip(!live, "set LIVE_E2E=1 to open a real Reactor session");

for (const model of ["lingbot-world-2", "happy-oyster-adventure"]) {
  test(`real session reaches walking: ${model}`, async ({ page }) => {
    test.setTimeout(120_000);
    const log: string[] = [];
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      const text = m.text();
      log.push(`console.${m.type()}: ${text}`);
      if (text.includes("action_error") || m.type() === "error") {
        void Promise.all(m.args().map((a) => a.jsonValue().catch(() => a.toString()))).then(
          (vals) => errors.push(`${m.type()}: ${JSON.stringify(vals)}`),
        );
      }
    });

    // Happy Oyster fetches the seed itself, so it needs a public URL — the
    // dev /api/seed/* store is localhost-only. When PUBLIC_SEED_BASE is set
    // (e.g. a `cloudflared tunnel --url http://localhost:3000` origin), the
    // relative seed URL is rewritten onto it so Reactor can fetch the real
    // normalized JPEG — the same thing BLOB_READ_WRITE_TOKEN provides in prod.
    const publicSeedBase = process.env.PUBLIC_SEED_BASE?.replace(/\/$/, "");
    await page.route("**/api/world", async (route) => {
      const response = await route.fetch();
      const lines = (await response.text()).trim().split("\n");
      try {
        const last = JSON.parse(lines[lines.length - 1]);
        if (publicSeedBase && last.seed?.url?.startsWith("/")) {
          last.seed.url = `${publicSeedBase}${last.seed.url}`;
          lines[lines.length - 1] = JSON.stringify(last);
        }
      } catch {
        // error lines / unexpected payloads pass through untouched
      }
      await route.fulfill({ response, body: lines.join("\n") });
    });

    await page.goto(`/?model=${model}`);
    await page.getByRole("button", { name: "Explore this era" }).click();

    // world page → session seeds → phase becomes walking (video track bound)
    try {
      await expect(page.locator(".app-frame.exploring")).toBeVisible({ timeout: 90_000 });
    } catch (e) {
      const failure = await page
        .locator(".error-card")
        .textContent()
        .catch(() => null);
      console.log("FAILURE CARD:", failure);
      console.log("ERRORS:", errors);
      console.log("LOG:", log.slice(-30));
      throw e;
    }
    const hasTrack = await page
      .locator("video.world-video")
      .evaluate((v: HTMLVideoElement) => Boolean(v.srcObject));
    expect(hasTrack).toBe(true);

    // WASD actually reaches the adapter without page errors
    await page.getByRole("button", { name: /Enter world/ }).click();
    await page.keyboard.down("w");
    await page.waitForTimeout(1500);
    await page.keyboard.up("w");
    await expect(page.locator(".app-frame.exploring")).toBeVisible();

    // clean teardown
    await page.getByRole("button", { name: /New search/ }).click();
    await expect(page.getByRole("button", { name: "Explore this era" })).toBeVisible();
    expect(errors).toEqual([]);
  });
}
