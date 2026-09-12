import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { MODEL_IDS, type WorldPayload } from "@/lib/types";
import { resetMemoryCache } from "@/lib/cache";

const ENV_KEYS = ["MOCK_WORLD", "ENABLED_MODELS", "WORLD_MODEL"] as const;
const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

beforeEach(() => resetMemoryCache());

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.unstubAllGlobals();
});

function req(body: unknown, url = "http://localhost/api/world") {
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function readNdjson(res: Response) {
  const text = await res.text();
  return text
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));
}

describe("POST /api/world (mock)", () => {
  it("streams NDJSON progress ending in a WorldPayload for each model", async () => {
    process.env.MOCK_WORLD = "1";
    for (const model of MODEL_IDS) {
      const res = await POST(req({ city: "Amsterdam", decade: 1960, model }));
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("ndjson");

      const lines = await readNdjson(res);
      const payload = lines.at(-1) as WorldPayload;
      expect(lines.slice(0, -1).every((l) => typeof l.stage === "string")).toBe(true);
      expect(payload.model.id).toBe(model);
      expect(payload.model.reactorModelName).toBe(`reactor/${model}`);
      expect(payload.seed.url).toBeTruthy();
      expect(payload.alternates.length).toBeLessThanOrEqual(3);
      expect(payload.sessionToken).toBeTruthy();
      // strictest-model guarantee: 16:9 satisfies Happy Oyster's 1.5–2.0
      const aspect = payload.model.caps.seedAspect;
      if (aspect) expect(16 / 9).toBeGreaterThanOrEqual(aspect.min);
      if (aspect) expect(16 / 9).toBeLessThanOrEqual(aspect.max);
    }
  });

  it("resolves the model from ?model= when body omits it", async () => {
    process.env.MOCK_WORLD = "1";
    const res = await POST(
      req({ city: "Amsterdam", decade: 1960 }, "http://localhost/api/world?model=lingbot-world-2"),
    );
    const payload = (await readNdjson(res)).at(-1) as WorldPayload;
    expect(payload.model.id).toBe("lingbot-world-2");
  });

  it("400 invalid_city on missing/empty city", async () => {
    process.env.MOCK_WORLD = "1";
    for (const body of [{ decade: 1960 }, { city: "  ", decade: 1960 }]) {
      const res = await POST(req(body));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("invalid_city");
    }
  });

  it("400 unsupported_decade outside 1900–2020 or non-decade", async () => {
    process.env.MOCK_WORLD = "1";
    for (const decade of [1890, 2030, 1965, "1960"]) {
      const res = await POST(req({ city: "Amsterdam", decade }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("unsupported_decade");
    }
  });

  it("400 unsupported_model for unknown/disabled ids", async () => {
    process.env.MOCK_WORLD = "1";
    process.env.ENABLED_MODELS = "happy-oyster-adventure";
    for (const model of ["dalle", "lingbot-world-2"]) {
      const res = await POST(req({ city: "Amsterdam", decade: 1960, model }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("unsupported_model");
    }
  });

  it("streams a status-carrying error line when the real pipeline fails", async () => {
    delete process.env.MOCK_WORLD;
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const res = await POST(req({ city: "Amsterdam", decade: 1960 }));
    expect(res.status).toBe(200); // status committed before streaming
    const last = (await readNdjson(res)).at(-1);
    expect(last.error).toBe("upstream_failed");
    expect(last.status).toBe(502);
  });
});
