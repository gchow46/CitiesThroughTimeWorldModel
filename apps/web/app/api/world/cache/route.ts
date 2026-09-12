import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/errors";
import { writeModelState } from "@/lib/orchestrate";
import { InvalidCityError } from "@/lib/geocode";
import { isModelId } from "@/lib/reactor/registry";
import { enabledModels } from "@/lib/env";

export const runtime = "nodejs";

interface CachePatchBody {
  city?: string;
  decade?: number;
  model?: string;
  state?: Record<string, unknown>;
}

/**
 * PATCH /api/world/cache {city, decade, model, state}
 * Stores per-model state (e.g. encryptedWorldId) under
 * world:{citySlug}:{decade}:{modelId}. `city` is geocoded (cache hit) so the
 * canonical slug matches the one the orchestrator used.
 */
export async function PATCH(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as CachePatchBody | null;
  if (!body || typeof body.city !== "string" || !body.city.trim()) {
    return apiError(400, "invalid_city", "Body must include 'city'.");
  }
  if (typeof body.decade !== "number") {
    return apiError(400, "unsupported_decade", "Body must include numeric 'decade'.");
  }
  if (!body.model || !isModelId(body.model) || !enabledModels().includes(body.model)) {
    return apiError(400, "unsupported_model", `Unknown/disabled model: ${body.model}`);
  }
  if (!body.state || typeof body.state !== "object" || Array.isArray(body.state)) {
    return apiError(400, "bad_request", "Body must include object 'state'.");
  }

  try {
    await writeModelState(body.city, body.decade, body.model, body.state);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof InvalidCityError) {
      return apiError(400, "invalid_city", e.message);
    }
    throw e;
  }
}
