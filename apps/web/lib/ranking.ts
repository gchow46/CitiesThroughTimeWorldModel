import type { SeedCandidate } from "@/lib/types";

export const MIN_CANDIDATES = 5;
export const MIN_SCORE = 0.35;
export const TOP_SEEDS = 4; // 1 primary + ≤3 alternates

const TARGET_ASPECT = 16 / 9;

const STREET_KEYWORDS =
  /street|straat|strasse|rua|avenue|boulevard|tram|road|lane|quay|kade|brug|bridge|dock|harbour|harbor/i;
/** Open public spaces — naturally walkable, usually vehicle-light. */
const WALKABLE_KEYWORDS =
  /square|plein|platz|plaza|place|piazza|markt|market|plein|park|gracht|canal|promenade|pedestrian|winkelstraat|shopping|courtyard|hofje|bazaar|souk|medina|garden|tuin/i;
/** Street scenes likely blocked by vehicles/works — bad spawn frames. */
const CLUTTER_KEYWORDS =
  /verkeer|traffic|parking|parkeer|garage|petrol|benzine|gas station|highway|snelweg|autos|automobile|\bcars?\b|voertuig|vehicle|truck|vrachtwagen|bus |buses|road ?works?|asfalt|asphalt|opbraak|construction|werkzaamheden|demolition|sloop|congestion|file\b/i;
/**
 * Museum/archive OBJECT photography — dated to the era but not a place.
 * Only markers that physical-object records carry (Objecttype, Afmetingen,
 * Fysieke kenmerken…) — photo-archive boilerplate like Bestanddeelnummer or
 * Collectie also appears on genuine street photography (e.g. Anefo).
 */
const MUSEUM_KEYWORDS =
  /objecttype|objectnummer|object name|huidige locatie|in depot|fysieke kenmerken|afmetingen|vervaardiging|credit line|accession|museum object|tentoonstelling|exhibit/i;
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

function sceneScore(c: SeedCandidate): number {
  const text = `${c.title ?? ""} ${c.sourceUrl ?? ""}`;
  if (BAD_KEYWORDS.test(text) || MUSEUM_KEYWORDS.test(text)) return 0.05;
  if (CLUTTER_KEYWORDS.test(text)) return 0.3;
  if (WALKABLE_KEYWORDS.test(text)) return 1;
  if (STREET_KEYWORDS.test(text)) return 0.8;
  return 0.55;
}

/** Visual pass (lib/walkability.ts); neutral when a thumb couldn't be scored. */
function walkScore(c: SeedCandidate): number {
  return c.walkability ?? 0.5;
}

function licenseScore(c: SeedCandidate): number {
  return c.licenseConfidence === "high" ? 1 : 0.5;
}

/** Archive sources always outrank the CSE fallback. */
function sourceTier(c: SeedCandidate): number {
  return c.source === "google-cse" ? 0 : 1;
}

const WEIGHTS = {
  date: 0.25,
  res: 0.1,
  aspect: 0.15,
  scene: 0.2,
  license: 0.1,
  tier: 0.05,
  walk: 0.15,
};

export function scoreCandidate(c: SeedCandidate, decade: number): number {
  const base =
    WEIGHTS.date * dateScore(c, decade) +
    WEIGHTS.res * resolutionScore(c) +
    WEIGHTS.aspect * aspectScore(c) +
    WEIGHTS.scene * sceneScore(c) +
    WEIGHTS.license * licenseScore(c) +
    WEIGHTS.tier * sourceTier(c) +
    WEIGHTS.walk * walkScore(c);
  // Hard penalty on portraits — can't crop to a 16:9 landscape seed.
  const portrait = c.width && c.height ? c.width / c.height < 1 : false;
  // Museum objects aren't walkable places no matter how well-dated.
  const museum = MUSEUM_KEYWORDS.test(`${c.title ?? ""} ${c.sourceUrl ?? ""}`);
  const penalties = (portrait ? 0.25 : 1) * (museum ? 0.4 : 1);
  return base * penalties;
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
