import { MODEL_IDS, type ModelId } from "./types";

export function isMockWorld(): boolean {
  return process.env.MOCK_WORLD === "1";
}

export function defaultModel(): ModelId {
  const env = process.env.WORLD_MODEL;
  return (MODEL_IDS as readonly string[]).includes(env ?? "") ? (env as ModelId) : MODEL_IDS[0];
}

/** Enabled ids from ENABLED_MODELS (comma list). Unset = all registered. */
export function enabledModels(): readonly ModelId[] {
  const raw = process.env.ENABLED_MODELS?.trim();
  if (!raw) return MODEL_IDS;
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is ModelId => (MODEL_IDS as readonly string[]).includes(s));
}
