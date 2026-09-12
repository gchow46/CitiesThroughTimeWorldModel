import { MODEL_IDS, MIN_DECADE, MAX_DECADE, type ModelId } from "./types";
export { MODEL_IDS };
export type { ModelId, ModelCapabilities, WorldRequest } from "./types";
export const DECADES = Array.from(
  { length: (MAX_DECADE - MIN_DECADE) / 10 + 1 },
  (_, index) => MIN_DECADE + index * 10,
);
export type Seed = {
  url: string;
  thumbUrl?: string;
  title: string;
  author: string;
  license: string;
  licenseUrl?: string;
  licenseConfidence?: "high" | "low";
  sourceUrl: string;
  year?: number;
  restored?: boolean;
};
export type ModelState = { encryptedWorldId: string };
export type WorldPayload = {
  model: { id: ModelId; reactorModelName: string };
  sessionToken: string;
  seed: Seed;
  alternates?: Seed[];
  modelState?: ModelState;
  enabledModels?: ModelId[];
  prompt: string;
  meta: { canonicalCity: string };
};
export type WorldPhase =
  | "idle"
  | "requesting"
  | "sourcing"
  | "connecting"
  | "seeding"
  | "ready"
  | "walking"
  | "reseeding"
  | "refreshing"
  | "error"
  | "ended";
export type WorldProgress = { stage: string; detail: string };
export type WorldFailure = { code: string; message: string; closestDecade?: number };

export function isModelId(value: unknown): value is ModelId {
  return typeof value === "string" && MODEL_IDS.some((id) => id === value);
}

export function safeUrl(value: string, base?: string): string | undefined {
  try {
    const url = new URL(value, base);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}
