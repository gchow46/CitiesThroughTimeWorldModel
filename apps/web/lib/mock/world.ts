import type { CityLocation, ModelId, Seed, WorldPayload } from "@/lib/types";
import { MODELS } from "@/lib/reactor/registry";

const SEED: Seed = {
  url: "/mock/amsterdam-1960.svg",
  thumbUrl: "/mock/amsterdam-1960-thumb.svg",
  source: "wikimedia",
  year: 1967,
  title: "Damrak, Amsterdam (1967)",
  author: "Mock Archives",
  license: "CC BY-SA 3.0",
  // Matches a real curated anchor so the mock demonstrates the verified path.
  sourceUrl:
    "https://commons.wikimedia.org/wiki/File:07-31-1965_20115_Heineken_paarden_(6331548748).jpg",
  licenseConfidence: "high",
  restored: false,
  location: {
    point: { lat: 52.372592, lng: 4.90046 },
    role: "camera",
    provenance: "curated",
    evidenceUrl:
      "https://commons.wikimedia.org/wiki/File:07-31-1965_20115_Heineken_paarden_(6331548748).jpg",
    label: "Heineken drays, Amsterdam city centre (mock seed)",
    reviewedAt: "2026-09-12",
  },
};

const ALTERNATES: Seed[] = [
  {
    ...SEED,
    url: "/mock/amsterdam-1960-alt1.svg",
    title: "Anne Frank House, Prinsengracht, Amsterdam (1960)",
    year: 1960,
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:05-02-1960_17230_1_Anne_Frank_Huis_(4158265672).jpg",
    location: {
      point: { lat: 52.375353, lng: 4.884409 },
      role: "subject",
      provenance: "curated",
      evidenceUrl:
        "https://commons.wikimedia.org/wiki/File:05-02-1960_17230_1_Anne_Frank_Huis_(4158265672).jpg",
      label: "Anne Frank House, Prinsengracht 263 (mock alternate)",
      reviewedAt: "2026-09-12",
    },
  },
  {
    ...SEED,
    url: "/mock/amsterdam-1960-alt2.svg",
    title: "Herengracht, Amsterdam (1963)",
    year: 1963,
    sourceUrl: "https://commons.wikimedia.org/wiki/Amsterdam",
    location: {
      point: { lat: 52.368, lng: 4.8886 },
      role: "unknown",
      provenance: "archive",
      evidenceUrl: "https://commons.wikimedia.org/wiki/Amsterdam",
      label: "approximate photo area (mock alternate)",
    },
  },
  {
    // Deliberately unlocated — demonstrates the unknown-location path.
    ...SEED,
    url: "/mock/amsterdam-1960-alt3.svg",
    title: "Nieuwmarkt, Amsterdam (1961)",
    year: 1961,
    sourceUrl: "https://commons.wikimedia.org/wiki/Amsterdam",
  },
];

const CITY_LOCATION: CityLocation = {
  center: { lat: 52.3676, lng: 4.9041 },
  bounds: { south: 52.2782, west: 4.7289, north: 52.4311, east: 5.0792 },
  source: "nominatim",
};

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
    meta: {
      canonicalCity: "Amsterdam, Netherlands",
      cacheHit: true,
      sourcingMs: 12,
      cityLocation: CITY_LOCATION,
    },
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
