import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { geocodeCity, InvalidCityError } from "./geocode";
import { resetMemoryCache } from "./cache";
import amsterdam from "./__fixtures__/nominatim-amsterdam.json";
import springfield from "./__fixtures__/nominatim-springfield.json";
import nyc from "./__fixtures__/nominatim-nyc.json";

function stubNominatim(payload: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify(payload), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    ),
  );
}

beforeEach(() => resetMemoryCache());
afterEach(() => vi.unstubAllGlobals());

describe("geocodeCity", () => {
  it("resolves Amsterdam with canonical name, country and bbox", async () => {
    stubNominatim(amsterdam);
    const g = await geocodeCity("Amsterdam");
    expect(g.canonicalName).toContain("Amsterdam");
    expect(g.countryCode).toBe("NL");
    expect(g.bbox.north).toBeGreaterThan(g.bbox.south);
    expect(g.lat).toBeCloseTo(52.37, 1);
  });

  it("resolves NYC and New York to the same canonical city", async () => {
    stubNominatim(nyc);
    const a = await geocodeCity("NYC");
    const b = await geocodeCity("New York");
    expect(a.canonicalName).toBe(b.canonicalName);
    expect(a.countryCode).toBe("US");
  });

  it("flags ambiguous Springfield but still returns the best guess", async () => {
    stubNominatim(springfield);
    const g = await geocodeCity("Springfield");
    expect(g.canonicalName).toContain("Springfield");
    expect(g.ambiguous).toBe(true);
  });

  it("throws invalid_city on empty results", async () => {
    stubNominatim([]);
    await expect(geocodeCity("Zxqwville")).rejects.toThrow(InvalidCityError);
  });

  it("caches results — second call does not hit the network", async () => {
    stubNominatim(amsterdam);
    await geocodeCity("Amsterdam");
    await geocodeCity("  amsterdam  ");
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });
});
