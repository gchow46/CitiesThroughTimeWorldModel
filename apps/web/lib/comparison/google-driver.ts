// Google-backed PresentDayDriver for the Then & Now comparison pane.
//
// Owns every Google object: one StreetViewService, at most one
// StreetViewPanorama and one Map, the reference/camera markers, and all
// listeners. The UI owns the DOM hosts and all copy. All failures surface as
// normalized ComparisonState reasons — never raw provider messages.
//
// See THEN_AND_NOW_IMPLEMENTATION_PLAN.md §5.3 (lookup policy) and §6.3
// (driver contract).

import type { CityLocation, GeoPoint } from "../types";
import { bearingDeg, distanceMeters, normalizeHeadingDeg } from "../location";
import {
  GoogleMapsLoadError,
  loadGoogleMapsApi,
  type GoogleMapsApi,
  type GoogleLoadReason,
} from "./google-loader";
import type {
  ComparisonState,
  ComparisonTarget,
  PresentDayDriver,
  PresentDayDriverFactory,
  PresentDayDriverOptions,
  PresentView,
} from "./types";

/** Tunable lookup policy (§5.3): 50 m → 150 m → 500 m, only after ZERO_RESULTS. */
export const STREETVIEW_RADII = [50, 150, 500] as const;
/** Results farther than this are a "nearby-offer", never auto-displayed. */
export const NEARBY_OFFER_MIN_M = 150;
/** Overall deadline for one target's lookup sequence. */
export const LOOKUP_DEADLINE_MS = 8000;
/** POV-derived notifications are throttled to at most this many per second. */
const POV_NOTIFY_PER_SEC = 10;

type UnavailableReason = Extract<ComparisonState, { status: "unavailable" }>["reason"];

/** Internal normalized failure — message is ours, never the provider's. */
class DriverError extends Error {
  readonly reason: UnavailableReason;
  constructor(reason: UnavailableReason, detail: string) {
    super(detail);
    this.name = "DriverError";
    this.reason = reason;
  }
}

interface ResolvedPano {
  panoId: string;
  position: GeoPoint;
  imageDate?: string;
}

interface PanoResponse {
  status: string;
  data?: google.maps.StreetViewPanoramaData | null;
}

/** Minimal marker surface — hides AdvancedMarker vs Marker differences. */
interface MarkerHandle {
  setPosition(p: GeoPoint): void;
  setTitle(title: string): void;
  detach(): void;
}

function toGeoPoint(
  ll: google.maps.LatLng | google.maps.LatLngLiteral | null | undefined,
): GeoPoint | undefined {
  if (!ll) return undefined;
  if (typeof (ll as google.maps.LatLng).lat === "function") {
    const l = ll as google.maps.LatLng;
    const p = { lat: l.lat(), lng: l.lng() };
    return Number.isFinite(p.lat) && Number.isFinite(p.lng) ? p : undefined;
  }
  const p = ll as google.maps.LatLngLiteral;
  return Number.isFinite(p.lat) && Number.isFinite(p.lng) ? { lat: p.lat, lng: p.lng } : undefined;
}

function panoFromData(
  data: google.maps.StreetViewPanoramaData | null | undefined,
): ResolvedPano | undefined {
  const loc = data?.location;
  const position = toGeoPoint(loc?.latLng);
  const panoId = loc?.pano;
  if (!position || typeof panoId !== "string" || !panoId) return undefined;
  const imageDate = typeof data?.imageDate === "string" ? data.imageDate : undefined;
  return { panoId, position, imageDate };
}

/** Extracted so tests can drive the driver with stubbed google objects. */
export function createGooglePresentDayDriver(
  api: GoogleMapsApi,
  options: PresentDayDriverOptions,
): PresentDayDriver {
  return new GooglePresentDayDriver(api, options);
}

class GooglePresentDayDriver implements PresentDayDriver {
  private readonly api: GoogleMapsApi;
  private readonly options: PresentDayDriverOptions;
  private readonly service: google.maps.StreetViewService;
  private map?: google.maps.Map;
  private panorama?: google.maps.StreetViewPanorama;

