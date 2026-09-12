import { NextRequest } from "next/server";
import { isMockWorld } from "@/lib/env";
import { apiError } from "@/lib/errors";
import {
  resolveInputFromRequest,
  resolveModel,
  UnsupportedModelError,
} from "@/lib/reactor/registry";
import { mockWorldPayload, MOCK_STAGES } from "@/lib/mock/world";
import { MAX_DECADE, MIN_DECADE, type WorldRequest } from "@/lib/types";

export const runtime = "nodejs";

/**
 * POST /api/world — NDJSON progress stream; final line is the WorldPayload.
 * I1: mock only (MOCK_WORLD=1). Real orchestration lands in B7.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Partial<WorldRequest> | null;

  if (!body || typeof body.city !== "string" || body.city.trim().length === 0) {
    return apiError(400, "invalid_city", "Body must include a non-empty 'city' string.");
  }
  if (
    typeof body.decade !== "number" ||
    body.decade < MIN_DECADE ||
    body.decade > MAX_DECADE ||
    body.decade % 10 !== 0
  ) {
    return apiError(
      400,
      "unsupported_decade",
      `'decade' must be a multiple of 10 in [${MIN_DECADE}, ${MAX_DECADE}].`,
    );
  }

  let model;
  try {
    model = resolveModel({ ...resolveInputFromRequest(req), modelParam: body.model ?? null });
  } catch (e) {
    if (e instanceof UnsupportedModelError) {
      return apiError(400, "unsupported_model", e.message);
    }
    throw e;
  }

  if (!isMockWorld()) {
    return apiError(
      501,
      "not_implemented",
      "Real seed pipeline lands in B7. Set MOCK_WORLD=1 for canned payloads.",
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const s of MOCK_STAGES) {
        controller.enqueue(encoder.encode(JSON.stringify(s) + "\n"));
      }
      controller.enqueue(encoder.encode(JSON.stringify(mockWorldPayload(model)) + "\n"));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8" },
  });
}
