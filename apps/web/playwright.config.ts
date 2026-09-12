import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3000",
    viewport: { width: 1440, height: 1000 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node node_modules/next/dist/bin/next dev --hostname 127.0.0.1",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    // LIVE_E2E=1 runs the live-session spec against the real backend
    // (REACTOR_API_KEY from .env.local); everything else uses mocks.
    env:
      process.env.LIVE_E2E === "1"
        ? { MOCK_WORLD: "0", MOCK_TOKEN: "0", NEXT_PUBLIC_REACTOR_LOG_LEVEL: "debug" }
        : { MOCK_WORLD: "1", MOCK_TOKEN: "1" },
    timeout: 120_000,
  },
});