  private listeners: google.maps.MapsEventListener[] = [];
  private mapClickListener?: google.maps.MapsEventListener;
  private refMarker?: MarkerHandle;
  private camMarker?: MarkerHandle;
  private camHeadingEl?: HTMLElement;

  private generation = 0;
  private disposed = false;
  private visible = true;
  private expanded = false;
  private applyingView = false;

  private currentTarget?: ComparisonTarget;
  private city?: CityLocation;
  private currentView?: PresentView;
  private offer?: { target: ComparisonTarget; view: PresentView };
  /** Last accepted target plus its initial view — drives returnToReference. */
  private accepted?: { target: ComparisonTarget; view: PresentView };

  // Throttled view emission state.
  private pendingView?: PresentView;
  private emitTimer?: ReturnType<typeof setTimeout>;
  private lastEmitAt = 0;

  constructor(api: GoogleMapsApi, options: PresentDayDriverOptions) {
    this.api = api;
    this.options = options;
    this.service = new api.streetView.StreetViewService();
    // One stable Map in the UI-provided host; north-up, interactions off in
    // the small widget, and streetViewControl off so no implicit default
    // panorama is constructed.
    this.map = new api.maps.Map(options.mapElement, {
      center: { lat: 0, lng: 0 },
      zoom: 2,
      heading: 0,
      tilt: 0,
      ...(api.mapId ? { mapId: api.mapId } : {}),
      disableDefaultUI: true,
      gestureHandling: "none",
      clickableIcons: false,
      keyboardShortcuts: false,
      streetViewControl: false,
      fullscreenControl: false,
      zoomControl: false,
      mapTypeControl: false,
    });
  }

  // ---------- PresentDayDriver ----------

  async setReference(target: ComparisonTarget | null, city?: CityLocation): Promise<void> {
    if (this.disposed) return;
    const gen = ++this.generation;
    this.offer = undefined;
    if (city) this.city = city;

    if (target === null) {
      // Map-only init: center on city context, no panorama, no pins.
      this.currentTarget = undefined;
      this.accepted = undefined;
      this.currentView = undefined;
      this.panorama?.setVisible(false);
      this.refMarker?.detach();
      this.refMarker = undefined;
      this.camMarker?.detach();
      this.camMarker = undefined;
      if (this.map && this.city) {
        this.map.setCenter(this.city.center);
        this.map.setZoom(13);
      }
      this.emit({ status: "needs-location" });
      return;
    }

    this.currentTarget = target;
    this.accepted = undefined;
    this.currentView = undefined;
    this.panorama?.setVisible(false);
    this.camMarker?.detach();
    this.camMarker = undefined;
    this.camHeadingEl = undefined;
    this.placeReferenceMarker(target.point);
    this.emit({ status: "loading" });

    try {
      const resolved = await this.lookupWithDeadline(target.point);
      if (!this.isCurrent(gen)) return;
      if (!resolved) {
        this.emit({ status: "unavailable", reason: "no-coverage" });
        return;
      }
      const view = this.viewFor(target, resolved);
      if (view.distanceMeters <= NEARBY_OFFER_MIN_M) {
        this.displayView(target, view);
      } else {
        // A distant candidate is an offer, not an accepted comparison.
        this.offer = { target, view };
        this.emit({ status: "nearby-offer", view });
      }
    } catch (e) {
      if (!this.isCurrent(gen)) return;
      this.emit({ status: "unavailable", reason: this.reasonFor(e) });
    }
  }

  acceptNearby(): void {
    if (this.disposed || !this.offer) return;
    // The offer is bound to its target key — never apply a stale one.
    if (!this.currentTarget || this.offer.target.key !== this.currentTarget.key) {
      this.offer = undefined;
      return;
    }
    const { target, view } = this.offer;
    this.offer = undefined;
    this.displayView(target, view);
  }

