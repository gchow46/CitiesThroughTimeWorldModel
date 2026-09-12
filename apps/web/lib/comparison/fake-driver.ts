// Deterministic fake PresentDayDriver for tests and local preview.
// No Google SDK imports, no network access — every state transition is
// computed locally from an injected scenario map or the target kind.
// See THEN_AND_NOW_IMPLEMENTATION_PLAN.md §6.3 for the contract rules.

import type { CityLocation, GeoPoint } from "../types";
import type {
  ComparisonState,
  ComparisonTarget,
  PresentDayDriver,
  PresentDayDriverFactory,
  PresentDayDriverOptions,
  PresentView,
} from "./types";

/** Outcomes the fake driver can produce for a target. */
export type FakeScenario =
  | "ready"
  | "nearby-offer"
  | "needs-location"
  | "no-coverage"
  | "timeout"
  | "configuration"
  | "network"
  | "quota";

export interface FakeDriverConfig {
  /** Scenario overrides keyed by ComparisonTarget.key. */
  scenarios?: Record<string, FakeScenario>;
  /** Fallback when a key has no override; otherwise derived from target kind. */
  defaultScenario?: FakeScenario;
  /** Artificial lookup delay in ms; 0 (default) resolves on a microtask. */
  delayMs?: number;
}

/** PresentDayDriver plus deterministic test hooks for the comparison UI. */
export interface FakePresentDayDriver extends PresentDayDriver {
  readonly state: ComparisonState;
  /** Simulates a user map click; emits onManualTarget only while expanded. */
  simulateManualClick(point: GeoPoint): void;
}

export type FakePresentDayDriverFactory = (
  options: PresentDayDriverOptions,
  signal: AbortSignal,
) => Promise<FakePresentDayDriver>;

// ~30 m offset: a "near reference" panorama for accepted targets.
const NEAR_OFFSET: GeoPoint = { lat: 0.0002, lng: 0.0003 };
// ~250 m offset: a distant panorama offered via "Show nearby imagery".
const FAR_OFFSET: GeoPoint = { lat: 0.002, lng: 0.0025 };
const FAKE_IMAGE_DATE = "2024-01";

function distanceMeters(a: GeoPoint, b: GeoPoint): number {
  const mPerDegLat = 111_320;
  const mPerDegLng = mPerDegLat * Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
  return Math.round(Math.hypot((b.lat - a.lat) * mPerDegLat, (b.lng - a.lng) * mPerDegLng));
}

class FakeDriver implements FakePresentDayDriver {
  private current: ComparisonState = { status: "needs-location" };
  /** Last accepted target and its preserved initial view (for returnToReference). */
  private accepted: { target: ComparisonTarget; view: PresentView } | null = null;
  /** Pending nearby offer bound to its target key — never auto-displayed. */
  private offer: { target: ComparisonTarget; view: PresentView } | null = null;
  private mapExpanded = false;
  private visible = true;
  private city?: CityLocation;
  private generation = 0;
  private disposed = false;

  constructor(
    private readonly options: PresentDayDriverOptions,
    private readonly config: FakeDriverConfig,
  ) {}

  get state(): ComparisonState {
    return this.current;
  }

  async setReference(target: ComparisonTarget | null, city?: CityLocation): Promise<void> {
    const gen = ++this.generation;
    this.offer = null;
    if (target === null) {
      // Null reference: map-only init with city context, never a panorama.
      this.accepted = null;
      this.city = city;
      this.emit({ status: "needs-location" });
      return;
    }
    // A new seed owns the next accepted view; never let Return restore the
    // previous seed while this lookup is pending or offering distant imagery.
    this.accepted = null;
    this.city = city ?? this.city;
    this.emit({ status: "loading" });
    await this.settle();
    if (this.disposed || gen !== this.generation) return;

    const scenario = this.scenarioFor(target);
    if (scenario === "ready" || scenario === "nearby-offer") {
      const view = this.viewFor(target, scenario === "ready" ? NEAR_OFFSET : FAR_OFFSET);
      if (scenario === "ready") {
        this.accepted = { target, view };
        this.emit({ status: "ready", view });
      } else {
        this.offer = { target, view };
        this.emit({ status: "nearby-offer", view });
      }
    } else if (scenario === "needs-location") {
      this.accepted = null;
      this.emit({ status: "needs-location" });
    } else {
      this.accepted = null;
      this.emit({ status: "unavailable", reason: scenario });
    }
  }

  acceptNearby(): void {
    if (this.disposed || this.offer === null) return;
    const { target, view } = this.offer;
    this.offer = null;
    this.accepted = { target, view };
    this.emit({ status: "ready", view });
  }

  async returnToReference(): Promise<void> {
    const gen = ++this.generation;
    const accepted = this.accepted;
    if (accepted === null) return;
    this.offer = null;
    this.emit({ status: "loading" });
    await this.settle();
    if (this.disposed || gen !== this.generation) return;
    this.emit({ status: "ready", view: accepted.view });
  }

  fitReferenceAndCamera(): void {
    // Adjusts map bounds only; never changes the panorama or emits a target.
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
  }

  setMapExpanded(expanded: boolean): void {
    this.mapExpanded = expanded;
  }

  resize(): void {
    // Preserves POV and position — nothing to recompute in the fake.
  }

  simulateManualClick(point: GeoPoint): void {
    // Only the expanded map permits manual point selection.
    if (this.disposed || !this.mapExpanded) return;
    this.options.onManualTarget(point);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.generation++;
    this.accepted = null;
    this.offer = null;
  }

  private scenarioFor(target: ComparisonTarget): FakeScenario {
    return this.config.scenarios?.[target.key] ?? this.config.defaultScenario ?? "ready";
  }

  private viewFor(target: ComparisonTarget, offset: GeoPoint): PresentView {
    const position: GeoPoint = {
      lat: target.point.lat + offset.lat,
      lng: target.point.lng + offset.lng,
    };
    return {
      panoId: `fake-pano:${target.key}`,
      position,
      headingDeg: target.headingDeg ?? 0,
      pitchDeg: 0,
      imageDate: FAKE_IMAGE_DATE,
      distanceMeters: distanceMeters(target.point, position),
    };
  }

  private emit(state: ComparisonState): void {
    if (this.disposed) return;
    this.current = state;
    this.options.onState(state);
  }

  private settle(): Promise<void> {
    const ms = this.config.delayMs ?? 0;
    return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
  }
}

/** Builds a deterministic fake factory for tests/preview-only selection. */
export function createFakePresentDayDriver(
  config: FakeDriverConfig = {},
): FakePresentDayDriverFactory {
  return (options, signal) => {
    if (signal.aborted) {
      return Promise.reject(new Error("fake present-day driver aborted"));
    }
    const driver = new FakeDriver(options, config);
    signal.addEventListener("abort", () => driver.dispose(), { once: true });
    return Promise.resolve(driver);
  };
}

/** Convenience factory with default scenarios for preview selection. */
export const fakePresentDayDriverFactory: PresentDayDriverFactory = createFakePresentDayDriver();
