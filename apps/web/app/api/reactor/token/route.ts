import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/errors";
import {
  resolveInputFromRequest,
  resolveModel,
  UnsupportedModelError,
} from "@/lib/reactor/registry";
import { mintToken, UpstreamError } from "@/lib/reactor/token";

export const runtime = "nodejs";

/**
 * POST /api/reactor/token {model?} → { token, model, expiresAt }
 * Mints a short-lived Reactor JWT scoped to a single model.
 * The API key must never appear in any response.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { model?: string } | null;

  try {
    const modelId = resolveModel({
      ...resolveInputFromRequest(req),
      modelParam: body?.model ?? null,
    });
    return NextResponse.json(await mintToken(modelId));
  } catch (e) {
    if (e instanceof UnsupportedModelError) {
      return apiError(400, "unsupported_model", e.message);
    }
    if (e instanceof UpstreamError) {
      return apiError(502, "upstream_failed", e.message);
    }
    throw e;
  }
}
