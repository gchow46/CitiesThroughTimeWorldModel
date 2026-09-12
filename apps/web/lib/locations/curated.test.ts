import { describe, expect, it } from "vitest";
import type { Seed, SeedCandidate } from "../types";
import {
  applyCuratedLocations,
  CURATED_ANCHORS,
  findCuratedAnchor,
  normalizeRecordUrl,
} from "./curated";

describe("curated anchors", () => {
  it("contain at least three reviewed pairs across two cities", () => {
    expect(CURATED_ANCHORS.length).toBeGreaterThanOrEqual(3);
    for (const a of CURATED_ANCHORS) {
      expect(a.location.provenance).toBe("curated");
      expect(a.location.reviewedAt).toBeTruthy();
      expect(a.location.evidenceUrl.startsWith("https://")).toBe(true);
      expect(a.rationale.length).toBeGreaterThan(10);
    }
  });

  it("matches on the exact normalized record URL", () => {
    const anchor = CURATED_ANCHORS[0];
    const spaced = anchor.sourceUrl.replace(/_/g, " ");
    expect(findCuratedAnchor(spaced)?.sourceUrl).toBe(anchor.sourceUrl);
    // City-name or partial matches are never enough.
    expect(findCuratedAnchor("https://commons.wikimedia.org/wiki/Amsterdam")).toBeUndefined();
    expect(findCuratedAnchor(undefined, undefined)).toBeUndefined();
  });
});

describe("applyCuratedLocations", () => {
  const anchor = CURATED_ANCHORS[0];

  it("overrides a matching seed location and leaves others untouched", () => {
    const seed: Seed = {
      url: "https://blob/x.jpg",
      thumbUrl: "https://blob/x.thumb.jpg",
      source: "wikimedia",
      sourceUrl: anchor.sourceUrl,
      licenseConfidence: "high",
      restored: false,
      location: {
        point: { lat: 0, lng: 0 },
        role: "unknown",
        provenance: "archive",
        evidenceUrl: "https://commons.wikimedia.org/wiki/Somewhere",
      },
    };
    const out = applyCuratedLocations(seed);
    expect(out).not.toBe(seed);
    expect(out.location).toEqual(anchor.location);
    // The original object is not mutated.
    expect(seed.location?.point).toEqual({ lat: 0, lng: 0 });
  });

  it("supplies a location to an unlocated matching candidate", () => {
    const cand: SeedCandidate = {
      url: "https://upload.wikimedia.org/x.jpg",
      source: "wikimedia",
      sourceUrl: anchor.sourceUrl,
      licenseConfidence: "high",
    };
    const out = applyCuratedLocations(cand);
    expect(out.location?.provenance).toBe("curated");
  });

  it("returns the same object when nothing matches", () => {
    const cand: SeedCandidate = {
      url: "https://upload.wikimedia.org/y.jpg",
      source: "wikimedia",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Other.jpg",
      licenseConfidence: "high",
    };
    expect(applyCuratedLocations(cand)).toBe(cand);
  });

  it("normalizes percent-encoded URLs to the same record", () => {
    const encoded = anchor.sourceUrl.replace("(", "%28").replace(")", "%29");
    expect(normalizeRecordUrl(encoded)).toBe(normalizeRecordUrl(anchor.sourceUrl));
    expect(findCuratedAnchor(encoded)?.sourceUrl).toBe(anchor.sourceUrl);
  });
});
