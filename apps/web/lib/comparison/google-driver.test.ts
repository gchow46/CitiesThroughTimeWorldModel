// Driver tests stub the Maps objects at the driver boundary — no network,
// no real SDK. See THEN_AND_NOW_IMPLEMENTATION_PLAN.md §8.4/§9.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GeoPoint } from "../types";
import {
  createGooglePresentDayDriver,
  LOOKUP_DEADLINE_MS,
  STREETVIEW_RADII,
} from "./google-driver";
import type { GoogleMapsApi } from "./google-loader";
import type { ComparisonState, ComparisonTarget } from "./types";

const TARGET: GeoPoint = { lat: 52.372592, lng: 4.90046 };

function target(over: Partial<ComparisonTarget> = {}): ComparisonTarget {
  return { key: "seed:one", point: TARGET, kind: "camera", headingDeg: 90, ...over };
}

/** ~30 m north-east of TARGET. */
const NEAR: GeoPoint = { lat: TARGET.lat + 0.0002, lng: TARGET.lng + 0.0003 };
/** ~300 m away — beyond the 150 m ready gate. */
const FAR: GeoPoint = { lat: TARGET.lat + 0.002, lng: TARGET.lng + 0.0025 };

interface RecordedRequest {
  location?: GeoPoint;
  radius?: number;
  pano?: string;
  preference?: string;
  sources?: string[];
}

class FakePano {
  listeners = new Map<string, Set<() => void>>();
  pano = "";
  pov = { heading: 0, pitch: 0 };
  pos = NEAR;
  visible = true;
  opts: unknown;
  constructor(_el: unknown, opts: unknown) {
    this.opts = opts;
    FakePano.instances.push(this);
  }
  static instances: FakePano[] = [];
  addListener(name: string, fn: () => void) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name)!.add(fn);
    return { remove: vi.fn(() => this.listeners.get(name)?.delete(fn)) };
  }
  setPano(id: string) {
    this.pano = id;
  }
  setPov(pov: { heading: number; pitch: number }) {
    this.pov = { ...pov };
  }
  getPano() {
    return this.pano;
  }
  getPov() {
    return { ...this.pov };
  }
  getPosition() {
    return { lat: () => this.pos.lat, lng: () => this.pos.lng };
  }
  setVisible(v: boolean) {
    this.visible = v;
  }
  fire(name: string) {
    for (const fn of this.listeners.get(name) ?? []) fn();
  }
}

interface FakeApi extends GoogleMapsApi {
  requests: RecordedRequest[];
  respond: (req: RecordedRequest) => { status: string; data?: unknown };
  panos: FakePano[];
  mapInstance: {
    opts: Record<string, unknown>;
    setOptions: ReturnType<typeof vi.fn>;
    setCenter: ReturnType<typeof vi.fn>;
    setZoom: ReturnType<typeof vi.fn>;
    fitBounds: ReturnType<typeof vi.fn>;
    clickHandlers: Set<(e: { latLng: { lat(): number; lng(): number } }) => void>;
  };
  markerInstances: { position: GeoPoint; detached: boolean }[];
  events: { target: unknown; name: string }[];
}

