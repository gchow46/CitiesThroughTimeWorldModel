import { describe, expect, it } from "vitest";
import { createFakePresentDayDriver } from "./fake-driver";
import type { FakeDriverConfig } from "./fake-driver";
import type { ComparisonState, ComparisonTarget } from "./types";
import type { CityLocation, GeoPoint } from "../types";

const el = {} as HTMLElement;
const point: GeoPoint = { lat: 52.37, lng: 4.89 };
const city: CityLocation = {
  center: point,
  bounds: { south: 52.3, west: 4.8, north: 52.4, east: 5.0 },
  source: "nominatim",
};

const target = (key: string, kind: ComparisonTarget["kind"] = "camera"): ComparisonTarget => ({
  key,
  point,
  kind,
  headingDeg: 90,
});

function setup(config: FakeDriverConfig = {}) {
  const states: ComparisonState[] = [];
  const manual: GeoPoint[] = [];
  const controller = new AbortController();
  const driver = createFakePresentDayDriver(config)(
    {
      panoramaElement: el,
      mapElement: el,
      onState: (s) => states.push(s),
      onManualTarget: (p) => manual.push(p),
    },
    controller.signal,
  );
  return { states, manual, controller, driver };
}

const last = (states: ComparisonState[]) => states[states.length - 1];

describe("fake present-day driver", () => {
  it("emits ready with a deterministic near view for a camera target", async () => {
    const { states, driver } = await setup();
    await (await driver).setReference(target("seed-a"), city);
    const s = last(states);
    expect(s.status).toBe("ready");
    if (s.status !== "ready") return;
    expect(s.view.panoId).toContain("seed-a");
    expect(s.view.headingDeg).toBe(90);
    expect(s.view.distanceMeters).toBeLessThan(50);
  });

  it("emits needs-location for a null reference and ready for a deliberate city target", async () => {
    const { states, driver } = await setup();
    const d = await driver;
    await d.setReference(null, city);
    expect(last(states).status).toBe("needs-location");
    await d.setReference(target("seed-city", "city"), city);
    expect(last(states).status).toBe("ready");
  });

  it("offers distant imagery and displays it only after acceptNearby", async () => {
    const { states, driver } = await setup({
      scenarios: { "seed-far": "nearby-offer" },
    });
    const d = await driver;
    await d.setReference(target("seed-far"), city);
    const offer = last(states);
    expect(offer.status).toBe("nearby-offer");
    if (offer.status !== "nearby-offer") return;
    expect(offer.view.distanceMeters).toBeGreaterThan(150);

    d.acceptNearby();
    const accepted = last(states);
    expect(accepted.status).toBe("ready");
    if (accepted.status !== "ready") return;
    expect(accepted.view.panoId).toBe(offer.view.panoId);
  });

  it("emits normalized unavailable states for configured failures", async () => {
    const { states, driver } = await setup({
      scenarios: { none: "no-coverage", quota: "quota" },
    });
    const d = await driver;
    await d.setReference(target("none"), city);
    expect(last(states)).toEqual({ status: "unavailable", reason: "no-coverage" });
    await d.setReference(target("quota"), city);
    expect(last(states)).toEqual({ status: "unavailable", reason: "quota" });
  });

  it("emits onManualTarget only while the map is expanded", async () => {
    const { manual, driver } = await setup();
    const d = await driver;
    d.simulateManualClick(point);
    expect(manual).toHaveLength(0);
    d.setMapExpanded(true);
    d.simulateManualClick(point);
    expect(manual).toEqual([point]);
  });

  it("returnToReference restores the accepted initial view", async () => {
    const { states, driver } = await setup();
    const d = await driver;
    await d.setReference(target("a"), city);
    const first = last(states);
    await d.setReference(target("b"), city);
    await d.returnToReference();
    const restored = last(states);
    expect(restored.status).toBe("ready");
    if (restored.status !== "ready" || first.status !== "ready") return;
    expect(restored.view.panoId).not.toBe(first.view.panoId);
    expect(restored.view.panoId).toBe("fake-pano:b");
  });

  it("cannot restore the previous seed while a nearby offer is pending", async () => {
    const { states, driver } = await setup({
      scenarios: { b: "nearby-offer" },
    });
    const d = await driver;
    await d.setReference(target("a"), city);
    await d.setReference(target("b"), city);
    await d.returnToReference();
    expect(last(states).status).toBe("nearby-offer");
  });

  it("suppresses stale async results via generations", async () => {
    const { states, driver } = await setup({ delayMs: 5 });
    const d = await driver;
    const p1 = d.setReference(target("old"), city);
    const p2 = d.setReference(target("new"), city);
    await Promise.all([p1, p2]);
    const readyStates = states.filter((s) => s.status === "ready");
    expect(readyStates).toHaveLength(1);
    expect(last(states).status).toBe("ready");
    if (last(states).status === "ready") {
      expect((last(states) as { view: { panoId: string } }).view.panoId).toBe("fake-pano:new");
    }
  });

  it("dispose is idempotent and blocks late emissions and manual clicks", async () => {
    const { states, manual, driver } = await setup({ delayMs: 5 });
    const d = await driver;
    const pending = d.setReference(target("late"), city);
    d.dispose();
    d.dispose();
    await pending;
    expect(states.every((s) => s.status !== "ready")).toBe(true);
    d.setMapExpanded(true);
    d.simulateManualClick(point);
    expect(manual).toHaveLength(0);
  });

  it("rejects when the factory signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      createFakePresentDayDriver()(
        {
          panoramaElement: el,
          mapElement: el,
          onState: () => {},
          onManualTarget: () => {},
        },
        controller.signal,
      ),
    ).rejects.toThrow("aborted");
  });
});