  async returnToReference(): Promise<void> {
    const gen = ++this.generation;
    const acc = this.accepted;
    if (this.disposed || !acc || acc.target.key !== this.currentTarget?.key) return;
    this.offer = undefined;
    this.emit({ status: "loading" });
    try {
      // Re-resolve the recorded pano ID: IDs are session handles, not durable
      // identifiers — a stale ID falls back to a fresh location lookup.
      const res = await this.withDeadline(this.requestPanorama({ pano: acc.view.panoId }));
      if (!this.isCurrent(gen)) return;
      const resolved = panoFromData(res.data);
      if (res.status === this.api.streetView.StreetViewStatus.OK && resolved) {
        const view = { ...this.viewFor(acc.target, resolved) };
        this.applyViewToPanorama(view, acc.target);
        this.accepted = { target: acc.target, view };
        this.emit({ status: "ready", view });
        return;
      }
      if (res.status !== this.api.streetView.StreetViewStatus.ZERO_RESULTS) {
        throw new DriverError("network", "panorama metadata request failed");
      }
      // Stale pano — resolve the anchor again by location.
      const fresh = await this.lookupWithDeadline(acc.target.point);
      if (!this.isCurrent(gen)) return;
      if (!fresh) {
        this.emit({ status: "unavailable", reason: "no-coverage" });
        return;
      }
      const view = this.viewFor(acc.target, fresh);
      this.applyViewToPanorama(view, acc.target);
      this.accepted = { target: acc.target, view };
      this.emit({ status: "ready", view });
    } catch (e) {
      if (!this.isCurrent(gen)) return;
      this.emit({ status: "unavailable", reason: this.reasonFor(e) });
    }
  }

  fitReferenceAndCamera(): void {
    if (this.disposed || !this.map || !this.currentTarget) return;
    const ref = this.currentTarget.point;
    const cam = this.currentView?.position;
    if (!cam) {
      this.map.setCenter(ref);
      this.map.setZoom(16);
      return;
    }
    const bounds = new this.api.core.LatLngBounds();
    bounds.extend(ref);
    bounds.extend(cam);
    this.map.fitBounds(bounds);
  }

  setVisible(visible: boolean): void {
    if (this.disposed) return;
    this.visible = visible;
    // Hides the content; objects are kept alive for cheap show/hide cycles.
    this.panorama?.setVisible(visible);
    if (visible) this.resize();
  }

  setMapExpanded(expanded: boolean): void {
    if (this.disposed || !this.map || this.expanded === expanded) return;
    this.expanded = expanded;
    this.map.setOptions({
      gestureHandling: expanded ? "auto" : "none",
      keyboardShortcuts: expanded,
      zoomControl: expanded,
    });
    if (expanded && !this.mapClickListener) {
      // Only the expanded map permits manual point selection.
      this.mapClickListener = this.map.addListener("click", (e: google.maps.MapMouseEvent) => {
        if (this.disposed || !this.expanded) return;
        const p = toGeoPoint(e.latLng);
        if (p) this.options.onManualTarget(p);
      });
    } else if (!expanded && this.mapClickListener) {
      this.mapClickListener.remove();
      this.mapClickListener = undefined;
    }
  }

