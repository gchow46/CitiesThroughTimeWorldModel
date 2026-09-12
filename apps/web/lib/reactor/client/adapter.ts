import type { ModelCapabilities, ModelState, WorldPayload } from "../../frontend-types";
import { IDLE, MOVEMENT, type Controls, type LookDir, type MoveDir } from "./controls";
import type { WorldError } from "../../world-client";

export type AdapterEventMap = {
  status: string;
  chunk: number;
  error: WorldError;
  ended: undefined;
  modelState: ModelState;
};
export interface WorldModelAdapter {
  readonly caps: ModelCapabilities;
  connect(token: string): Promise<void>;
  seed(payload: WorldPayload, signal: AbortSignal): Promise<void>;
  start(): Promise<void>;
  setMove(direction: MoveDir | null): Promise<void>;
  setLook(direction: LookDir): Promise<void>;
  applyControls(controls: Controls): Promise<void>;
  reseed(payload: WorldPayload, signal: AbortSignal): Promise<void>;
  setPrompt(prompt: string): Promise<void>;
  dispose(): Promise<void>;
  on<K extends keyof AdapterEventMap>(
    event: K,
    handler: (value: AdapterEventMap[K]) => void,
  ): () => void;
}
export type AdapterFactory = (video: HTMLVideoElement) => WorldModelAdapter;

export class AdapterBus {
  private listeners = new Map<keyof AdapterEventMap, Set<(value: unknown) => void>>();
  on = <K extends keyof AdapterEventMap>(
    event: K,
    handler: (value: AdapterEventMap[K]) => void,
  ) => {
    const listener = (value: unknown) => handler(value as AdapterEventMap[K]);
    const set = this.listeners.get(event) ?? new Set();
    set.add(listener);
    this.listeners.set(event, set);
    return () => {
      set.delete(listener);
    };
  };
  emit<K extends keyof AdapterEventMap>(event: K, value: AdapterEventMap[K]) {
    this.listeners.get(event)?.forEach((handler) => handler(value));
  }
  clear() {
    this.listeners.clear();
  }
}

export function defineAdapter(
  core: Omit<WorldModelAdapter, "setMove" | "setLook">,
): WorldModelAdapter {
  let controls: Controls = { ...IDLE };
  return {
    ...core,
    async applyControls(next) {
      controls = { ...next };
      await core.applyControls(next);
    },
    async setMove(direction) {
      controls = { ...controls, ...(direction ? MOVEMENT[direction] : { forward: 0, right: 0 }) };
      await core.applyControls(controls);
    },
    async setLook(direction) {
      controls = { ...controls, lookX: direction.x, lookY: direction.y };
      await core.applyControls(controls);
    },
  };
}
