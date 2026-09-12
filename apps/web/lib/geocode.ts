import { cacheGet, cacheSet } from "./cache";
import { fetchJson } from "./http";

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const CACHE_TTL_SEC = 30 * 24 * 3600; // 30d — Nominatim usage policy

export interface BBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

export interface GeoResult {
  canonicalName: string;
  countryCode: string;
  bbox: BBox;
  lat: number;
  lon: number;
  /** True when the query matched multiple distinct cities (we picked the top one). */
  ambiguous: boolean;
}

export class InvalidCityError extends Error {
  readonly code = "invalid_city" as const;
}

interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
  boundingbox: [string, string, string, string];
  importance?: number;
  type?: string;
  class?: string;
  address?: { country_code?: string };
}

// Nominatim policy: max 1 req/s. Serialize calls through a 1s-spaced chain.
let lastCall = Promise.resolve(0);

async function nominatim(query: string): Promise<NominatimResult[]> {
  const run = lastCall.then(async () => {
    await new Promise((r) => setTimeout(r, Math.max(0, 1000 - (Date.now() - lastCallAt))));
    lastCallAt = Date.now();
    const u = new URL(NOMINATIM_URL);
    u.searchParams.set("format", "jsonv2");
    u.searchParams.set("q", query);
    u.searchParams.set("limit", "5");
    u.searchParams.set("addressdetails", "1");
    return fetchJson<NominatimResult[]>(u.toString());
  });
  lastCall = run.then(
    () => Date.now(),
    () => Date.now(),
  );
  return run;
}
let lastCallAt = 0;

export function normalizeCityInput(city: string): string {
  return city.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Geocode a free-text city via Nominatim. Cached 30d by normalized input.
 * Throws InvalidCityError when nothing usable comes back.
 */
export async function geocodeCity(city: string): Promise<GeoResult> {
  const key = `geo:${normalizeCityInput(city)}`;
  const cached = await cacheGet<GeoResult>(key);
  if (cached) return cached;

  const results = await nominatim(city.trim()).catch((e) => {
    throw new Error(`nominatim: ${e.message}`);
  });

  // Prefer actual settlements, then by importance.
  const places = results
    .filter((r) => r.boundingbox && r.lat && r.lon)
    .sort((a, b) => {
      const settlement = (r: NominatimResult) =>
        ["city", "town", "village", "municipality", "administrative"].includes(r.type ?? "")
          ? 1
          : 0;
      return settlement(b) - settlement(a) || (b.importance ?? 0) - (a.importance ?? 0);
    });

  const top = places[0];
  if (!top) throw new InvalidCityError(`No place found for "${city}".`);

  const ambiguous =
    places.length > 1 &&
    new Set(places.map((r) => r.display_name.split(",")[0].trim().toLowerCase())).size === 1;

  const geo: GeoResult = {
    canonicalName: top.display_name,
    countryCode: (top.address?.country_code ?? "").toUpperCase(),
    bbox: {
      south: Number(top.boundingbox[0]),
      north: Number(top.boundingbox[1]),
      west: Number(top.boundingbox[2]),
      east: Number(top.boundingbox[3]),
    },
    lat: Number(top.lat),
    lon: Number(top.lon),
    ambiguous,
  };

  await cacheSet(key, geo, CACHE_TTL_SEC);
  return geo;
}