  resize(): void {
    if (this.disposed) return;
    // Preserve POV across the resize; trigger the SDK's resize notification.
    const pov = this.panorama?.getPov?.();
    if (this.map) this.api.core.event.trigger(this.map, "resize");
    if (this.panorama) {
      this.api.core.event.trigger(this.panorama, "resize");
      if (pov) this.panorama.setPov(pov);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.generation++;
    if (this.emitTimer) {
      clearTimeout(this.emitTimer);
      this.emitTimer = undefined;
    }
    for (const l of this.listeners) l.remove();
    this.listeners = [];
    this.mapClickListener?.remove();
    this.mapClickListener = undefined;
    this.refMarker?.detach();
    this.refMarker = undefined;
    this.camMarker?.detach();
    this.camMarker = undefined;
    this.panorama?.setVisible(false);
    this.panorama = undefined;
    this.map = undefined;
    this.accepted = undefined;
    this.offer = undefined;
    this.currentView = undefined;
    this.currentTarget = undefined;
  }

  // ---------- lookup ----------

  private isCurrent(gen: number): boolean {
    return !this.disposed && gen === this.generation;
  }

  private requestPanorama(
    req: google.maps.StreetViewLocationRequest | google.maps.StreetViewPanoRequest,
  ): Promise<PanoResponse> {
    return new Promise((resolve) => {
      this.service.getPanorama(req as google.maps.StreetViewLocationRequest, (data, status) =>
        resolve({ status: String(status), data }),
      );
    });
  }

  /**
   * 50 m → 150 m → 500 m, expanding only after ZERO_RESULTS. Any other status
   * is a normalized failure and never triggers more calls.
   */
  private async resolveByLocation(point: GeoPoint): Promise<ResolvedPano | null> {
    const SV = this.api.streetView;
    for (const radius of STREETVIEW_RADII) {
      const { status, data } = await this.requestPanorama({
        location: point,
        radius,
        preference: SV.StreetViewPreference.NEAREST,
        sources: [SV.StreetViewSource.GOOGLE, SV.StreetViewSource.OUTDOOR],
      });
      if (status === SV.StreetViewStatus.OK) {
        return panoFromData(data) ?? null;
      }
      if (status === SV.StreetViewStatus.ZERO_RESULTS) continue;
      throw new DriverError(this.statusReason(status), `street view lookup status ${status}`);
    }
    return null;
  }

  private async lookupWithDeadline(point: GeoPoint): Promise<ResolvedPano | null> {
    return this.withDeadline(this.resolveByLocation(point));
  }

  /** Overall deadline for lookups that are allowed to emit loading/unavailable. */
  private async withDeadline<T>(work: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        work,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new DriverError("timeout", "street view request deadline")),
            LOOKUP_DEADLINE_MS,
          );
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private statusReason(status: string): UnavailableReason {
    const SV = this.api.streetView;
    const s = status.toUpperCase();
    if (s === "REQUEST_DENIED" || s === "INVALID_REQUEST") return "configuration";
    if (s === "OVER_QUERY_LIMIT" || s === "OVER_DAILY_LIMIT") return "quota";
    if (status === SV.StreetViewStatus.UNKNOWN_ERROR) return "network";
    return "network";
  }

  private reasonFor(e: unknown): UnavailableReason {
    if (e instanceof DriverError) return e.reason;
    if (e instanceof GoogleMapsLoadError) return e.reason;
    // Never echo provider text; classify only.
    const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
    if (/quota|billing|over_query_limit/.test(msg)) return "quota";
    if (/key|referer|auth|denied/.test(msg)) return "configuration";
    return "network";
  }

  // ---------- view/panorama ----------

  /** Initial heading: documented camera heading, else subject bearing, else 0. */
  private initialHeading(target: ComparisonTarget, pano: ResolvedPano): number {
    const documented = normalizeHeadingDeg(target.headingDeg);
    if (documented !== undefined) return documented;
    if (target.kind === "subject") {
      // Orientation aid only — the UI labels it as approximate.
      return bearingDeg(pano.position, target.point);
    }
    return 0;
  }

  private viewFor(target: ComparisonTarget, pano: ResolvedPano): PresentView {
    return {
      panoId: pano.panoId,
      position: pano.position,
      headingDeg: this.initialHeading(target, pano),
      pitchDeg: 0,
      imageDate: pano.imageDate,
      distanceMeters: Math.round(distanceMeters(target.point, pano.position)),
    };
  }

  private ensurePanorama(): google.maps.StreetViewPanorama {
    if (!this.panorama) {
      this.panorama = new this.api.streetView.StreetViewPanorama(this.options.panoramaElement, {
        visible: this.visible,
        imageDateControl: true,
        enableCloseButton: false,
        fullscreenControl: false,
        // No device-motion tracking in this release (reduced motion).
        motionTracking: false,
        motionTrackingControl: false,
      });
      this.listeners.push(
        this.panorama.addListener("pano_changed", () => this.onPanoChanged()),
        this.panorama.addListener("position_changed", () => this.onPositionChanged()),
        this.panorama.addListener("pov_changed", () => this.onPovChanged()),
      );
    }
    return this.panorama;
  }

  private applyViewToPanorama(view: PresentView, target: ComparisonTarget): void {
    const pano = this.ensurePanorama();
    this.applyingView = true;
    try {
      pano.setPano(view.panoId);
      pano.setPov({ heading: view.headingDeg, pitch: view.pitchDeg });
      pano.setVisible(this.visible);
    } finally {
      this.applyingView = false;
    }
    this.currentView = view;
    this.updateCameraMarker(view);
    this.currentTarget = target;
  }

