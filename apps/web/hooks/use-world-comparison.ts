"use client";

// Comparison controller for the Then & Now pane.
// Owns PresentDayDriverFactory selection, ComparisonTarget derivation from the
// active seed, manual-override state, and the driver lifecycle. Google/driver
// failures stay local to this hook — they never touch the world session.
// See THEN_AND_NOW_IMPLEMENTATION_PLAN.md §6.3.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CityLocation, GeoPoint } from "../lib/types";
import type {
  ComparisonState,
  ComparisonTarget,
  PresentDayDriver,
  PresentDayDriverFactory,
  PresentDayDriverOptions,
} from "../lib/comparison/types";
import type { Seed } from "../lib/frontend-types";

export interface UseWorldComparisonOptions {
  /** Feature flag + payload present + the pane has been opened at least once. */
  enabled: boolean;
  /** Preview/backend-mock sessions always use the fake driver. */
  preview: boolean;
  seed?: Seed;
  cityLocation?: CityLocation;
  panoramaElement: HTMLElement | null;
  mapElement: HTMLElement | null;
  /** Synced to driver.setVisible on driver/visibility change. */
  visible: boolean;
  /** Synced to driver.setMapExpanded on driver/expanded change. */
  mapExpanded: boolean;
}

export interface WorldComparisonHandle {
  state: ComparisonState;
  target: ComparisonTarget | null;
  /** True when the fake driver backs the pane (preview/dev-fake). */
  synthetic: boolean;
  acceptNearby: () => void;
  returnToReference: () => void;
  fitReferenceAndCamera: () => void;
  resize: () => void;
  /** Re-runs the current lookup after an unavailable state. */
  retry: () => void;
  /** Deliberately opens an unverified city-center reference. */
  selectCityCenter: () => void;
}

type ManualOverride = {
  seedKey: string;
  point: GeoPoint;
  kind: "manual" | "city";
  revision: number;
};

type LoadedFactory = { factory: PresentDayDriverFactory; synthetic: boolean };

function shouldUseFakeDriver(preview: boolean): boolean {
  const devFake =
    process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_COMPARISON_DRIVER === "fake";
  return preview || devFake;
}

async function loadPresentDayFactory(preview: boolean): Promise<LoadedFactory> {
  if (shouldUseFakeDriver(preview)) {
    const mod = await import("../lib/comparison/fake-driver");
    return { factory: mod.fakePresentDayDriverFactory, synthetic: true };
  }
  const mod = await import("../lib/comparison/google-driver");
  if (typeof mod.googlePresentDayDriverFactory !== "function")
    throw new Error("google present-day driver is unavailable");
  return { factory: mod.googlePresentDayDriverFactory, synthetic: false };
}

/** Test/preview handle: the fake driver instance, for Playwright hooks. */
function exposeFakeDriver(driver: PresentDayDriver | null) {
  if (typeof window === "undefined") return;
  const w = window as unknown as Record<string, unknown>;
  if (driver) w.__cttPresentDriver = driver;
  else delete w.__cttPresentDriver;
}

