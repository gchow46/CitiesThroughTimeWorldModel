import { describe, expect, it } from "vitest";
import {
  assertSufficient,
  InsufficientPhotosError,
  rankCandidates,
  scoreCandidate,
  TOP_SEEDS,
} from "./ranking";
import type { SeedCandidate } from "./types";

const good = (over: Partial<SeedCandidate> = {}): SeedCandidate => ({
  url: "https://example.com/a.jpg",
  source: "wikimedia",
  year: 1967,
  title: "Damrak street with tram",
  license: "CC BY-SA 3.0",
  width: 2400,
  height: 1400,
  licenseConfidence: "high",
  ...over,
});

describe("scoreCandidate", () => {
  it("ranks in-decade high-res street photos on top", () => {
    const street = scoreCandidate(good(), 1960);
    const datedWrong = scoreCandidate(good({ year: 1930 }), 1960);
    const undated = scoreCandidate(good({ year: undefined }), 1960);
    const portrait = scoreCandidate(good({ width: 900, height: 1400 }), 1960);
    const nonStreet = scoreCandidate(good({ title: "Studio portrait of a man" }), 1960);
    const cse = scoreCandidate(good({ source: "google-cse", licenseConfidence: "low" }), 1960);
    const museum = scoreCandidate(
      good({ title: "Dameshoed. Objecttype: dameskleding hoed. Schenking 1987" }),
      1960,
    );
    const clutter = scoreCandidate(
      good({ title: "Openbreken van het asfalt van de Leidsestraat — road works" }),
      1960,
    );
    const walkable = scoreCandidate(good({ title: "Waterlooplein market square" }), 1960);

    expect(street).toBeGreaterThan(datedWrong);
    expect(datedWrong).toBeGreaterThan(undated);
    expect(street).toBeGreaterThan(nonStreet);
    expect(street).toBeGreaterThan(cse);
    expect(portrait).toBeLessThan(0.35); // hard penalty — below MIN_SCORE
    // Museum objects and traffic-heavy scenes sink below plain street shots.
    expect(street).toBeGreaterThan(museum);
    expect(street).toBeGreaterThan(clutter);
    expect(museum).toBeLessThan(0.35);
    // Open public spaces outrank vehicle-cluttered streets.
    expect(walkable).toBeGreaterThan(clutter);
  });

  it("uses the walkability signal when present", () => {
    const open = scoreCandidate(good({ walkability: 0.95 }), 1960);
    const blocked = scoreCandidate(good({ walkability: 0.05 }), 1960);
    const unscored = scoreCandidate(good(), 1960);
    expect(open).toBeGreaterThan(unscored);
    expect(unscored).toBeGreaterThan(blocked);
  });

  it("never lets CSE outrank an equivalent archive result", () => {
    const archive = scoreCandidate(good(), 1960);
    const cse = scoreCandidate(good({ source: "google-cse", licenseConfidence: "low" }), 1960);
    expect(archive).toBeGreaterThan(cse);
  });
});

describe("rankCandidates / assertSufficient golden tests", () => {
  it("Amsterdam 1960 — rich set, walkable scenes on top", () => {
    const cands = [
      good({ url: "https://x/a.jpg", title: "Damrak street with tram" }),
      good({ url: "https://x/b.jpg", title: "Map of canals" }),
      good({ url: "https://x/c.jpg", title: "Herengracht canal houses", year: 1963 }),
      good({
        url: "https://x/d.jpg",
        title: "Dameshandtas. Objecttype: tas handtas. Amsterdam Museum",
        year: 1960,
      }),
    ];
    const ranked = rankCandidates(cands, 1960);
    const top = assertSufficient(ranked);
    expect(top[0].title).toContain("canal"); // walkable space beats plain street
    expect(top.at(-1)!.title).toContain("Dameshandtas"); // museum object last
    expect(top.length).toBeLessThanOrEqual(TOP_SEEDS);
  });

  it("Paris 1920 — accepts photos tagged within decade", () => {
    const cands = [
      good({ url: "https://x/p1.jpg", year: 1925, title: "Boulevard Haussmann" }),
      good({ url: "https://x/p2.jpg", year: 1921, title: "Place de la Concorde" }),
    ];
    const top = assertSufficient(rankCandidates(cands, 1920));
    expect(top.length).toBe(2);
  });

  it("Lagos 1950 — sparse/low-quality set fails with closestDecade hint", () => {
    const cands = [
      good({
        url: "https://x/l1.jpg",
        year: undefined,
        title: "Colonial document scan",
        width: 900,
        height: 1100,
      }),
    ];
    expect(() => assertSufficient(rankCandidates(cands, 1950), 1960)).toThrow(
      InsufficientPhotosError,
    );
    try {
      assertSufficient(rankCandidates(cands, 1950), 1960);
    } catch (e) {
      expect((e as InsufficientPhotosError).closestDecade).toBe(1960);
    }
  });
});
