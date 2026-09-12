import type { ModelCapabilities } from "@/lib/types";
import type { AdapterEvent, SeedInput, SeedRef, WorldModelAdapter } from "./adapter";
import type { LookDir, MoveDir } from "./controls";

export const HAPPY_OYSTER_CAPS: ModelCapabilities = {
  id: "happy-oyster-adventure",
  reactorModelName: "reactor/happy-oyster-adventure",
  seedInput: "public-url",
  seedAspect: { min: 1.5, max: 2.0 },
  supportsHotPrompt: false,
  supportsReattach: true,
  driftReset: "reattach",
  perspective: "first_person",
};

const notImplemented = (): never => {
  throw new Error("happy-oyster adapter not implemented yet (A2)");
};

/**
 * Stub — real implementation (A2) uses @reactor-models/happy-oyster:
 * connect(jwt) → createWorld({prompt, first_frame_image_url,
 * perspective:"first_person"}) or attachWorld(encrypted_world_id) →
 * startTravel(); move("Front"|…)/look("Mouse_Left"|…)/stop().
 */
export function createHappyOysterAdapter(): WorldModelAdapter {
  const listeners = new Map<AdapterEvent, Set<(e: unknown) => void>>();
  return {
    caps: HAPPY_OYSTER_CAPS,
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
