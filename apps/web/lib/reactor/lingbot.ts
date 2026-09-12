import type { ModelCapabilities } from "@/lib/types";
import type { AdapterEvent, SeedInput, SeedRef, WorldModelAdapter } from "./adapter";
import type { LookDir, MoveDir } from "./controls";

export const LINGBOT_CAPS: ModelCapabilities = {
  id: "lingbot-world-2",
  reactorModelName: "reactor/lingbot-world-2",
  seedInput: "upload",
  supportsHotPrompt: true,
  supportsReattach: false,
  driftReset: "kv-cache",
  perspective: "first_person",
};

const notImplemented = (): never => {
  throw new Error("lingbot adapter not implemented yet (A2)");
};

/**
 * Stub — real implementation (A2) uses @reactor-models/lingbot-world-2:
 * connect(jwt) → uploadFile(blob) → setImage → setPrompt → start;
 * held-state setMovement/setLookHorizontal/setLookVertical;
 * drift: triggerKvCacheReset(); re-seed: reset() → setImage → start().
 */
export function createLingBotAdapter(): WorldModelAdapter {
  const listeners = new Map<AdapterEvent, Set<(e: unknown) => void>>();
  return {
    caps: LINGBOT_CAPS,
    connect: notImplemented,
    seed: (_input: SeedInput) => notImplemented(),
    start: notImplemented,
    setMove: (_dir: MoveDir | null) => notImplemented(),
    setLook: (_axis: "h" | "v", _dir: LookDir | null) => notImplemented(),
    reseed: (_next: SeedRef) => notImplemented(),
    dispose: async () => listeners.clear(),
    on(evt, cb) {
      if (!listeners.has(evt)) listeners.set(evt, new Set());
      listeners.get(evt)!.add(cb);
      return () => listeners.get(evt)?.delete(cb);
    },
  };
}
