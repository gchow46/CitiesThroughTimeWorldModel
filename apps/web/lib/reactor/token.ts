import type { ModelId } from "@/lib/types";
import { isMockToken } from "@/lib/env";
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
  if (isMockToken()) {
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
      "Reactor-API-Key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      expires_after: TOKEN_TTL_SECONDS,
      authorization_details: [
        {
          type: "session",
          resources: { models: { match: [caps.reactorModelName] } },
          constraints: { max_sessions: MAX_SESSIONS },
        },
      ],
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new UpstreamError(`Reactor token mint failed (${res.status}): ${detail}`);
  }

  const data = (await res.json()) as { jwt?: string; expires_at?: number };
  if (typeof data.jwt !== "string") {
    throw new UpstreamError("Reactor token response missing jwt field.");
  }
  return {
    token: data.jwt,
    model: modelId,
    expiresAt: data.expires_at ? new Date(data.expires_at * 1000).toISOString() : null,
  };
}