  private displayView(target: ComparisonTarget, view: PresentView): void {
    if (this.disposed) return;
    this.applyViewToPanorama(view, target);
    this.accepted = { target, view };
    this.emit({ status: "ready", view });
  }

  // ---------- panorama events ----------

  private onPanoChanged(): void {
    if (this.disposed || this.applyingView || !this.panorama) return;
    const panoId = this.panorama.getPano();
    if (!panoId || !this.currentView || this.currentView.panoId === panoId) return;
    // Clear the previous photo's date immediately — never show stale dates.
    this.currentView = { ...this.currentView, panoId, imageDate: undefined };
    this.emitView();

    const gen = this.generation;
    void this.requestPanorama({ pano: panoId })
      .then((res) => {
        if (this.disposed || gen !== this.generation) return;
        const resolved = panoFromData(res.data);
        if (resolved && this.currentView?.panoId === panoId) {
          this.currentView = {
            ...this.currentView,
            position: resolved.position,
            imageDate: resolved.imageDate,
            distanceMeters: this.distanceToReference(resolved.position),
          };
          this.updateCameraMarker(resolved.position);
        }
        this.emitView();
      })
      .catch(() => {
        /* keep the cleared-date view */
      });
  }

  private onPositionChanged(): void {
    if (this.disposed || this.applyingView || !this.panorama || !this.currentView) return;
    const point = toGeoPoint(this.panorama.getPosition());
    if (!point) return;
    this.currentView = {
      ...this.currentView,
      position: point,
      distanceMeters: this.distanceToReference(point),
    };
    this.updateCameraMarker(point);
    this.emitView();
  }

  private onPovChanged(): void {
    if (this.disposed || this.applyingView || !this.panorama || !this.currentView) return;
    const pov = this.panorama.getPov();
    const heading = normalizeHeadingDeg(pov?.heading) ?? 0;
    const pitch = typeof pov?.pitch === "number" && Number.isFinite(pov.pitch) ? pov.pitch : 0;
    this.currentView = { ...this.currentView, headingDeg: heading, pitchDeg: pitch };
    if (this.camHeadingEl) {
      this.camHeadingEl.style.transform = `rotate(${heading}deg)`;
    }
    this.emitViewThrottled();
  }

  private distanceToReference(point: GeoPoint): number {
    const target = this.currentTarget;
    return target ? Math.round(distanceMeters(target.point, point)) : 0;
  }

  // ---------- markers ----------

  private makeMarker(
    position: GeoPoint,
    title: string,
    content?: HTMLElement,
  ): MarkerHandle | undefined {
    if (!this.map) return undefined;
    const AdvancedMarker = this.api.marker?.AdvancedMarkerElement;
    if (this.api.mapId && AdvancedMarker) {
      const m = new AdvancedMarker({
        map: this.map,
        position,
        title,
        ...(content ? { content } : {}),
      });
      return {
        setPosition: (p) => {
          m.position = p;
        },
        setTitle: (title) => {
          m.title = title;
        },
        detach: () => {
          m.map = null;
        },
      };
    }
    const MarkerCtor = this.api.marker?.Marker;
    if (!MarkerCtor) return undefined;
    const m = new MarkerCtor({ map: this.map, position, title });
    return {
      setPosition: (p) => m.setPosition(p),
      setTitle: (title) => m.setTitle(title),
      detach: () => m.setMap(null),
    };
  }

  private markerDot(color: string): HTMLElement | undefined {
    if (typeof document === "undefined") return undefined;
    const el = document.createElement("div");
    el.style.width = "16px";
    el.style.height = "16px";
    el.style.borderRadius = "50%";
    el.style.border = "2px solid #fff";
    el.style.background = color;
    return el;
  }

