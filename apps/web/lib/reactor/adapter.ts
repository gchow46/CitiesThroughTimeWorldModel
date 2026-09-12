import type { ModelCapabilities } from "@/lib/types";
import type { LookDir, MoveDir } from "./controls";

export interface SeedRef {
  url: string;
  prompt?: string;
}

export interface SeedInput {
  /** Public blob URL — always present (model-agnostic artifact). */
  imageUrl: string;
  /** Pre-fetched image for upload-style models (LingBot). */
  imageBlob?: Blob;
  prompt: string;
  /** Attach to an existing world instead of seeding fresh (Happy Oyster). */
  reattachId?: string;
}

export type AdapterEvent = "status" | "chunk" | "error";

/**
 * One implementation per Reactor model. UI talks only to this interface and
 * renders behaviour from `caps`, so adding a model = one file + registry entry.
 * Contract tests for this interface run against a fake adapter (see A2).
 */
export interface WorldModelAdapter {
  readonly caps: ModelCapabilities;
  connect(jwt: string): Promise<void>;
  seed(input: SeedInput): Promise<{ reattachId?: string }>;
  start(): Promise<void>;
  /** Held state; null = idle/stop. */
  setMove(dir: MoveDir | null): void;
  setLook(axis: "h" | "v", dir: LookDir | null): void;
  /** Implementation picks kv-reset / reattach / reset+setImage per caps.driftReset. */
  reseed(next: SeedRef): Promise<void>;
  dispose(): Promise<void>;
  on(evt: AdapterEvent, cb: (e: unknown) => void): () => void;
}
