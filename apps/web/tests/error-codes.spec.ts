import { expect, test } from "@playwright/test";

// I4: every backend error code renders a distinct, actionable UI.
// Responses are stubbed — this spec is about the error surface, not the API.

const CASES: {
  code: string;
  status: number;
  body: object;
  expectText: RegExp;
  expectHint?: RegExp;
}[] = [
  {
    code: "invalid_city",
    status: 400,
    body: { error: "invalid_city", message: "No place found." },
    expectText: /couldn't identify that city/i,
  },
  {
    code: "unsupported_decade",
    status: 400,
    body: { error: "unsupported_decade", message: "out of range" },
    expectText: /decade isn't available/i,
  },
  {
    code: "unsupported_model",
    status: 400,
    body: { error: "unsupported_model", message: "disabled" },
    expectText: /world engine isn't enabled/i,
  },
  {
    code: "insufficient_archival_photos",
    status: 404,
    body: { error: "insufficient_archival_photos", message: "too few", closestDecade: 1970 },
    expectText: /couldn't find a suitable historical photograph/i,
    expectHint: /Try the 1970s instead/i,
  },
  {
    code: "rate_limited",
    status: 429,
    body: { error: "rate_limited", message: "slow down" },
    expectText: /Too many journeys/i,
  },
  {
    code: "upstream_failed",
    status: 502,
    body: { error: "upstream_failed", message: "archive down" },
    expectText: /world service couldn't complete/i,
  },
];

for (const c of CASES) {
  test(`error UI: ${c.code}`, async ({ page }) => {
    // HTTP-status error (pre-stream) — the common case for these codes.
    await page.route("**/api/world", (route) =>
      route.fulfill({
        status: c.status,
        contentType: "application/json",
        body: JSON.stringify(c.body),
      }),
    );
    await page.goto("/");
    await page.getByRole("button", { name: "Explore this era" }).click();
    await expect(page.locator(".error-card")).toContainText(c.expectText);
    if (c.expectHint) await expect(page.locator(".error-card")).toContainText(c.expectHint);
    // Arbitrary server messages must never be reflected verbatim.
    await expect(page.locator(".error-card")).not.toContainText(
      String((c.body as { message?: string }).message ?? "zz-no-message"),
    );
  });
}

test("error UI: streamed mid-pipeline failure also surfaces", async ({ page }) => {
  // Post-commit streamed error: NDJSON progress lines then an error line.
  await page.route("**/api/world", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/x-ndjson",
      body:
        JSON.stringify({ stage: "sourcing", detail: "querying archives" }) +
        "\n" +
        JSON.stringify({
          status: 404,
          error: "insufficient_archival_photos",
          message: "too few",
          closestDecade: 1930,
        }) +
        "\n",
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Explore this era" }).click();
  await expect(page.locator(".error-card")).toContainText(
    /couldn't find a suitable historical photograph/i,
  );
  await expect(page.locator(".error-card")).toContainText(/Try the 1930s instead/i);
});
