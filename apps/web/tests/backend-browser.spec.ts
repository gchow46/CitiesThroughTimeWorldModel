import { expect, test } from "@playwright/test";

for (const model of ["lingbot-world-2", "happy-oyster-adventure"]) {
  test(`actual backend mock to /world: ${model}`, async ({ page }) => {
    const reactorRequests: string[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).hostname.endsWith("reactor.inc"))
        reactorRequests.push(request.url());
    });
    await page.goto(`/?model=${model}`);
    const response = page.waitForResponse((response) => response.url().endsWith("/api/world"));
    await page.getByRole("button", { name: "Explore this era" }).click();
    expect((await response).headers()["content-type"]).toContain("application/x-ndjson");
    await expect(page).toHaveURL(new RegExp(`/world\\?model=${model}`));
    await expect(page.getByText("Backend mock · no live world")).toBeVisible();
    await expect(page.getByText("Damrak, Amsterdam (1967)")).toBeVisible();
    await page.getByRole("button", { name: "Try keyboard controls" }).click();
    await page.keyboard.down("w");
    await expect(page.locator("kbd.down")).toHaveText("W");
    await page.keyboard.up("w");
    await page.keyboard.press("Escape");
    await expect(page.locator("kbd.down")).toHaveCount(0);
    expect(reactorRequests).toEqual([]);
    await page.getByRole("button", { name: /New search/ }).click();
    await expect(page.getByRole("button", { name: "Explore this era" })).toBeVisible();
  });
}

test("dev switcher re-requests the backend and uses its model cookie", async ({
  page,
  context,
}) => {
  await page.goto("/?dev=1&model=lingbot-world-2");
  await page.getByRole("button", { name: "Explore this era" }).click();
  await expect(page.getByText("Backend mock · no live world")).toBeVisible();
  const request = page.waitForRequest((request) => request.url().endsWith("/api/world"));
  await page.getByRole("combobox", { name: "World engine" }).selectOption("happy-oyster-adventure");
  expect((await request).postDataJSON().model).toBe("happy-oyster-adventure");
  await expect(page.getByRole("combobox", { name: "World engine" })).toHaveValue(
    "happy-oyster-adventure",
  );
  expect((await context.cookies()).find((cookie) => cookie.name === "ctt_model")?.value).toBe(
    "happy-oyster-adventure",
  );
  await expect(page.getByText("Backend mock · no live world")).toBeVisible();
});
