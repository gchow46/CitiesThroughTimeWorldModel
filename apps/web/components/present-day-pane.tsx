"use client";

// Right-hand pane of the Then & Now comparison. All copy is honest about what
// is shown: recorded Street View imagery (or an explicitly synthetic
// substitute in preview/fake mode), never live video, never an implied
// same-location claim without evidence.

import type { ComparisonState, ComparisonTarget } from "../lib/comparison/types";
import type { CityLocation, Seed, SeedLocation } from "../lib/frontend-types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** imageDate arrives as "YYYY-MM"; anything else is shown verbatim. */
function captureLabel(imageDate?: string): string {
  if (!imageDate) return "Capture date unavailable";
  const [year, month] = imageDate.split("-");
  const m = Number(month);
  if (/^\d{4}$/.test(year) && m >= 1 && m <= 12) return `Captured ${MONTHS[m - 1]} ${year}`;
  return `Captured ${imageDate}`;
}

function provenanceLabel(target: ComparisonTarget | null, location?: SeedLocation): string {
  if (!target) return "No reference point selected";
  switch (target.kind) {
    case "manual":
      return "User-selected reference · not verified against the photo";
    case "city":
      return "City-center reference · not verified against the photo";
    case "camera":
      return location?.provenance === "curated"
        ? "Verified photo reference · nearby Street View"
        : "Archive camera location · viewpoint approximate";
    case "subject":
      return "Near the photographed subject · camera location unknown";
    case "approximate":
      return "Approximate photo area";
  }
}

function distanceLabel(distanceMeters: number): string {
  if (distanceMeters <= 50) return "Street View near the reference";
  return `Street View ~${Math.round(distanceMeters / 10) * 10} m away`;
}

const UNAVAILABLE_COPY: Record<string, string> = {
  "no-coverage": "No Street View imagery covers the area around this reference point.",
  timeout: "The present-day lookup took too long. The world on the left is unaffected.",
  configuration: "Present-day comparison isn't configured on this deployment.",
  network: "Couldn't reach the imagery service. Check your connection and try again.",
  quota: "Present-day imagery is temporarily unavailable — the usage limit was reached.",
};

const RETRYABLE = new Set(["timeout", "network", "quota"]);

function mapsUrl(
  view: { position: { lat: number; lng: number }; panoId?: string } | undefined,
  target: ComparisonTarget | null,
  city: CityLocation | undefined,
  cityName: string,
  synthetic: boolean,
): string | undefined {
  if (view && !synthetic && view.panoId)
    return `https://www.google.com/maps/@?api=1&map_action=pano&pano=${encodeURIComponent(view.panoId)}`;
  const point = view?.position ?? target?.point ?? city?.center;
  if (point) return `https://www.google.com/maps/search/?api=1&query=${point.lat},${point.lng}`;
  if (cityName)
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cityName)}`;
  return undefined;
}

export function PresentDayPane({
  state,
  target,
  seed,
  cityLocation,
  cityName,
  synthetic,
  onAcceptNearby,
  onReturnToReference,
  onSelectCityCenter,
  onRetry,
  onCollapse,
  panoRef,
  mapRef,
}: {
  state: ComparisonState;
  target: ComparisonTarget | null;
  seed: Seed;
  cityLocation?: CityLocation;
  cityName: string;
  synthetic: boolean;
  onAcceptNearby: () => void;
  onReturnToReference: () => void;
  onSelectCityCenter: () => void;
  onRetry: () => void;
  onCollapse: () => void;
  panoRef: (element: HTMLElement | null) => void;
  mapRef: (element: HTMLElement | null) => void;
}) {
  const view = state.status === "ready" || state.status === "nearby-offer" ? state.view : undefined;

  const link = mapsUrl(view, target, cityLocation, cityName, synthetic);
  const heading =
    state.status === "loading"
      ? "Locating imagery…"
      : state.status === "needs-location"
        ? "Choose a reference point"
        : state.status === "unavailable"
          ? "Comparison unavailable"
          : captureLabel(view?.imageDate);

  return (
    <section className="present-pane" aria-label="Present-day comparison">
      <header className="present-header">
        <div className="present-heading">
          <span className="eyebrow accent">
            {synthetic
              ? "Present-day reference · simulated imagery"
              : "Present-day reference · Google Street View"}
          </span>
          <h2>{heading}</h2>
          <p className="present-sub">
            {provenanceLabel(target, seed.location)}
            {view ? ` · ${distanceLabel(view.distanceMeters)}` : ""}
          </p>
        </div>
        <button
          type="button"
          className="button secondary present-collapse"
          onClick={onCollapse}
          aria-label="Hide present-day comparison"
        >
          Then only
        </button>
      </header>
      <div className="present-body">
        {synthetic && (
          <div className="pano-fallback" aria-hidden="true">
            <span>
              Simulated Street View
              <br />
              preview only — no live imagery
            </span>
          </div>
        )}
        <div className="pano-host" ref={panoRef} />
        {state.status === "loading" && (
          <p className="present-status" role="status">
            Finding present-day imagery…
          </p>
        )}
        {state.status === "nearby-offer" && view && (
          <div className="present-banner" role="status">
            <strong>
              The closest imagery is ~{Math.round(view.distanceMeters / 10) * 10} m away.
            </strong>
            <p>Check it before treating this as the photographed spot.</p>
            <button type="button" className="button secondary" onClick={onAcceptNearby}>
              Use nearby imagery
            </button>
          </div>
        )}
        {state.status === "needs-location" && (
          <div className="present-banner" role="status">
            <strong>Photo location unknown — choose a reference point</strong>
            <p>
              The archive record has no usable coordinates. Use the city center as an unverified
              reference, or continue without comparison.
            </p>
            <span className="present-banner-actions">
              {cityLocation && (
                <button type="button" className="button secondary" onClick={onSelectCityCenter}>
                  Explore city center instead
                </button>
              )}
              <button type="button" className="button secondary" onClick={onCollapse}>
                Continue without comparison
              </button>
            </span>
          </div>
        )}
        {state.status === "unavailable" && (
          <div className="present-banner" role="alert">
            <strong>{UNAVAILABLE_COPY[state.reason] ?? UNAVAILABLE_COPY.network}</strong>
            <span className="present-banner-actions">
              {RETRYABLE.has(state.reason) && (
                <button type="button" className="button secondary" onClick={onRetry}>
                  Try again
                </button>
              )}
              {link && (
                <a
                  className="button secondary"
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Search Google Maps
                </a>
              )}
            </span>
          </div>
        )}
        <div className="loc-map map-host-hidden" ref={mapRef} aria-hidden="true" />
      </div>
      <footer className="present-footer">
        <span className="present-disclaimer">
          Independent exploration — Street View is recorded imagery and is not synchronized with
          your generated camera.
        </span>
        <span className="present-actions">
          {view && (
            <button type="button" className="button secondary" onClick={onReturnToReference}>
              Return to reference
            </button>
          )}

          {link && (
            <a href={link} target="_blank" rel="noopener noreferrer">
              Open in Google Maps <span aria-hidden="true">↗</span>
            </a>
          )}
        </span>
      </footer>
    </section>
  );
}