function makeApi(respond: (req: RecordedRequest) => { status: string; data?: unknown }): FakeApi {
  const requests: RecordedRequest[] = [];
  const events: { target: unknown; name: string }[] = [];
  const markerInstances: { position: GeoPoint; detached: boolean }[] = [];

  const mapInstance = {
    opts: {} as Record<string, unknown>,
    setOptions: vi.fn(function (this: { opts: Record<string, unknown> }, o: object) {
      Object.assign(this.opts, o);
    }),
    setCenter: vi.fn(),
    setZoom: vi.fn(),
    fitBounds: vi.fn(),
    clickHandlers: new Set<(e: { latLng: { lat(): number; lng(): number } }) => void>(),
    addListener(name: string, fn: (e: { latLng: { lat(): number; lng(): number } }) => void) {
      if (name === "click") mapInstance.clickHandlers.add(fn);
      return { remove: vi.fn(() => mapInstance.clickHandlers.delete(fn)) };
    },
  };

  class FakeMap {
    constructor(_el: unknown, opts: Record<string, unknown>) {
      mapInstance.opts = { ...opts };
    }
    setOptions = (o: object) => mapInstance.setOptions(o);
    setCenter = (c: GeoPoint) => mapInstance.setCenter(c);
    setZoom = (z: number) => mapInstance.setZoom(z);
    fitBounds = (b: unknown) => mapInstance.fitBounds(b);
    addListener = (n: string, fn: (e: { latLng: { lat(): number; lng(): number } }) => void) =>
      mapInstance.addListener(n, fn);
  }

  class FakeAdvancedMarker {
    private _map: unknown;
    position: GeoPoint;
    detached = false;
    constructor(opts: { map: unknown; position: GeoPoint }) {
      this.position = opts.position;
      this._map = opts.map;
      markerInstances.push(this);
    }
    get map() {
      return this._map;
    }
    set map(m: unknown) {
      this._map = m;
      if (m === null) this.detached = true;
    }
  }

  class FakeMarker {
    position: GeoPoint;
    map: unknown;
    detached = false;
    constructor(opts: { map: unknown; position: GeoPoint }) {
      this.position = opts.position;
      this.map = opts.map;
      markerInstances.push(this);
    }
    setPosition(p: GeoPoint) {
      this.position = p;
    }
    setMap(m: unknown) {
      this.map = m;
      if (m === null) this.detached = true;
    }
  }

  class FakeService {
    getPanorama(req: RecordedRequest, cb: (data: unknown, status: string) => void) {
      requests.push(req);
      const res = respond(req);
      // Resolve on a microtask like the real service.
      queueMicrotask(() => cb(res.data ?? null, res.status));
    }
  }

  class FakeBounds {
    points: GeoPoint[] = [];
    extend(p: GeoPoint) {
      this.points.push(p);
    }
  }

  const api = {
    requests,
    respond,
    panos: FakePano.instances,
    mapInstance,
    markerInstances,
    events,
    maps: {
      Map: FakeMap,
    },
    streetView: {
      StreetViewService: FakeService,
      StreetViewPanorama: FakePano,
      StreetViewPreference: { NEAREST: "nearest", BEST: "best" },
      StreetViewSource: { GOOGLE: "google", OUTDOOR: "outdoor", DEFAULT: "default" },
      StreetViewStatus: { OK: "OK", ZERO_RESULTS: "ZERO_RESULTS", UNKNOWN_ERROR: "UNKNOWN_ERROR" },
    },
    marker: { AdvancedMarkerElement: FakeAdvancedMarker, Marker: FakeMarker },
    core: {
      LatLngBounds: FakeBounds,
      event: { trigger: (t: unknown, name: string) => events.push({ target: t, name }) },
    },
    mapId: "test-map-id",
  } as unknown as FakeApi;
  return api;
}

function okAt(point: GeoPoint, pano = "pano-1", imageDate = "2024-05") {
  return {
    status: "OK",
    data: { location: { latLng: point, pano }, imageDate, copyright: "© Google" },
  };
}

function harness(api: FakeApi) {
  const states: ComparisonState[] = [];
  const manual: GeoPoint[] = [];
  const options = {
    panoramaElement: {} as HTMLElement,
    mapElement: {} as HTMLElement,
    onState: (s: ComparisonState) => states.push(s),
    onManualTarget: (p: GeoPoint) => manual.push(p),
  };
  const driver = createGooglePresentDayDriver(api, options);
  return { driver, states, manual, options };
}

async function flush(rounds = 20) {
  for (let i = 0; i < rounds; i++) await Promise.resolve();
}

