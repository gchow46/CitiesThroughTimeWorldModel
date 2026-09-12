import type { SeedCandidate } from "@/lib/types";

export const MIN_CANDIDATES = 5;
export const MIN_SCORE = 0.35;
export const TOP_SEEDS = 4; // 1 primary + ≤3 alternates

const TARGET_ASPECT = 16 / 9;

const STREET_KEYWORDS =
  /street|straat|strasse|rua|square|plein|platz|plaza|avenue|canal|gracht|boulevard|tram|market|bridge|quay|road|lane/i;
const BAD_KEYWORDS =
  /aerial|map|plan|diagram|document|portrait|interior|studio|coat of arms|logo|poster|screenshot|illustration|drawing|painting|engraving/i;

export interface RankedSeed extends SeedCandidate {
  score: number;
}

function dateScore(c: SeedCandidate, decade: number): number {
  if (c.year === undefined) return 0.15;
  if (c.year >= decade && c.year <= decade + 9) return 1;
  // within the ±2 tolerance window the sources already applied
  return 0.6;
}

function resolutionScore(c: SeedCandidate): number {
  if (!c.width) return 0.4;
  return Math.min(1, c.width / 1600);
}

function aspectScore(c: SeedCandidate): number {
  if (!c.width || !c.height) return 0.5;
  const ar = c.width / c.height;
  if (ar < 1) return 0.05; // portrait — hard penalty (strictest model needs 1.5–2.0)
  const diff = Math.abs(ar - TARGET_ASPECT) / TARGET_ASPECT;
  return Math.max(0.1, 1 - diff);
}

function streetScore(c: SeedCandidate): number {
  const text = `${c.title ?? ""} ${c.sourceUrl ?? ""}`;
  if (BAD_KEYWORDS.test(text)) return 0.1;
  if (STREET_KEYWORDS.test(text)) return 1;
  return 0.55;
}

function licenseScore(c: SeedCandidate): number {
  return c.licenseConfidence === "high" ? 1 : 0.5;
}

/** Archive sources always outrank the CSE fallback. */
function sourceTier(c: SeedCandidate): number {
  return c.source === "google-cse" ? 0 : 1;
}

const WEIGHTS = { date: 0.3, res: 0.15, aspect: 0.2, street: 0.2, license: 0.1, tier: 0.05 };

export function scoreCandidate(c: SeedCandidate, decade: number): number {
  const base =
    WEIGHTS.date * dateScore(c, decade) +
    WEIGHTS.res * resolutionScore(c) +
    WEIGHTS.aspect * aspectScore(c) +
    WEIGHTS.street * streetScore(c) +
    WEIGHTS.license * licenseScore(c) +
    WEIGHTS.tier * sourceTier(c);
  // Hard penalty on portraits — can't crop to a 16:9 landscape seed.
  const portrait = c.width && c.height ? c.width / c.height < 1 : false;
  return portrait ? base * 0.25 : base;
}

/** Deterministic rank: score desc, then url for stability. */
export function rankCandidates(candidates: SeedCandidate[], decade: number): RankedSeed[] {
  return candidates
    .map((c) => ({ ...c, score: scoreCandidate(c, decade) }))
    .sort((a, b) => b.score - a.score || a.url.localeCompare(b.url));
}

export class InsufficientPhotosError extends Error {
  readonly code = "insufficient_archival_photos" as const;
  constructor(
    message: string,
    readonly closestDecade?: number,
  ) {
    super(message);
  }
}

/**
 * Returns the top seeds or throws InsufficientPhotosError.
 * `probeDecade` is called for decade-10/decade+10 to produce a closestDecade
 * hint; it should run a cheap candidate count for that decade.
 */
export function assertSufficient(ranked: RankedSeed[], closestDecade?: number): RankedSeed[] {
  if (ranked.length < 1 || ranked[0].score < MIN_SCORE) {
    throw new InsufficientPhotosError(
      "Too few usable archival photos for this city/decade.",
      closestDecade,
    );
  }
  return ranked.slice(0, TOP_SEEDS);
}