export function useWorldComparison({
  enabled,
  preview,
  seed,
  cityLocation,
  panoramaElement,
  mapElement,
  visible,
  mapExpanded,
}: UseWorldComparisonOptions): WorldComparisonHandle {
  const [state, setState] = useState<ComparisonState>({ status: "disabled" });
  const [driver, setDriver] = useState<PresentDayDriver | null>(null);
  const [synthetic, setSynthetic] = useState(false);
  const driverRef = useRef<PresentDayDriver | null>(null);
  const [manual, setManual] = useState<ManualOverride | null>(null);
  // Incrementing this rebuilds the driver after a factory/loader failure.
  const [driverAttempt, setDriverAttempt] = useState(0);

  // Seed identity = normalized URL + source URL + title. Mock alternates can
  // share URLs, so the title keeps distinct photos distinct.
  const seedKey = seed ? `${seed.url}\n${seed.sourceUrl}\n${seed.title}` : "";
  const seedKeyRef = useRef(seedKey);
  seedKeyRef.current = seedKey;
  const cityRef = useRef(cityLocation);
  cityRef.current = cityLocation;

  // A manual override only applies to the seed it was chosen for.
  const activeManual = manual && manual.seedKey === seedKey ? manual : null;
  useEffect(() => {
    setManual((prev) => (prev && prev.seedKey !== seedKey ? null : prev));
  }, [seedKey]);

  const target = useMemo<ComparisonTarget | null>(() => {
    if (activeManual) {
      const { point, kind, revision } = activeManual;
      return {
        key: `${seedKey}\n${kind}:${point.lat.toFixed(6)},${point.lng.toFixed(6)}#${revision}`,
        point,
        kind,
      };
    }
    const location = seed?.location;
    if (!seed || !location) return null;
    const { point } = location;
    return {
      key: `${seedKey}\n${location.role}:${point.lat.toFixed(6)},${point.lng.toFixed(6)}`,
      point,
      kind:
        location.role === "camera"
          ? "camera"
          : location.role === "subject"
            ? "subject"
            : "approximate",
      // headingDeg is a documented camera heading; a subject's coordinates
      // carry no orientation evidence.
      headingDeg: location.role === "camera" ? location.headingDeg : undefined,
    };
  }, [activeManual, seed, seedKey]);
  const targetKey = target?.key ?? null;
  const targetRef = useRef(target);
  targetRef.current = target;

  // Driver lifecycle: created lazily once the hosts exist, kept alive across
  // collapse/tab changes, disposed idempotently on payload loss or unmount.
  useEffect(() => {
    if (!enabled || !panoramaElement || !mapElement) return;
    let cancelled = false;
    const controller = new AbortController();
    const options: PresentDayDriverOptions = {
      panoramaElement,
      mapElement,
      onState: (next) => {
        if (!cancelled) setState(next);
      },
      onManualTarget: (point) => {
        if (cancelled) return;
        const key = seedKeyRef.current;
        setManual((prev) => ({
          seedKey: key,
          point,
          kind: "manual",
          revision: prev && prev.seedKey === key ? prev.revision + 1 : 1,
        }));
      },
    };
    setState({ status: "loading" });
    loadPresentDayFactory(preview)
      .then(({ factory, synthetic: isFake }) =>
        factory(options, controller.signal).then((created) => ({ created, isFake })),
      )
      .then(({ created, isFake }) => {
        if (cancelled) {
          created.dispose();
          return;
        }
        driverRef.current = created;
        setSynthetic(isFake);
        if (isFake && process.env.NODE_ENV !== "production") exposeFakeDriver(created);
        setDriver(created);
      })
      .catch(() => {
        // Module missing, loader or factory failure — normalized local state.
        // The driver may already have emitted a more precise unavailable
        // reason via onState before rejecting; keep it if so.
        if (cancelled) return;
        setState((prev) =>
          prev.status === "unavailable" ? prev : { status: "unavailable", reason: "configuration" },
        );
      });
    return () => {
      cancelled = true;
      controller.abort();
      const current = driverRef.current;
      driverRef.current = null;
      exposeFakeDriver(null);
      setSynthetic(false);
      current?.dispose();
      setDriver(null);
    };
  }, [enabled, preview, panoramaElement, mapElement, driverAttempt]);

  // Latest-wins reference updates: only on driver/seed/target/city changes —
  // never per frame, per chunk, or per focus transition.
  useEffect(() => {
    const current = driverRef.current;
    if (!driver || !current || !enabled || !visible) return;
    current.setReference(targetRef.current, cityRef.current).catch(() => {
      if (driverRef.current === current) setState({ status: "unavailable", reason: "network" });
    });
  }, [driver, enabled, visible, targetKey, cityLocation]);

  // Visibility/map-expansion are synced props so a late-created driver also
  // receives the current values (collapse, tab switch, widget expand).
  useEffect(() => {
    driver?.setVisible(visible);
  }, [driver, visible]);
  useEffect(() => {
    driver?.setMapExpanded(mapExpanded);
  }, [driver, mapExpanded]);

  const acceptNearby = useCallback(() => driverRef.current?.acceptNearby(), []);
  const returnToReference = useCallback(() => {
    void driverRef.current?.returnToReference().catch(() => undefined);
  }, []);
  const fitReferenceAndCamera = useCallback(() => driverRef.current?.fitReferenceAndCamera(), []);
  const resize = useCallback(() => driverRef.current?.resize(), []);
  const retry = useCallback(() => {
    const current = driverRef.current;
    if (!current) {
      // A loader/factory failure left no driver behind; rebuild it instead of
      // making the retry affordance a no-op.
      setDriverAttempt((attempt) => attempt + 1);
      return;
    }
    current.setReference(targetRef.current, cityRef.current).catch(() => {
      if (driverRef.current === current) setState({ status: "unavailable", reason: "network" });
    });
  }, []);
  const selectCityCenter = useCallback(() => {
    const city = cityRef.current;
    if (!city) return;
    const key = seedKeyRef.current;
    setManual((prev) => ({
      seedKey: key,
      point: city.center,
      kind: "city",
      revision: prev && prev.seedKey === key ? prev.revision + 1 : 1,
    }));
  }, []);

  return {
    state: enabled ? state : { status: "disabled" },
    target,
    synthetic: synthetic || shouldUseFakeDriver(preview),
    acceptNearby,
    returnToReference,
    fitReferenceAndCamera,
    resize,
    retry,
    selectCityCenter,
  };
}