beforeEach(() => {
  FakePano.instances = [];
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("lookup sequencing", () => {
  it("finds a pano on the first radius and emits ready", async () => {
    const api = makeApi(() => okAt(NEAR));
    const { driver, states } = harness(api);
    await driver.setReference(target());
    await flush();
    expect(api.requests).toHaveLength(1);
    expect(api.requests[0]).toMatchObject({
      location: TARGET,
      radius: 50,
      preference: "nearest",
      sources: ["google", "outdoor"],
    });
    const last = states.at(-1);
    expect(last?.status).toBe("ready");
    if (last?.status === "ready") {
      expect(last.view.panoId).toBe("pano-1");
      expect(last.view.imageDate).toBe("2024-05");
      expect(last.view.headingDeg).toBe(90); // documented camera heading applied
      expect(last.view.distanceMeters).toBeLessThanOrEqual(150);
    }
  });

  it("widens 50→150→500 only after ZERO_RESULTS", async () => {
    const api = makeApi((req) => (req.radius === 500 ? okAt(NEAR) : { status: "ZERO_RESULTS" }));
    const { driver, states } = harness(api);
    await driver.setReference(target());
    await flush();
    expect(api.requests.map((r) => r.radius)).toEqual([...STREETVIEW_RADII]);
    expect(states.at(-1)?.status).toBe("ready");
  });

  it("does not widen on non-ZERO_RESULTS failures", async () => {
    const api = makeApi(() => ({ status: "UNKNOWN_ERROR" }));
    const { driver, states } = harness(api);
    await driver.setReference(target());
    await flush();
    expect(api.requests).toHaveLength(1);
    expect(states.at(-1)).toEqual({ status: "unavailable", reason: "network" });
  });

  it("emits no-coverage when all radii miss", async () => {
    const api = makeApi(() => ({ status: "ZERO_RESULTS" }));
    const { driver, states } = harness(api);
    await driver.setReference(target());
    await flush();
    expect(api.requests).toHaveLength(3);
    expect(states.at(-1)).toEqual({ status: "unavailable", reason: "no-coverage" });
  });

  it("times out the sequence at the 8s deadline", async () => {
    const api = makeApi(() => ({ status: "ZERO_RESULTS" }));
    // Never call the callback.
    api.streetView.StreetViewService = class {
      getPanorama(req: RecordedRequest) {
        api.requests.push(req);
      }
    } as unknown as GoogleMapsApi["streetView"]["StreetViewService"];
    const { driver, states } = harness(api);
    const p = driver.setReference(target());
    await vi.advanceTimersByTimeAsync(LOOKUP_DEADLINE_MS + 1);
    await p;
    await flush();
    expect(states.at(-1)).toEqual({ status: "unavailable", reason: "timeout" });
  });
});

describe("distance gates", () => {
  it("offers a >150 m pano instead of displaying it", async () => {
    const api = makeApi(() => okAt(FAR));
    const { driver, states } = harness(api);
    await driver.setReference(target());
    await flush();
    const last = states.at(-1);
    expect(last?.status).toBe("nearby-offer");
    if (last?.status === "nearby-offer") expect(last.view.distanceMeters).toBeGreaterThan(150);
    // The panorama is not displayed until accepted.
    expect(FakePano.instances).toHaveLength(0);
  });

  it("acceptNearby displays the offer bound to the current target", async () => {
    const api = makeApi(() => okAt(FAR));
    const { driver, states } = harness(api);
    await driver.setReference(target());
    await flush();
    driver.acceptNearby();
    await flush();
    expect(states.at(-1)?.status).toBe("ready");
    expect(FakePano.instances[0]?.pano).toBe("pano-1");
  });

  it("acceptNearby cannot apply an offer to a different target key", async () => {
    // First target gets a distant offer; every later lookup misses.
    let first = true;
    const api = makeApi(() => {
      if (first) {
        first = false;
        return okAt(FAR);
      }
      return { status: "ZERO_RESULTS" };
    });
    const { driver, states } = harness(api);
    await driver.setReference(target({ key: "seed:one" }));
    await flush();
    expect(states.at(-1)?.status).toBe("nearby-offer");
    // Re-seed: the new target's lookup misses; the old offer must not apply.
    await driver.setReference(target({ key: "seed:two" }));
    await flush();
    driver.acceptNearby();
    await flush();
    expect(states.at(-1)).toEqual({ status: "unavailable", reason: "no-coverage" });
    expect(FakePano.instances).toHaveLength(0);
  });

  it("returnToReference cannot restore the previous seed while an offer is pending", async () => {
    let calls = 0;
    const api = makeApi(() => (calls++ === 0 ? okAt(NEAR, "pano-a") : okAt(FAR, "pano-b")));
    const { driver, states } = harness(api);
    await driver.setReference(target({ key: "seed:one" }));
    await flush();
    await driver.setReference(target({ key: "seed:two" }));
    await flush();
    expect(states.at(-1)?.status).toBe("nearby-offer");
    await driver.returnToReference();
    await flush();
    expect(states.at(-1)?.status).toBe("nearby-offer");
  });
});

describe("reference lifecycle", () => {
  it("null reference with city emits needs-location and makes no lookups", async () => {
    const api = makeApi(() => okAt(NEAR));
    const { driver, states } = harness(api);
    await driver.setReference(null, {
      center: { lat: 52.3676, lng: 4.9041 },
      bounds: { south: 52.27, west: 4.72, north: 52.43, east: 5.08 },
      source: "nominatim",
    });
    await flush();
    expect(api.requests).toHaveLength(0);
    expect(api.mapInstance.setCenter).toHaveBeenCalledWith({ lat: 52.3676, lng: 4.9041 });
    expect(states.at(-1)).toEqual({ status: "needs-location" });
    expect(FakePano.instances).toHaveLength(0);
  });

  it("a late result from a superseded setReference cannot update state", async () => {
    let firstCb: ((d: unknown, s: string) => void) | undefined;
    const api = makeApi((req) => {
      void req;
      return { status: "PENDING" };
    });
    api.streetView.StreetViewService = class {
      calls = 0;
      getPanorama(req: RecordedRequest, cb: (d: unknown, s: string) => void) {
        api.requests.push(req);
        this.calls++;
        if (this.calls === 1) firstCb = cb;
        else queueMicrotask(() => cb(okAt(NEAR, "pano-2").data, "OK"));
      }
    } as unknown as GoogleMapsApi["streetView"]["StreetViewService"];

    const { driver, states } = harness(api);
    const p1 = driver.setReference(target({ key: "seed:one" }));
    await driver.setReference(target({ key: "seed:two" }));
    // The first lookup resolves late — its result must be dropped.
    firstCb?.(okAt(NEAR, "pano-1").data, "OK");
    await p1;
    await flush();
    const readyViews = states.filter((s) => s.status === "ready");
    expect(readyViews).toHaveLength(1);
    if (readyViews[0]?.status === "ready") {
      expect(readyViews[0].view.panoId).toBe("pano-2");
    }
  });

  it("returnToReference restores the accepted pano and re-resolves a stale ID", async () => {
    const api = makeApi((req) => {
      if (req.pano === "stale-pano") return { status: "ZERO_RESULTS" };
      if (req.location) return okAt(NEAR, "fresh-pano");
      return okAt(NEAR);
    });
    const { driver, states } = harness(api);
    await driver.setReference(target());
    await flush();
    // Force the accepted record to hold a now-stale pano ID.
    const acc = driver as unknown as { accepted?: { view: { panoId: string } } };
    if (acc.accepted) acc.accepted.view.panoId = "stale-pano";
    await driver.returnToReference();
    await flush();
    const last = states.at(-1);
    expect(last?.status).toBe("ready");
    if (last?.status === "ready") expect(last.view.panoId).toBe("fresh-pano");
  });

  it("returnToReference restores initial POV for a healthy pano", async () => {
    const api = makeApi((req) => (req.pano ? okAt(NEAR, req.pano) : okAt(NEAR, "pano-1")));
    const { driver } = harness(api);
    await driver.setReference(target());
    await flush();
    const pano = FakePano.instances[0];
    pano.setPov({ heading: 200, pitch: 5 });
    await driver.returnToReference();
    await flush();
    expect(pano.pov).toEqual({ heading: 90, pitch: 0 });
  });
});

describe("map interactions and markers", () => {
  it("creates one north-up map with interactions off by default", () => {
    const api = makeApi(() => okAt(NEAR));
    harness(api);
    expect(api.mapInstance.opts).toMatchObject({
      heading: 0,
      tilt: 0,
      gestureHandling: "none",
      streetViewControl: false,
      disableDefaultUI: true,
    });
  });

  it("emits manual targets only from expanded-map clicks", async () => {
    const api = makeApi(() => okAt(NEAR));
    const { driver, manual } = harness(api);
    driver.setMapExpanded(false);
    api.mapInstance.clickHandlers.forEach((fn) =>
      fn({ latLng: { lat: () => 52.4, lng: () => 4.9 } }),
    );
    expect(manual).toHaveLength(0);

    driver.setMapExpanded(true);
    api.mapInstance.clickHandlers.forEach((fn) =>
      fn({ latLng: { lat: () => 52.4, lng: () => 4.9 } }),
    );
    expect(manual).toEqual([{ lat: 52.4, lng: 4.9 }]);

    driver.setMapExpanded(false);
    api.mapInstance.clickHandlers.forEach((fn) =>
      fn({ latLng: { lat: () => 52.5, lng: () => 5.0 } }),
    );
    expect(manual).toHaveLength(1);
    expect(api.mapInstance.setOptions).toHaveBeenCalledWith(
      expect.objectContaining({ gestureHandling: "auto" }),
    );
    expect(api.mapInstance.setOptions).toHaveBeenCalledWith(
      expect.objectContaining({ gestureHandling: "none" }),
    );
  });

  it("programmatic marker moves never emit manual targets", async () => {
    const api = makeApi(() => okAt(NEAR));
    const { driver, manual } = harness(api);
    await driver.setReference(target());
    await flush();
    driver.setMapExpanded(true);
    for (const m of api.markerInstances) {
      (m as { setPosition?: (p: GeoPoint) => void }).setPosition?.({ lat: 0, lng: 0 });
      m.position = { lat: 1, lng: 1 };
    }
    expect(manual).toHaveLength(0);
  });

  it("fitReferenceAndCamera uses bounds over reference and camera", async () => {
    const api = makeApi(() => okAt(NEAR));
    const { driver } = harness(api);
    await driver.setReference(target());
    await flush();
    driver.fitReferenceAndCamera();
    expect(api.mapInstance.fitBounds).toHaveBeenCalledOnce();
  });
});

describe("pano events, visibility, resize and disposal", () => {
  it("pano_changed clears the date then resolves new metadata", async () => {
    const api = makeApi((req) =>
      req.pano === "pano-2" ? okAt(FAR, "pano-2", "2023-08") : okAt(NEAR, "pano-1"),
    );
    const { driver, states } = harness(api);
    await driver.setReference(target());
    await flush();
    const pano = FakePano.instances[0];
    pano.setPano("pano-2");
    pano.fire("pano_changed");
    await flush();
    const ready = states.filter((s) => s.status === "ready");
    // First emission after the change must carry no stale date.
    const cleared = ready.find(
      (s) => s.status === "ready" && s.view.panoId === "pano-2" && s.view.imageDate === undefined,
    );
    expect(cleared).toBeDefined();
    const last = states.at(-1);
    if (last?.status === "ready") expect(last.view.imageDate).toBe("2023-08");
  });

  it("a re-seed reuses the existing panorama — no duplicate viewers", async () => {
    const api = makeApi(() => okAt(NEAR));
    const { driver } = harness(api);
    await driver.setReference(target({ key: "seed:one" }));
    await flush();
    expect(FakePano.instances).toHaveLength(1);
    await driver.setReference(target({ key: "seed:two" }));
    await flush();
    expect(FakePano.instances).toHaveLength(1);
    expect(FakePano.instances[0].pano).toBe("pano-1");
  });

  it("pov_changed updates heading without recreating objects", async () => {
    const api = makeApi(() => okAt(NEAR));
    const { driver, states } = harness(api);
    await driver.setReference(target());
    await flush();
    const pano = FakePano.instances[0];
    const countBefore = FakePano.instances.length;
    pano.setPov({ heading: 45, pitch: 3 });
    pano.fire("pov_changed");
    await vi.advanceTimersByTimeAsync(150);
    await flush();
    expect(FakePano.instances).toHaveLength(countBefore);
    const last = states.at(-1);
    if (last?.status === "ready") {
      expect(last.view.headingDeg).toBe(45);
      expect(last.view.pitchDeg).toBe(3);
    }
  });

  it("setVisible hides content without recreating objects; resize preserves POV", async () => {
    const api = makeApi(() => okAt(NEAR));
    const { driver } = harness(api);
    await driver.setReference(target());
    await flush();
    const pano = FakePano.instances[0];
    driver.setVisible(false);
    expect(pano.visible).toBe(false);
    driver.setVisible(true);
    expect(pano.visible).toBe(true);
    pano.setPov({ heading: 33, pitch: 1 });
    driver.resize();
    expect(pano.pov).toEqual({ heading: 33, pitch: 1 });
    expect(api.events.some((e) => e.name === "resize")).toBe(true);
  });

  it("dispose is idempotent, detaches markers and stops callbacks", async () => {
    const api = makeApi(() => okAt(NEAR));
    const { driver, states } = harness(api);
    await driver.setReference(target());
    await flush();
    const pano = FakePano.instances[0];
    const listenerCount = [...pano.listeners.values()].reduce((n, s) => n + s.size, 0);
    expect(listenerCount).toBe(3);

    driver.dispose();
    driver.dispose();
    const countAfter = states.length;
    expect(pano.visible).toBe(false);
    expect(api.markerInstances.every((m) => m.detached)).toBe(true);
    expect([...pano.listeners.values()].every((s) => s.size === 0)).toBe(true);

    // Late events and calls after dispose emit nothing.
    pano.fire("pov_changed");
    await driver.setReference(target({ key: "seed:three" }));
    await flush();
    expect(states.length).toBe(countAfter);
  });
});
