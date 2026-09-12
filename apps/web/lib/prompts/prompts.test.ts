import { describe, expect, it } from "vitest";
import { composePrompt } from "./index";
import { MODEL_PROMPT_SPEC } from "./modelSuffix";
import { MODELS } from "../reactor/registry";
import type { Seed } from "../types";

const seed: Seed = {
  url: "https://x/seed.jpg",
  thumbUrl: "https://x/thumb.jpg",
  source: "wikimedia",
  year: 1967,
  licenseConfidence: "high",
  restored: false,
};

describe("composePrompt", () => {
  for (const id of Object.keys(MODELS) as ("lingbot-world-2" | "happy-oyster-adventure")[]) {
    it(`stays within ${id} limit for every decade`, () => {
      const caps = MODELS[id]().caps;
      for (let decade = 1900; decade <= 2020; decade += 10) {
        const p = composePrompt({
          city: "Amsterdam, Netherlands",
          countryCode: "NL",
          decade,
          seed,
          caps,
        });
        expect(p.length).toBeLessThanOrEqual(MODEL_PROMPT_SPEC[id].maxChars);
        expect(p).toContain(`${decade}s`);
        expect(p).toContain("Amsterdam");
        expect(p.toLowerCase()).toContain("seed image");
      }
    });
  }

  it("includes country flavour", () => {
    const caps = MODELS["happy-oyster-adventure"]().caps;
    const p = composePrompt({
      city: "Paris, France",
      countryCode: "FR",
      decade: 1920,
      caps,
    });
    expect(p).toContain("Paris");
    expect(p.toLowerCase()).toMatch(/café|haussmann|france/i);
  });
});
