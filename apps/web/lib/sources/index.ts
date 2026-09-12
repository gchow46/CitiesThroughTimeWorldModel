import type { SeedCandidate, SeedSourceId } from "@/lib/types";
import type { BBox } from "@/lib/geocode";
import { wikimediaSource } from "./wikimedia";
import { europeanaSource } from "./europeana";
import { flickrSource } from "./flickr";
import { googleCseSource } from "./googleCse";

export interface SourceQuery {
  cityName: string;
  countryCode: string;
  bbox: BBox;
  lat: number;
  lon: number;
  decade: number;
}

export interface SeedSource {
  id: SeedSourceId;
  /** Must never throw for a single bad record; may throw for source-level failure. */
  search(q: SourceQuery): Promise<SeedCandidate[]>;
}

/** Open archives — always tried first, high license confidence. */
export const ARCHIVE_SOURCES: SeedSource[] = [wikimediaSource, europeanaSource, flickrSource];

/** Fallback only — low license confidence. */
export const FALLBACK_SOURCE: SeedSource = googleCseSource;

const SOURCE_TIMEOUT_MS = 6000;

/**
 * Run sources in parallel, each isolated: one failing API never fails the
 * request, and each gets its own 6s timeout.
 */
export async function gatherCandidates(
  sources: SeedSource[],
  q: SourceQuery,
): Promise<SeedCandidate[]> {
  const results = await Promise.allSettled(
    sources.map(async (s) => {
      const out = await Promise.race([
        s.search(q),
        new Promise<never>((_, rej) =>
          setTimeout(() => rej(new Error("source timeout")), SOURCE_TIMEOUT_MS),
        ),
      ]);
      return out;
    }),
  );
  const candidates: SeedCandidate[] = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") candidates.push(...r.value);
    else console.warn(`[sources] ${sources[i].id} failed: ${r.reason?.message ?? r.reason}`);
  });
  return candidates;
}
