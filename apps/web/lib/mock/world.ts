import type { ModelId, Seed, WorldPayload } from "@/lib/types";
import { MODELS } from "@/lib/reactor/registry";

const SEED: Seed = {
  url: "/mock/amsterdam-1960.svg",
  thumbUrl: "/mock/amsterdam-1960-thumb.svg",
  source: "wikimedia",
  year: 1967,
  title: "Damrak, Amsterdam (1967)",
  author: "Mock Archives",
  license: "CC BY-SA 3.0",
  sourceUrl: "https://commons.wikimedia.org/wiki/Amsterdam",
  licenseConfidence: "high",
  restored: false,
};

const ALTERNATES: Seed[] = [
  {
    ...SEED,
    url: "/mock/amsterdam-1960-alt1.svg",
    title: "Herengracht, Amsterdam (1963)",
    year: 1963,
  },
  {
    ...SEED,
    url: "/mock/amsterdam-1960-alt2.svg",
    title: "Leidseplein, Amsterdam (1968)",
    year: 1968,
  },
  {
    ...SEED,
    url: "/mock/amsterdam-1960-alt3.svg",
    title: "Nieuwmarkt, Amsterdam (1961)",
    year: 1961,
  },
];

export function mockWorldPayload(modelId: ModelId): WorldPayload {
  const caps = MODELS[modelId]().caps;
  const { id, reactorModelName, ...rest } = caps;
  return {
    model: { id, reactorModelName, caps: rest },
    sessionToken: `mock-jwt.${id}.dev`,
    seed: SEED,
    alternates: ALTERNATES,
    prompt:
      "Amsterdam, Netherlands, 1960s: continue this street scene — canal houses, " +
      "period bicycles and trams, era-correct signage and clothing, soft overcast " +
      "light, film grain.",
    modelState: caps.supportsReattach ? { encryptedWorldId: "mock-encrypted-world-id" } : null,
    meta: { canonicalCity: "Amsterdam, Netherlands", cacheHit: true, sourcingMs: 12 },
  };
}

export const MOCK_STAGES = [
  { stage: "validating", detail: "ok" },
  { stage: "geocoding", detail: "Amsterdam, Netherlands" },
  { stage: "sourcing", detail: "3 archives, 14 candidates" },
  { stage: "ranking", detail: "top 4 selected" },
  { stage: "preparing", detail: "16:9 @ 1280x720" },
  { stage: "opening", detail: "minting session token" },
] as const;
