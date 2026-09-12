// Singleton loader for the Maps JavaScript API.
//
// Loads the `maps`, `streetView` and `marker` libraries on the `quarterly`
// channel using NEXT_PUBLIC_GOOGLE_MAPS_API_KEY / NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID.
// Nothing is requested until loadGoogleMapsApi() is called by an enabled
// caller. All failures are normalized to GoogleMapsLoadError with a
// ComparisonState-compatible reason — raw provider messages never surface.
//
// See THEN_AND_NOW_IMPLEMENTATION_PLAN.md §3.2/§6.4.

import { setOptions, importLibrary } from "@googlemaps/js-api-loader";

export interface GoogleMapsApi {
  maps: google.maps.MapsLibrary;
  streetView: google.maps.StreetViewLibrary;
  marker: google.maps.MarkerLibrary;
  /** LatLngBounds + google.maps.event live in the core library. */
  core: google.maps.CoreLibrary;
  /** Configured JavaScript map ID for Advanced Markers; undefined when unset. */
  mapId?: string;
}

/** Reasons shared with ComparisonState's unavailable variant. */
export type GoogleLoadReason = "configuration" | "network" | "quota";

export class GoogleMapsLoadError extends Error {
  readonly reason: GoogleLoadReason;
  constructor(reason: GoogleLoadReason, detail: string) {
    super(`google maps load failed (${reason}): ${detail}`);
    this.name = "GoogleMapsLoadError";
    this.reason = reason;
  }
}

/** Classify a loader/auth failure without echoing provider text. */
function classifyLoadError(e: unknown): GoogleMapsLoadError {
  if (e instanceof GoogleMapsLoadError) return e;
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
  if (/invalidkey|apitargetblocked|apinotactivated|referer|not authorized|authfail|key/.test(msg)) {
    return new GoogleMapsLoadError("configuration", "key, referrer or API activation rejected");
  }
  if (/quota|billing|over_query_limit|overquerylimit|rate.?limit/.test(msg)) {
    return new GoogleMapsLoadError("quota", "provider quota or billing limit reached");
  }
  return new GoogleMapsLoadError("network", "the maps library could not be loaded");
}

let loadPromise: Promise<GoogleMapsApi> | null = null;

async function load(): Promise<GoogleMapsApi> {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key) {
    throw new GoogleMapsLoadError("configuration", "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not set");
  }
  const mapId = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || undefined;

  // Surface google.maps auth failures (InvalidKeyMapError etc.) which the
  // loader does not reliably reject on its own.
  let authFailure: GoogleMapsLoadError | null = null;
  const prevAuthFailure =
    typeof window !== "undefined"
      ? (window as unknown as { gm_authFailure?: () => void }).gm_authFailure
      : undefined;
  if (typeof window !== "undefined") {
    (window as unknown as { gm_authFailure?: () => void }).gm_authFailure = () => {
      authFailure = new GoogleMapsLoadError(
        "configuration",
        "the maps API rejected the configured key",
      );
    };
  }

  try {
    setOptions({
      key,
      v: "quarterly",
      ...(mapId ? { mapIds: [mapId] } : {}),
      // Keep referrer transmission compatible with website restrictions.
      authReferrerPolicy: "origin",
    });
    const [maps, streetView, marker, core] = await Promise.all([
      importLibrary("maps"),
      importLibrary("streetView"),
      importLibrary("marker"),
      importLibrary("core"),
    ]);
    if (authFailure) throw authFailure;
    return { maps, streetView, marker, core, mapId };
  } catch (e) {
    throw classifyLoadError(authFailure ?? e);
  } finally {
    if (typeof window !== "undefined") {
      (window as unknown as { gm_authFailure?: () => void }).gm_authFailure = prevAuthFailure;
    }
  }
}

/**
 * Load the API once per page. A genuinely failed load clears the singleton
 * so the next call retries; a successful load is reused for the session.
 */
export function loadGoogleMapsApi(): Promise<GoogleMapsApi> {
  if (!loadPromise) {
    loadPromise = load();
    loadPromise.catch(() => {
      loadPromise = null;
    });
  }
  return loadPromise;
}

/** Test hook: reset the singleton so a fresh load can be exercised. */
export function resetGoogleMapsLoaderForTests(): void {
  loadPromise = null;
}
