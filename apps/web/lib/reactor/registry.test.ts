import { afterEach, describe, expect, it } from "vitest";
import { MODELS, resolveModel, UnsupportedModelError } from "./registry";
import { MODEL_IDS } from "@/lib/types";

const ENV_KEYS = ["WORLD_MODEL", "ENABLED_MODELS"] as const;
const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("MODELS registry", () => {
  it("has an entry for every ModelId with matching caps", () => {
    for (const id of MODEL_IDS) {
      const adapter = MODELS[id]();
      expect(adapter.caps.id).toBe(id);
      expect(adapter.caps.reactorModelName).toContain(id);
    }
  });
});

describe("resolveModel", () => {
  it("prefers ?model= over cookie and env", () => {
    process.env.WORLD_MODEL = "lingbot-world-2";
    const m = resolveModel({
      modelParam: "happy-oyster-adventure",
      modelCookie: "lingbot-world-2",
    });
    expect(m).toBe("happy-oyster-adventure");
  });

  it("falls back to cookie, then WORLD_MODEL env", () => {
    process.env.WORLD_MODEL = "lingbot-world-2";
    expect(resolveModel({ modelCookie: "happy-oyster-adventure" })).toBe("happy-oyster-adventure");
    expect(resolveModel({})).toBe("lingbot-world-2");
  });

  it("defaults to first registered when nothing is configured", () => {
    expect(resolveModel({})).toBe(MODEL_IDS[0]);
  });

  it("rejects unknown ids with unsupported_model", () => {
    expect(() => resolveModel({ modelParam: "midjourney" })).toThrow(UnsupportedModelError);
  });

  it("rejects ids not in ENABLED_MODELS", () => {
    process.env.ENABLED_MODELS = "happy-oyster-adventure";
    expect(() => resolveModel({ modelParam: "lingbot-world-2" })).toThrow(UnsupportedModelError);
    expect(resolveModel({ modelParam: "happy-oyster-adventure" })).toBe("happy-oyster-adventure");
  });

  it("falls back to an enabled model when WORLD_MODEL is disabled", () => {
    process.env.WORLD_MODEL = "lingbot-world-2";
    process.env.ENABLED_MODELS = "happy-oyster-adventure";
    expect(resolveModel({})).toBe("happy-oyster-adventure");
  });
});
