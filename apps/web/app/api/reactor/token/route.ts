import { NextRequest, NextResponse } from "next/server";
import { isMockWorld } from "@/lib/env";
import { apiError } from "@/lib/errors";
import {
  MODELS,
  resolveInputFromRequest,
  resolveModel,
  UnsupportedModelError,
} from "@/lib/reactor/registry";

export const runtime = "nodejs";

const REACTOR_TOKENS_URL = "https://api.reactor.inc/tokens";
const MAX_SESSIONS = 2;
/** JWTs are valid ≤ 6h; we mint 1h by default. */
const TOKEN_TTL_SECONDS = 3600;

interface TokenRequestBody {
  model?: string;
}

/**
 * POST /api/reactor/token {model?} → { token, model, expiresAt }
 * Exchanges the server-side REACTOR_API_KEY for a short-lived JWT scoped to a
 * single model via authorization_details[].resources.models.match.
 * The API key must never appear in any response.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as TokenRequestBody | null;

  let modelId;
  try {
    modelId = resolveModel({ ...resolveInputFromRequest(req), modelParam: body?.model ?? null });
  } catch (e) {
    if (e instanceof UnsupportedModelError) {
      return apiError(400, "unsupported_model", e.message);
    }
    throw e;
  }

  const caps = MODELS[modelId]().caps;

  if (isMockWorld()) {
    return NextResponse.json({
      token: `mock-jwt.${modelId}.dev`,
      model: modelId,
      expiresAt: new Date(Date.now() + TOKEN_TTL_SECONDS * 1000).toISOString(),
    });
  }

  const apiKey = process.env.REACTOR_API_KEY;
  if (!apiKey) {
    return apiError(
      502,
      "upstream_failed",
      "REACTOR_API_KEY is not configured (or set MOCK_WORLD=1 for a dev token).",
    );
  }

  const res = await fetch(REACTOR_TOKENS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      authorization_details: [{ resources: { models: { match: [caps.reactorModelName] } } }],
      constraints: { max_sessions: MAX_SESSIONS },
      expires_in: TOKEN_TTL_SECONDS,
    }),
  });

  if (!res.ok) {
    return apiError(502, "upstream_failed", `Reactor token mint failed (${res.status}).`);
  }

  const data = (await res.json()) as Record<string, unknown>;
  const token = data.token ?? data.jwt ?? data.access_token;
  if (typeof token !== "string") {
    return apiError(502, "upstream_failed", "Reactor token response missing token field.");
  }

  return NextResponse.json({
    token,
    model: modelId,
    expiresAt: data.expires_at ?? data.expiresAt ?? null,
  });
}
