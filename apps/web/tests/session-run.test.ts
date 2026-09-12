import assert from "node:assert/strict";
import { test } from "vitest";
import { SessionRun } from "../lib/session-run";
import type { WorldModelAdapter } from "../lib/reactor/client/adapter";
import { AdapterBus, defineAdapter } from "../lib/reactor/client/adapter";
import { CAPABILITIES } from "../lib/reactor/client/capabilities";

function fake(onDispose: () => void): WorldModelAdapter {
  return defineAdapter({
    caps: CAPABILITIES["lingbot-world-2"],
    on: new AdapterBus().on,
    async connect() {},
    async seed() {},
    async start() {},
    async reseed() {},
    async setPrompt() {},
    async applyControls() {},
    async dispose() {
      onDispose();
    },
  });
}

test("session teardown is idempotent and invalidates late work", async () => {
  let disposals = 0;
  const run = new SessionRun();
  await run.attach(fake(() => disposals++));
  await Promise.all([run.stop(), run.stop()]);
  assert.equal(disposals, 1);
  assert.throws(() => run.check(), { name: "AbortError" });
});

test("adapter arriving after cancellation is disposed instead of connected", async () => {
  let disposals = 0;
  const run = new SessionRun();
  await run.stop();
  await assert.rejects(run.attach(fake(() => disposals++)), {
    name: "AbortError",
  });
  assert.equal(disposals, 1);
});
