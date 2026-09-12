// Shared API contract for Cities Through Time MVP1.
// See docs/api-contract.md. Both workstreams build against these types.

// ---------- models ----------

export const MODEL_IDS = ["lingbot-world-2", "happy-oyster-adventure"] as const;
export type ModelId = (typeof MODEL_IDS)[number];

export interface ModelCapabilities {
  id: ModelId;
  /** Token scope, e.g. "reactor/lingbot-world-2". */
  reactorModelName: string;
  /** How the seed image reaches the model. */
  seedInput: "upload" | "public-url";
  /** Accepted width/height ratio range, if constrained (Happy Oyster: 1.5–2.0). */
  seedAspect?: { min: number; max: number };
  /** set_prompt mid-stream. */
  supportsHotPrompt: boolean;
  /** encrypted_world_id re-attach. */
  supportsReattach: boolean;
  driftReset: "kv-cache" | "reattach" | "reseed";
  perspective?: "first_person" | "third_person";
}

// ---------- seeds ----------

export type SeedSourceId = "wikimedia" | "europeana" | "flickr" | "google-cse";

export interface SeedCandidate {
  /** Pre-normalization source URL (original archive image). */
  url: string;
  source: SeedSourceId;
  year?: number;
  title?: string;
  author?: string;
  license?: string;
  sourceUrl?: string;
  width?: number;
  height?: number;
  licenseConfidence: "high" | "low";
}

/** A normalized, model-agnostic seed artifact served from blob storage. */
export interface Seed {
  url: string;
  thumbUrl: string;
  source: SeedSourceId;
  year?: number;
  title?: string;
  author?: string;
  license?: string;
  sourceUrl?: string;
  licenseConfidence: "high" | "low";
  restored: boolean;
}

// ---------- /api/world ----------

export const MIN_DECADE = 1900;
export const MAX_DECADE = 2020;

export interface WorldRequest {
  city: string;
  decade: number;
  model?: ModelId;
}

export interface WorldPayload {
  model: {
    id: ModelId;
    reactorModelName: string;
    caps: Omit<ModelCapabilities, "id" | "reactorModelName">;
  };
  sessionToken: string;
  seed: Seed;
  /** Up to 3 additional seeds for re-seed rotation. */
  alternates: Seed[];
  prompt: string;
  /** Per-model persisted state (e.g. encryptedWorldId). null on miss. */
  modelState: Record<string, unknown> | null;
  meta: {
    canonicalCity: string;
    cacheHit: boolean;
    sourcingMs: number;
  };
}

/** NDJSON progress lines emitted before the final WorldPayload line. */
export interface ProgressEvent {
  stage: "validating" | "geocoding" | "sourcing" | "ranking" | "preparing" | "opening";
  detail?: string;
}

// ---------- errors ----------

export type ErrorCode =
  | "invalid_city"
  | "unsupported_decade"
  | "unsupported_model"
  | "insufficient_archival_photos"
  | "rate_limited"
  | "upstream_failed"
  | "not_implemented";

export interface ApiError {
  error: ErrorCode;
  message: string;
  closestDecade?: number;
}
