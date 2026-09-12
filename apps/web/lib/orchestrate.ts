import type { ModelCapabilities, ModelId, ProgressEvent, Seed, WorldPayload } from "@/lib/types";
import { cacheGet, cacheSet, withLock } from "./cache";
import { geocodeCity, type GeoResult } from "./geocode";
import { citySlug } from "./slug";
import { gatherCandidates, ARCHIVE_SOURCES, FALLBACK_SOURCE, type SourceQuery } from "./sources";
import {
  assertSufficient,
  InsufficientPhotosError,
  MIN_CANDIDATES,
  rankCandidates,
} from "./ranking";
import { scoreWalkability } from "./walkability";
import { normalizeSeed } from "./image";
import { composePrompt } from "./prompts";
import { mintToken } from "./reactor/token";
import { MODELS } from "./reactor/registry";

export type Emit = (e: ProgressEvent) => void;

const SHARED_TTL_SEC = 7 * 24 * 3600;
const MODEL_STATE_TTL_SEC = 30 * 24 * 3600;

export const worldKey = (slug: string, decade: number) => `world:${slug}:${decade}`;
export const modelStateKey = (slug: string, decade: number, model: ModelId) =>
  `world:${slug}:${decade}:${model}`;

interface SharedWorld {
  seed: Seed;
  alternates: Seed[];
  prompt: string;
  canonicalCity: string;
}

export interface OrchestrateInput {
  city: string;
  decade: number;
  model: ModelId;
}

async function probeDecade(q: SourceQuery, decade: number): Promise<boolean> {
  const found = await gatherCandidates(ARCHIVE_SOURCES, { ...q, decade });
  return found.length > 0;
}

async function closestDecadeHint(q: SourceQuery, decade: number): Promise<number | undefined> {
  const [prev, next] = await Promise.all([
    probeDecade(q, decade - 10),
    probeDecade(q, decade + 10),
  ]);
  if (prev) return decade - 10;
  if (next) return decade + 10;
  return undefined;
}

async function sourceSharedWorld(
  q: SourceQuery,
  slug: string,
  geo: GeoResult,
  caps: ModelCapabilities,
  emit: Emit,
): Promise<SharedWorld> {
  emit({ stage: "sourcing", detail: `querying ${ARCHIVE_SOURCES.length} archives` });
  let candidates = await gatherCandidates(ARCHIVE_SOURCES, q);

  if (candidates.length < MIN_CANDIDATES) {
    emit({ stage: "sourcing", detail: `${candidates.length} found — trying Google CSE` });
    candidates = candidates.concat(await gatherCandidates([FALLBACK_SOURCE], q));
  }
  emit({ stage: "sourcing", detail: `${candidates.length} candidates` });

  emit({ stage: "ranking" });
  const metadataRanked = rankCandidates(candidates, q.decade);
  emit({ stage: "ranking", detail: "scoring walkable foregrounds" });
  const withWalk = await scoreWalkability(metadataRanked);
  const ranked = rankCandidates(withWalk, q.decade);
  let top;
  try {
    top = assertSufficient(ranked);
  } catch (e) {
    if (e instanceof InsufficientPhotosError) {
      const hint = await closestDecadeHint(q, q.decade);
      throw new InsufficientPhotosError(e.message, hint);
    }
    throw e;
  }
  emit({ stage: "ranking", detail: `top score ${top[0].score.toFixed(2)}` });

  emit({ stage: "preparing", detail: "normalizing to 16:9" });
  const seeds = (await Promise.allSettled(top.map((c) => normalizeSeed(c, slug, q.decade))))
    .filter((r): r is PromiseFulfilledResult<Seed> => {
      if (r.status === "rejected") console.warn(`[world] normalize failed: ${r.reason}`);
      return r.status === "fulfilled";
    })
    .map((r) => r.value);
  if (seeds.length === 0) {
    throw new InsufficientPhotosError("All candidate images failed to normalize.");
  }

  const prompt = composePrompt({
    city: geo.canonicalName,
    countryCode: geo.countryCode,
    decade: q.decade,
    seed: seeds[0],
    caps,
  });

  const shared: SharedWorld = {
    seed: seeds[0],
    alternates: seeds.slice(1, 4),
    prompt,
    canonicalCity: geo.canonicalName,
  };
  await cacheSet(worldKey(slug, q.decade), shared, SHARED_TTL_SEC);
  return shared;
}

export async function runWorldPipeline(input: OrchestrateInput, emit: Emit): Promise<WorldPayload> {
  const t0 = Date.now();
  const caps = MODELS[input.model]().caps;

  emit({ stage: "geocoding", detail: input.city });
  const geo = await geocodeCity(input.city);
  const slug = citySlug(geo.canonicalName);
  emit({ stage: "geocoding", detail: geo.canonicalName });

  const q: SourceQuery = {
    cityName: geo.canonicalName.split(",")[0],
    countryCode: geo.countryCode,
    bbox: geo.bbox,
    lat: geo.lat,
    lon: geo.lon,
    decade: input.decade,
  };

  // Shared cache hit → only per-model state + a fresh token.
  const hit = await cacheGet<SharedWorld>(worldKey(slug, input.decade));
  const shared =
    hit ??
    (await withLock(worldKey(slug, input.decade), async () => {
      const again = await cacheGet<SharedWorld>(worldKey(slug, input.decade));
      return again ?? sourceSharedWorld(q, slug, geo, caps, emit);
    }));

  emit({ stage: "opening", detail: "minting session token" });
  const [modelState, { token, expiresAt }] = await Promise.all([
    cacheGet<Record<string, unknown>>(modelStateKey(slug, input.decade, input.model)),
    mintToken(input.model),
  ]);
  void expiresAt;

  const { id, reactorModelName, ...rest } = caps;
  return {
    model: { id, reactorModelName, caps: rest },
    sessionToken: token,
    seed: shared.seed,
    alternates: shared.alternates,
    prompt: shared.prompt,
    modelState: modelState ?? null,
    meta: {
      canonicalCity: shared.canonicalCity,
      cacheHit: Boolean(hit),
      sourcingMs: Date.now() - t0,
    },
  };
}

/** PATCH /api/world/cache — stores per-model state (e.g. encryptedWorldId). */
export async function writeModelState(
  city: string,
  decade: number,
  model: ModelId,
  state: Record<string, unknown>,
): Promise<void> {
  const geo = await geocodeCity(city); // cached — resolves canonical slug
  const key = modelStateKey(citySlug(geo.canonicalName), decade, model);
  const prev = (await cacheGet<Record<string, unknown>>(key)) ?? {};
  await cacheSet(key, { ...prev, ...state }, MODEL_STATE_TTL_SEC);
}
