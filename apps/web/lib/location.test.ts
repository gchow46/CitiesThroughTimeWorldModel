import { describe, expect, it } from "vitest";
import {
  bearingDeg,
  distanceMeters,
  isGeoPoint,
  isWithinBounds,
  locationForPoint,
  normalizeHeadingDeg,
  safeEvidenceUrl,
  validateSeedLocation,
} from "./location";

describe("isGeoPoint", () => {
  it("accepts finite in-range points", () => {
    expect(isGeoPoint({ lat: 52.37, lng: 4.9 })).toBe(true);
    expect(isGeoPoint({ lat: -90, lng: -180 })).toBe(true);
    expect(isGeoPoint({ lat: 90, lng: 180 })).toBe(true);
    // (0,0) is not a universal sentinel — providers have their own rules.
    expect(isGeoPoint({ lat: 0, lng: 0 })).toBe(true);
  });

  it("rejects out-of-range, non-finite and non-numeric points", () => {
    expect(isGeoPoint({ lat: 91, lng: 0 })).toBe(false);
    expect(isGeoPoint({ lat: 0, lng: -181 })).toBe(false);
    expect(isGeoPoint({ lat: NaN, lng: 0 })).toBe(false);
    expect(isGeoPoint({ lat: Infinity, lng: 0 })).toBe(false);
    expect(isGeoPoint({ lat: "52.37", lng: 4.9 })).toBe(false);
    expect(isGeoPoint(null)).toBe(false);
    expect(isGeoPoint({ lat: 52 })).toBe(false);
  });
});

describe("normalizeHeadingDeg", () => {
  it("wraps into [0, 360)", () => {
    expect(normalizeHeadingDeg(0)).toBe(0);
    expect(normalizeHeadingDeg(359.9)).toBeCloseTo(359.9);
    expect(normalizeHeadingDeg(360)).toBe(0);
    expect(normalizeHeadingDeg(-90)).toBe(270);
    expect(normalizeHeadingDeg(725)).toBe(5);
  });

  it("rejects non-finite input", () => {
    expect(normalizeHeadingDeg(NaN)).toBeUndefined();
    expect(normalizeHeadingDeg("90")).toBeUndefined();
    expect(normalizeHeadingDeg(undefined)).toBeUndefined();
  });
});

describe("safeEvidenceUrl", () => {
  it("accepts http/https URLs", () => {
    expect(safeEvidenceUrl("https://commons.wikimedia.org/wiki/File:X.jpg")).toContain("https:");
    expect(safeEvidenceUrl("http://example.com/p")).toBe("http://example.com/p");
  });

  it("rejects unsafe or malformed URLs", () => {
    expect(safeEvidenceUrl("javascript:alert(1)")).toBeUndefined();
    expect(safeEvidenceUrl("file:///etc/passwd")).toBeUndefined();
    expect(safeEvidenceUrl("not a url")).toBeUndefined();
    expect(safeEvidenceUrl("")).toBeUndefined();
    expect(safeEvidenceUrl(42)).toBeUndefined();
  });
});

describe("validateSeedLocation", () => {
  const valid = {
    point: { lat: 52.372592, lng: 4.90046 },
    role: "camera",
    provenance: "curated",
    evidenceUrl: "https://commons.wikimedia.org/wiki/File:X.jpg",
  };

  it("passes a well-formed location through", () => {
    const loc = validateSeedLocation({ ...valid, headingDeg: 90, accuracyMeters: 12 });
    expect(loc).toMatchObject({
      point: { lat: 52.372592, lng: 4.90046 },
      role: "camera",
      provenance: "curated",
      headingDeg: 90,
      accuracyMeters: 12,
    });
  });

  it("normalizes wrapped headings", () => {
    expect(validateSeedLocation({ ...valid, headingDeg: -30 })?.headingDeg).toBe(330);
  });

  it("rejects malformed records without throwing", () => {
    expect(validateSeedLocation(undefined)).toBeUndefined();
    expect(validateSeedLocation("52.37,4.9")).toBeUndefined();
    expect(validateSeedLocation({ ...valid, point: { lat: 95, lng: 0 } })).toBeUndefined();
    expect(validateSeedLocation({ ...valid, role: "satellite" })).toBeUndefined();
    expect(validateSeedLocation({ ...valid, provenance: "google" })).toBeUndefined();
    expect(validateSeedLocation({ ...valid, evidenceUrl: "javascript:x" })).toBeUndefined();
    expect(validateSeedLocation({ ...valid, accuracyMeters: -1 })).toBeUndefined();
    expect(validateSeedLocation({ ...valid, headingDeg: NaN })).toBeUndefined();
  });
});

describe("distanceMeters / bearingDeg", () => {
  it("computes plausible distances", () => {
    const a = { lat: 52.372592, lng: 4.90046 };
    const b = { lat: 52.373, lng: 4.901 };
    const d = distanceMeters(a, b);
    expect(d).toBeGreaterThan(40);
    expect(d).toBeLessThan(80);
    expect(distanceMeters(a, a)).toBe(0);
  });

  it("computes bearings", () => {
    const a = { lat: 52.0, lng: 4.0 };
    expect(bearingDeg(a, { lat: 52.01, lng: 4.0 })).toBeCloseTo(0, 0);
    expect(bearingDeg(a, { lat: 52.0, lng: 4.01 })).toBeCloseTo(90, 0);
    expect(bearingDeg(a, { lat: 51.99, lng: 4.0 })).toBeCloseTo(180, 0);
    expect(bearingDeg(a, { lat: 52.0, lng: 3.99 })).toBeCloseTo(270, 0);
  });
});

describe("isWithinBounds / locationForPoint", () => {
  const amsterdam = { south: 52.25, west: 4.72, north: 52.45, east: 5.05 };
  const init = {
    role: "unknown" as const,
    provenance: "archive" as const,
    evidenceUrl: "https://commons.wikimedia.org/wiki/File:X.jpg",
  };

  it("accepts in-bounds and boundary points, rejects far-away ones", () => {
    expect(isWithinBounds({ lat: 52.37, lng: 4.9 }, amsterdam)).toBe(true);
    expect(isWithinBounds({ lat: 52.49, lng: 4.9 }, amsterdam)).toBe(true); // inside allowance
    expect(isWithinBounds({ lat: 51.92, lng: 4.48 }, amsterdam)).toBe(false); // Rotterdam
    expect(isWithinBounds({ lat: 52.37, lng: 4.9 }, undefined)).toBe(true);
  });

  it("drops out-of-area locations instead of failing the candidate", () => {
    expect(locationForPoint({ lat: 51.92, lng: 4.48 }, { bbox: amsterdam }, init)).toBeUndefined();
    const ok = locationForPoint({ lat: 52.37, lng: 4.9 }, { bbox: amsterdam }, init);
    expect(ok?.point).toEqual({ lat: 52.37, lng: 4.9 });
  });
});
