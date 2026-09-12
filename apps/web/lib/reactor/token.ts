import type { ModelId } from "@/lib/types";
import { isMockWorld } from "@/lib/env";
import { MODELS } from "./registry";

const REACTOR_TOKENS_URL = "https://api.reactor.inc/tokens";
const MAX_SESSIONS = 2;
/** JWTs are valid ≤ 6h; we mint 1h. */
const TOKEN_TTL_SECONDS = 3600;

export interface MintedToken {
  token: string;
  model: ModelId;
  expiresAt: string | null;
}

export class UpstreamError extends Error {
  readonly code = "upstream_failed" as const;
}

/**
 * Exchanges the server-side REACTOR_API_KEY for a short-lived JWT scoped to a
 * single model. The API key must never appear in any response.
 */
export async function mintToken(modelId: ModelId): Promise<MintedToken> {
  if (isMockWorld()) {
    return {
      token: `mock-jwt.${modelId}.dev`,
      model: modelId,
      expiresAt: new Date(Date.now() + TOKEN_TTL_SECONDS * 1000).toISOString(),
    };
  }

  const apiKey = process.env.REACTOR_API_KEY;
  if (!apiKey) {
    throw new UpstreamError(
      "REACTOR_API_KEY is not configured (or set MOCK_WORLD=1 for a dev token).",
    );
  }

  const caps = MODELS[modelId]().caps;
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
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) throw new UpstreamError(`Reactor token mint failed (${res.status}).`);

  const data = (await res.json()) as Record<string, unknown>;
  const token = data.token ?? data.jwt ?? data.access_token;
  if (typeof token !== "string") {
    throw new UpstreamError("Reactor token response missing token field.");
  }
  const expiresAt = data.expires_at ?? data.expiresAt;
  return { token, model: modelId, expiresAt: typeof expiresAt === "string" ? expiresAt : null };
}
