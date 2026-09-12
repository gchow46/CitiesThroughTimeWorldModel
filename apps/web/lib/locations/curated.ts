// Curated launch anchors for the Then & Now comparison.
//
// Human-reviewed photo/location pairs keyed by the exact normalized archive
// record URL (SeedCandidate.sourceUrl / Seed.sourceUrl, with the original
// image URL as a secondary key). Every coordinate is taken from the archive
// record itself or another independently licensed source — never extracted
// from Google Maps content. A pin selected in Google Maps is a session-local
// override and is never persisted back into this dataset.
//
// See THEN_AND_NOW_IMPLEMENTATION_PLAN.md §5.2 "Curated launch anchors".

import type { SeedLocation } from "../types";
import { validateSeedLocation } from "../location";

export interface CuratedAnchor {
  /** Canonical archive record URL — e.g. the Commons file page. */
  sourceUrl: string;
  /** Optional original-image URL that also identifies this record. */
  imageUrl?: string;
  /**
   * Reviewed location. provenance is always "curated"; reviewedAt is the
   * review date (ISO). headingDeg only when the record documents a camera
   * heading.
   */
  location: SeedLocation;
  /** Why this pair is trustworthy — recorded for future reviewers. */
  rationale: string;
}

const REVIEWED_AT = "2026-09-12";

export const CURATED_ANCHORS: readonly CuratedAnchor[] = [
  {
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:07-31-1965_20115_Heineken_paarden_(6331548748).jpg",
    location: {
      point: { lat: 52.372592, lng: 4.90046 },
      role: "camera",
      provenance: "curated",
      evidenceUrl:
        "https://commons.wikimedia.org/wiki/File:07-31-1965_20115_Heineken_paarden_(6331548748).jpg",
      label: "Heineken drays, Amsterdam city centre (1965)",
      reviewedAt: REVIEWED_AT,
    },
    rationale:
      "Primary coordinates on the Commons file page (52.372592, 4.90046). " +
      "Commons' primary file coordinate follows the camera-location " +
      "convention; no heading is documented, so none is recorded.",
  },
  {
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:London_(Westminster),_1960,_east_at_Cavendish_Square_to_Margaret_Street_-_geograph.org.uk_-_4669179.jpg",
    location: {
      point: { lat: 51.51595316, lng: -0.14559087 },
      role: "camera",
      provenance: "curated",
      evidenceUrl:
        "https://commons.wikimedia.org/wiki/File:London_(Westminster),_1960,_east_at_Cavendish_Square_to_Margaret_Street_-_geograph.org.uk_-_4669179.jpg",
      label: "Cavendish Square looking east to Margaret Street, London (1960)",
      headingDeg: 90,
      reviewedAt: REVIEWED_AT,
    },
    rationale:
      "Geograph Britain and Ireland image on Commons with camera " +
      "coordinates 51.51595316, -0.14559087. The title documents the camera " +
      "pointed east ('east at Cavendish Square to Margaret Street') → " +
      "headingDeg 90.",
  },
  {
    // Located re-seed alternate for the Amsterdam demo cell.
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:05-02-1960_17230_1_Anne_Frank_Huis_(4158265672).jpg",
    location: {
      point: { lat: 52.375353, lng: 4.884409 },
      role: "subject",
      provenance: "curated",
      evidenceUrl:
        "https://commons.wikimedia.org/wiki/File:05-02-1960_17230_1_Anne_Frank_Huis_(4158265672).jpg",
      label: "Anne Frank House, Prinsengracht 263, Amsterdam (1960)",
      reviewedAt: REVIEWED_AT,
    },
    rationale:
      "Record coordinate 52.375353, 4.884409 sits on Prinsengracht 263, the " +
      "depicted building, and the identical coordinate is batch-assigned to " +
      "several files showing different subjects at the same site — so it is " +
      "kept as a subject (depicted place) anchor, not a verified camera.",
  },
];

/** Canonical comparison key for archive record URLs. */
export function normalizeRecordUrl(url: string | undefined): string | undefined {
  if (typeof url !== "string") return undefined;
  let s = url.trim();
  if (!s) return undefined;
  try {
    s = decodeURIComponent(s);
  } catch {
    // Keep the raw string — malformed escapes still compare literally.
  }
  // MediaWiki canonicalizes spaces to underscores in page URLs.
  return s.replace(/\s/g, "_");
}

interface AnchorIndex {
  bySourceUrl: Map<string, CuratedAnchor>;
  byImageUrl: Map<string, CuratedAnchor>;
}

function buildIndex(): AnchorIndex {
  const bySourceUrl = new Map<string, CuratedAnchor>();
  const byImageUrl = new Map<string, CuratedAnchor>();
  for (const anchor of CURATED_ANCHORS) {
    // A malformed curated entry must never poison matching — validate once.
    const location = validateSeedLocation(anchor.location);
    if (!location || location.provenance !== "curated") continue;
    const checked = { ...anchor, location };
    const sKey = normalizeRecordUrl(anchor.sourceUrl);
    const iKey = normalizeRecordUrl(anchor.imageUrl);
    if (sKey) bySourceUrl.set(sKey, checked);
    if (iKey) byImageUrl.set(iKey, checked);
  }
  return { bySourceUrl, byImageUrl };
}

const INDEX = buildIndex();

/** Find the reviewed anchor for an archive record/image URL pair. */
export function findCuratedAnchor(
  sourceUrl?: string,
  imageUrl?: string,
): CuratedAnchor | undefined {
  const s = normalizeRecordUrl(sourceUrl);
  if (s) {
    const hit = INDEX.bySourceUrl.get(s);
    if (hit) return hit;
  }
  const i = normalizeRecordUrl(imageUrl);
  if (i) return INDEX.byImageUrl.get(i);
  return undefined;
}

/**
 * Apply a curated override to a candidate or seed. Returns the input object
 * unchanged when no anchor matches; otherwise a copy whose `location` is the
 * reviewed curated location. Never touches caches — callers decide when to
 * apply (before cache write and again at response assembly).
 */
export function applyCuratedLocations<
  T extends { url: string; sourceUrl?: string; location?: SeedLocation },
>(item: T): T {
  const anchor = findCuratedAnchor(item.sourceUrl, item.url);
  if (!anchor) return item;
  return { ...item, location: { ...anchor.location } };
}
