import { defineConfig } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT ?? 3100);
const baseURL = `http://127.0.0.1:${port}`;
const mockEnv =
  "CTT_E2E_MOCK=1 MOCK_WORLD=1 MOCK_TOKEN=1 NEXT_PUBLIC_ENABLE_THEN_NOW=true NEXT_PUBLIC_COMPARISON_DRIVER=fake";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL,
    viewport: { width: 1440, height: 1000 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command:
      process.env.LIVE_E2E === "1"
        ? `node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port ${port}`
        : `bash -c "${mockEnv} exec node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port ${port}"`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    // LIVE_E2E=1 runs the live-session spec against the real backend
    // (REACTOR_API_KEY from .env.local); everything else uses mocks.
    // Mock runs also enable the Then & Now comparison with the deterministic
    // fake driver — no Google credentials or network are involved.
    timeout: 120_000,
  },
});
