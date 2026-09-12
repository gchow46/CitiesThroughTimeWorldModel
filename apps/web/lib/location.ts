// Location validation and geometry helpers for the Then & Now extension.
// Policy: THEN_AND_NOW_IMPLEMENTATION_PLAN.md §5.3 — reject malformed
// metadata, never the otherwise-valid seed. Nothing here throws.

import type { GeoPoint, SeedLocation } from "./types";
import type { BBox } from "./geocode";

const LAT_MIN = -90;
const LAT_MAX = 90;
const LNG_MIN = -180;
const LNG_MAX = 180;

/** Wider than a city block: boundary streets and riverside photos stay in. */
export const BOUNDS_ALLOWANCE_DEG = 0.05; // ≈ 5 km

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** True for a finite lat/lng object inside valid world ranges. */
export function isGeoPoint(p: unknown): p is GeoPoint {
  if (typeof p !== "object" || p === null) return false;
  const { lat, lng } = p as Record<string, unknown>;
  return (
    isFiniteNumber(lat) &&
    isFiniteNumber(lng) &&
    lat >= LAT_MIN &&
    lat <= LAT_MAX &&
    lng >= LNG_MIN &&
    lng <= LNG_MAX
  );
}

/**
 * Normalize a heading to [0, 360). Non-finite input yields undefined.
 * Negative and ≥360 values wrap; exactly 360 normalizes to 0.
 */
export function normalizeHeadingDeg(h: unknown): number | undefined {
  if (!isFiniteNumber(h)) return undefined;
  const n = ((h % 360) + 360) % 360;
  // Avoid negative zero leaking into JSON.
  return n === 0 ? 0 : n;
}

/** Only http(s) evidence URLs are safe to hand to the browser. */
export function safeEvidenceUrl(u: unknown): string | undefined {
  if (typeof u !== "string" || u.length === 0 || u.length > 2048) return undefined;
  try {
    const url = new URL(u.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

const LOCATION_ROLES = new Set(["camera", "subject", "unknown"]);
const LOCATION_PROVENANCE = new Set(["archive", "curated"]);

/**
 * Validate an untrusted SeedLocation (cache, archive payload, curated data).
 * Returns undefined for anything malformed — the caller drops the location
 * but keeps the candidate/seed.
 */
export function validateSeedLocation(raw: unknown): SeedLocation | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const r = raw as Record<string, unknown>;
  if (!isGeoPoint(r.point)) return undefined;
  if (!LOCATION_ROLES.has(r.role as string)) return undefined;
  if (!LOCATION_PROVENANCE.has(r.provenance as string)) return undefined;
  const evidenceUrl = safeEvidenceUrl(r.evidenceUrl);
  if (!evidenceUrl) return undefined;

  const out: SeedLocation = {
    point: { lat: (r.point as GeoPoint).lat, lng: (r.point as GeoPoint).lng },
    role: r.role as SeedLocation["role"],
    provenance: r.provenance as SeedLocation["provenance"],
    evidenceUrl,
  };

  if (typeof r.label === "string" && r.label.trim()) out.label = r.label.trim().slice(0, 200);

  if (r.accuracyMeters !== undefined) {
    if (!isFiniteNumber(r.accuracyMeters) || r.accuracyMeters < 0) return undefined;
    out.accuracyMeters = r.accuracyMeters;
  }

  const heading = normalizeHeadingDeg(r.headingDeg);
  if (r.headingDeg !== undefined) {
    if (heading === undefined) return undefined;
    out.headingDeg = heading;
  }

  if (typeof r.reviewedAt === "string" && r.reviewedAt.trim())
    out.reviewedAt = r.reviewedAt.trim().slice(0, 40);

  return out;
}

/** Great-circle distance in meters (haversine). */
export function distanceMeters(a: GeoPoint, b: GeoPoint): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Initial bearing from → to, in degrees [0, 360). */
export function bearingDeg(from: GeoPoint, to: GeoPoint): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const y = Math.sin(toRad(to.lng - from.lng)) * Math.cos(toRad(to.lat));
  const x =
    Math.cos(toRad(from.lat)) * Math.sin(toRad(to.lat)) -
    Math.sin(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.cos(toRad(to.lng - from.lng));
  return normalizeHeadingDeg((Math.atan2(y, x) * 180) / Math.PI) ?? 0;
}

/**
 * True when the point falls inside the city bbox plus a documented allowance
 * for boundary streets. Used to flag out-of-area archive metadata, which is
 * then omitted from automatic matching — never a hard rejection of the photo.
 *
 * Note: (0, 0) is not a universal sentinel; sources apply their own
 * provider-documented sentinel rules before calling this.
 */
export function isWithinBounds(
  p: GeoPoint,
  bounds: BBox | undefined,
  allowanceDeg: number = BOUNDS_ALLOWANCE_DEG,
): boolean {
  if (!bounds) return true;
  return (
    p.lat >= bounds.south - allowanceDeg &&
    p.lat <= bounds.north + allowanceDeg &&
    p.lng >= bounds.west - allowanceDeg &&
    p.lng <= bounds.east + allowanceDeg
  );
}

/** Context sources pass to their transforms so out-of-area geo is dropped. */
export interface SourceGeoContext {
  bbox?: BBox;
}

/** Attach location only when it validates and lands inside the city context. */
export function locationForPoint(
  point: GeoPoint | undefined,
  ctx: SourceGeoContext | undefined,
  init: Omit<SeedLocation, "point">,
): SeedLocation | undefined {
  if (!point || !isGeoPoint(point)) return undefined;
  if (ctx?.bbox && !isWithinBounds(point, ctx.bbox)) return undefined;
  const loc = validateSeedLocation({ ...init, point });
  return loc;
}
