// Browser integration contract for the Then & Now comparison pane.
// Frozen in THEN_AND_NOW_IMPLEMENTATION_PLAN.md §6.3. No Google SDK imports
// belong here — drivers encapsulate all provider types behind this interface.

import type { CityLocation, GeoPoint } from "../types";

export interface ComparisonTarget {
  key: string;
  point: GeoPoint;
  kind: "camera" | "subject" | "approximate" | "manual" | "city";
  headingDeg?: number;
}

export interface PresentView {
  panoId: string;
  position: GeoPoint;
  headingDeg: number;
  pitchDeg: number;
  imageDate?: string;
  distanceMeters: number;
}

export type ComparisonState =
  | { status: "disabled" | "loading" | "needs-location" }
  | { status: "ready"; view: PresentView }
  | { status: "nearby-offer"; view: PresentView }
  | {
      status: "unavailable";
      reason: "no-coverage" | "timeout" | "configuration" | "network" | "quota";
    };

export interface PresentDayDriver {
  setReference(target: ComparisonTarget | null, city?: CityLocation): Promise<void>;
  acceptNearby(): void;
  returnToReference(): Promise<void>;
  fitReferenceAndCamera(): void;
  setVisible(visible: boolean): void;
  setMapExpanded(expanded: boolean): void;
  resize(): void;
  dispose(): void;
}

export interface PresentDayDriverOptions {
  panoramaElement: HTMLElement;
  mapElement: HTMLElement;
  onState: (state: ComparisonState) => void;
  onManualTarget: (point: GeoPoint) => void;
}

export type PresentDayDriverFactory = (
  options: PresentDayDriverOptions,
  signal: AbortSignal,
) => Promise<PresentDayDriver>;