  private placeReferenceMarker(point: GeoPoint): void {
    if (this.disposed || !this.map) return;
    const kind = this.currentTarget?.kind;
    const title =
      kind === "camera"
        ? "Documented photo location"
        : kind === "subject"
          ? "Photographed subject (camera location unknown)"
          : kind === "manual"
            ? "User-selected reference"
            : "Approximate photo area";
    if (!this.refMarker) {
      this.refMarker = this.makeMarker(point, title, this.markerDot("#c8a24a")); // gold
    } else {
      this.refMarker.setPosition(point);
      this.refMarker.setTitle(title);
    }
  }

  private updateCameraMarker(position: GeoPoint): void;
  private updateCameraMarker(view: PresentView): void;
  private updateCameraMarker(arg: GeoPoint | PresentView): void {
    if (this.disposed || !this.map) return;
    const position = "panoId" in arg ? arg.position : arg;
    const heading = "panoId" in arg ? arg.headingDeg : (this.currentView?.headingDeg ?? 0);
    if (!this.camMarker) {
      let content: HTMLElement | undefined;
      if (typeof document !== "undefined") {
        content = document.createElement("div");
        content.style.position = "relative";
        const dot = this.markerDot("#4a7ac8"); // blue Street View camera
        if (dot) content.appendChild(dot);
        const indicator = document.createElement("div");
        indicator.style.position = "absolute";
        indicator.style.left = "6px";
        indicator.style.top = "-9px";
        indicator.style.width = "0";
        indicator.style.height = "0";
        indicator.style.borderLeft = "2px solid transparent";
        indicator.style.borderRight = "2px solid transparent";
        indicator.style.borderBottom = "8px solid #4a7ac8";
        indicator.style.transformOrigin = "2px 17px";
        this.camHeadingEl = indicator;
        content.appendChild(indicator);
      }
      this.camMarker = this.makeMarker(position, "Street View camera", content);
    } else {
      this.camMarker.setPosition(position);
    }
    if (this.camHeadingEl) this.camHeadingEl.style.transform = `rotate(${heading}deg)`;
  }

  // ---------- emission ----------

  private emit(state: ComparisonState): void {
    if (this.disposed) return;
    this.options.onState(state);
  }

  /** Immediate emit of the current ready view. */
  private emitView(): void {
    if (this.disposed || !this.currentView) return;
    if (this.emitTimer) {
      clearTimeout(this.emitTimer);
      this.emitTimer = undefined;
    }
    this.pendingView = undefined;
    this.lastEmitAt = Date.now();
    this.emit({ status: "ready", view: this.currentView });
  }

  /** POV-derived notifications: at most 10/s, preserving the final value. */
  private emitViewThrottled(): void {
    if (this.disposed || !this.currentView) return;
    const minInterval = 1000 / POV_NOTIFY_PER_SEC;
    const elapsed = Date.now() - this.lastEmitAt;
    if (elapsed >= minInterval) {
      this.emitView();
      return;
    }
    this.pendingView = this.currentView;
    if (this.emitTimer) return;
    this.emitTimer = setTimeout(() => {
      this.emitTimer = undefined;
      if (this.disposed || !this.pendingView) return;
      const v = this.pendingView;
      this.pendingView = undefined;
      this.lastEmitAt = Date.now();
      this.emit({ status: "ready", view: v });
    }, minInterval - elapsed);
  }
}

/**
 * Factory: loads the Maps API (singleton), then constructs the driver.
 * Factory failure emits a normalized unavailable state AND rejects with a
 * normalized error — raw provider messages never reach the UI.
 */
export const googlePresentDayDriverFactory: PresentDayDriverFactory = async (options, signal) => {
  if (signal.aborted) {
    throw new GoogleMapsLoadError("configuration", "aborted before load");
  }
  try {
    const api = await loadGoogleMapsApi();
    if (signal.aborted) throw new GoogleMapsLoadError("configuration", "aborted during load");
    const driver = new GooglePresentDayDriver(api, options);
    signal.addEventListener("abort", () => driver.dispose(), { once: true });
    return driver;
  } catch (e) {
    const reason: GoogleLoadReason = e instanceof GoogleMapsLoadError ? e.reason : "network";
    try {
      options.onState({ status: "unavailable", reason });
    } catch {
      /* onState must not mask the factory failure */
    }
    throw new GoogleMapsLoadError(reason, "present-day comparison unavailable");
  }
};
