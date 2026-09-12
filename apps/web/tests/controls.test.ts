import assert from "node:assert/strict";
import { test } from "vitest";
import { controlsFromKeys, ControlQueue, IDLE } from "../lib/reactor/client/controls";

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

test("WASD supports diagonals and opposing keys cancel", () => {
  assert.deepEqual(controlsFromKeys(new Set(["KeyW", "KeyD", "ArrowUp"])), {
    forward: 1,
    right: 1,
    lookX: 0,
    lookY: 1,
  });
  assert.deepEqual(controlsFromKeys(new Set(["KeyW", "KeyS", "KeyA", "KeyD"])), IDLE);
});

test("held input is sent once and releasing sends idle", async () => {
  const calls: unknown[] = [];
  const queue = new ControlQueue(
    async (state) => {
      calls.push(state);
    },
    () => assert.fail("unexpected error"),
  );
  queue.set({ ...IDLE, forward: 1 });
  queue.set({ ...IDLE, forward: 1 });
  await tick();
  queue.set(IDLE);
  await tick();
  assert.deepEqual(calls, [{ ...IDLE, forward: 1 }, IDLE]);
});

test("slow commands are serialized and stale pending input is coalesced", async () => {
  let release!: () => void;
  const calls: unknown[] = [];
  const queue = new ControlQueue(
    async (state) => {
      calls.push(state);
      if (calls.length === 1)
        await new Promise<void>((resolve) => {
          release = resolve;
        });
    },
    () => assert.fail("unexpected error"),
  );
  queue.set({ ...IDLE, forward: 1 });
  queue.set({ ...IDLE, right: 1 });
  queue.set(IDLE);
  release();
  await tick();
  assert.deepEqual(calls, [{ ...IDLE, forward: 1 }, IDLE]);
});

test("closed queue never sends pending movement", async () => {
  let release!: () => void;
  const calls: unknown[] = [];
  const queue = new ControlQueue(
    async (state) => {
      calls.push(state);
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    },
    () => assert.fail("unexpected error"),
  );
  queue.set({ ...IDLE, forward: 1 });
  queue.close();
  queue.set({ ...IDLE, right: 1 });
  release();
  await tick();
  assert.equal(calls.length, 1);
});
