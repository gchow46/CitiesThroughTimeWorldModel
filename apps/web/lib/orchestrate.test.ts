// Pipeline-shape tests: location evidence propagates through orchestration,
// curated overrides apply on cold AND warm paths, and meta.cityLocation is
// built from GeoResult on every response. All I/O collaborators are mocked.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GeoResult } from "./geocode";
import { CURATED_ANCHORS } from "./locations/curated";
import type { SeedCandidate } from "./types";

const GEO: GeoResult = {
  canonicalName: "Amsterdam, Netherlands",
  countryCode: "NL",
  bbox: { south: 52.2782, west: 4.7289, north: 52.4311, east: 5.0792 },
  lat: 52.3676,
  lon: 4.9041,
  ambiguous: false,
};

const cacheStore = new Map<string, unknown>();

vi.mock("./cache", () => ({
  cacheGet: vi.fn(async (k: string) => cacheStore.get(k) ?? null),
  cacheSet: vi.fn(async (k: string, v: unknown) => {
    cacheStore.set(k, v);
  }),
  withLock: vi.fn(async (_k: string, fn: () => Promise<unknown>) => fn()),
}));

vi.mock("./geocode", () => ({
  geocodeCity: vi.fn(async () => GEO),
}));

vi.mock("./slug", () => ({ citySlug: () => "amsterdam-netherlands" }));

const CURATED_URL = CURATED_ANCHORS[0].sourceUrl;

const CANDIDATES: SeedCandidate[] = [
  // Matches a curated anchor but carries wrong archive coordinates — the
  // curated override must win.
  {
    url: "https://upload.wikimedia.org/curated.jpg",
    source: "wikimedia",
    year: 1965,
    title: "Amsterdam canal",
    width: 2000,
    height: 1200,
    sourceUrl: CURATED_URL,
    licenseConfidence: "high",
    location: {
      point: { lat: 52.0, lng: 4.0 },
      role: "unknown",
      provenance: "archive",
      evidenceUrl: CURATED_URL,
    },
  },
  // Ordinary located candidate (non-Commons record URL so the ranker's
  // file-boilerplate penalty doesn't apply).
  {
    url: "https://upload.wikimedia.org/located.jpg",
    source: "europeana",
    year: 1963,
    title: "Amsterdam canal",
    width: 1600,
    height: 900,
    sourceUrl: "https://www.europeana.eu/item/123/loc",
    licenseConfidence: "high",
    location: {
      point: { lat: 52.37, lng: 4.9 },
      role: "unknown",
      provenance: "archive",
      evidenceUrl: "https://www.europeana.eu/item/123/loc",
    },
  },
  // Unlocated candidates that rank below the located ones ("map" title).
  ...[1, 2, 3].map((i) => ({
    url: `https://upload.wikimedia.org/extra${i}.jpg`,
    source: "wikimedia" as const,
    year: 1964,
    title: `Amsterdam map ${i}`,
    width: 1600,
    height: 900,
    licenseConfidence: "high" as const,
  })),
];

vi.mock("./sources", () => ({
  ARCHIVE_SOURCES: [{ id: "wikimedia" }],
  FALLBACK_SOURCE: { id: "google-cse" },
  gatherCandidates: vi.fn(async () => CANDIDATES),
}));

vi.mock("./walkability", () => ({
  scoreWalkability: vi.fn(async (c: unknown) => c),
}));

vi.mock("./image", () => ({
  normalizeSeed: vi.fn(async (cand: SeedCandidate) => ({
    url: `https://blob.test/${encodeURIComponent(cand.url)}`,
    thumbUrl: "https://blob.test/t.jpg",
    source: cand.source,
    year: cand.year,
    title: cand.title,
    sourceUrl: cand.sourceUrl,
    licenseConfidence: cand.licenseConfidence,
    restored: false,
    location: cand.location,
  })),
}));

vi.mock("./prompts", () => ({ composePrompt: vi.fn(() => "prompt") }));

vi.mock("./reactor/token", () => ({
  mintToken: vi.fn(async () => ({ token: "tok", expiresAt: null })),
}));

vi.mock("./reactor/registry", () => ({
  MODELS: {
    "lingbot-world-2": () => ({
      caps: {
        id: "lingbot-world-2",
        reactorModelName: "reactor/lingbot-world-2",
        seedInput: "public-url",
        supportsHotPrompt: false,
        supportsReattach: true,
        driftReset: "reattach",
      },
    }),
  },
}));

const { runWorldPipeline, worldKey } = await import("./orchestrate");

beforeEach(() => {
  cacheStore.clear();
});

describe("runWorldPipeline location propagation", () => {
  it("applies curated overrides on the cold path and emits meta.cityLocation", async () => {
    const payload = await runWorldPipeline(
      { city: "Amsterdam", decade: 1960, model: "lingbot-world-2" },
      vi.fn(),
    );
    // The curated record overrides the wrong archive location wherever the
    // matching seed lands (seed or alternate).
    const all = [payload.seed, ...payload.alternates];
    const matched = all.find((s) => s.sourceUrl === CURATED_URL);
    expect(matched?.location).toEqual(CURATED_ANCHORS[0].location);
    // Archive location evidence survives normalization for non-curated seeds.
    const located = all.find((s) => s.sourceUrl === "https://www.europeana.eu/item/123/loc");
    expect(located?.location?.point).toEqual({ lat: 52.37, lng: 4.9 });
    // The cached SharedWorld already carries the corrected location.
    const cached = cacheStore.get(worldKey("amsterdam-netherlands", 1960)) as {
      seed: { sourceUrl?: string; location?: { provenance: string } };
      alternates: { sourceUrl?: string; location?: { provenance: string } }[];
    };
    const cachedMatch = [cached.seed, ...cached.alternates].find(
      (s) => s.sourceUrl === CURATED_URL,
    );
    expect(cachedMatch?.location?.provenance).toBe("curated");
    // City context: lat→lat, lon→lng.
    expect(payload.meta.cityLocation).toEqual({
      center: { lat: 52.3676, lng: 4.9041 },
      bounds: GEO.bbox,
      source: "nominatim",
    });
  });

  it("corrects a stale cached seed on the warm path", async () => {
    // Pre-seed the cache with a stale location for the curated record.
    cacheStore.set(worldKey("amsterdam-netherlands", 1960), {
      seed: {
        url: "https://blob.test/old.jpg",
        thumbUrl: "t",
        source: "wikimedia",
        licenseConfidence: "high",
        restored: false,
        sourceUrl: CURATED_URL,
        location: {
          point: { lat: 0, lng: 0 },
          role: "unknown",
          provenance: "archive",
          evidenceUrl: CURATED_URL,
        },
      },
      alternates: [
        {
          url: "https://blob.test/alt.jpg",
          thumbUrl: "t",
          source: "wikimedia",
          licenseConfidence: "high",
          restored: false,
          sourceUrl: "https://commons.wikimedia.org/wiki/File:Other.jpg",
        },
      ],
      prompt: "prompt",
      canonicalCity: "Amsterdam, Netherlands",
    });

    const payload = await runWorldPipeline(
      { city: "Amsterdam", decade: 1960, model: "lingbot-world-2" },
      vi.fn(),
    );
    expect(payload.meta.cacheHit).toBe(true);
    // Warm path: stale cached location is corrected at response assembly.
    expect(payload.seed.location).toEqual(CURATED_ANCHORS[0].location);
    // Unmatched cached seeds are left alone — no invented location.
    expect(payload.alternates[0].location).toBeUndefined();
    expect(payload.meta.cityLocation?.center).toEqual({ lat: 52.3676, lng: 4.9041 });
  });
});
