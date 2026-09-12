import { MODEL_IDS, type ModelId } from "@/lib/types";
import { defaultModel, enabledModels } from "@/lib/env";
import type { WorldModelAdapter } from "./adapter";
import { createLingBotAdapter } from "./lingbot";
import { createHappyOysterAdapter } from "./happyOyster";

/** Cookie the dev panel / model switcher uses to make a choice stick. */
export const MODEL_COOKIE = "ctt_model";

/**
 * Adding a model = one adapter file + one entry here + a token scope string.
 * No UI or API changes.
 */
export const MODELS: Record<ModelId, () => WorldModelAdapter> = {
  "lingbot-world-2": createLingBotAdapter,
  "happy-oyster-adventure": createHappyOysterAdapter,
};

export class UnsupportedModelError extends Error {
  readonly code = "unsupported_model" as const;
  constructor(model: string) {
    super(`Unsupported or disabled model: ${model}`);
  }
}

export function isModelId(s: string): s is ModelId {
  return (MODEL_IDS as readonly string[]).includes(s);
}

export interface ResolveInput {
  /** `?model=` query param — highest precedence. */
  modelParam?: string | null;
  /** `ctt_model` cookie — set by the dev-panel switcher. */
  modelCookie?: string | null;
}

/**
 * Precedence: ?model= → cookie → WORLD_MODEL env → first registered.
 * Unknown or disabled ids → UnsupportedModelError (400 unsupported_model).
 */
export function resolveModel({ modelParam, modelCookie }: ResolveInput): ModelId {
  const enabled = enabledModels();
  const requested = modelParam ?? modelCookie;

  if (requested != null) {
    if (!isModelId(requested) || !enabled.includes(requested)) {
      throw new UnsupportedModelError(requested);
    }
    return requested;
  }

  const fallback = enabled.includes(defaultModel()) ? defaultModel() : enabled[0];
  if (!fallback) throw new UnsupportedModelError("(none enabled)");
  return fallback;
}

/** Extract ResolveInput from a Next.js request (App Router route handler). */
export function resolveInputFromRequest(req: {
  nextUrl?: { searchParams: URLSearchParams };
  url: string;
  cookies: { get(name: string): { value: string } | undefined };
}): ResolveInput {
  const search = req.nextUrl?.searchParams ?? new URL(req.url).searchParams;
  return {
    modelParam: search.get("model"),
    modelCookie: req.cookies.get(MODEL_COOKIE)?.value ?? null,
  };
}
