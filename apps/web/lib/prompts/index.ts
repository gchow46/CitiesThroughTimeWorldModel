import type { ModelCapabilities, Seed } from "@/lib/types";
import { countryFlavour } from "./countries";
import { MODEL_PROMPT_SPEC } from "./modelSuffix";

import d1900 from "./decades/1900s.json";
import d1910 from "./decades/1910s.json";
import d1920 from "./decades/1920s.json";
import d1930 from "./decades/1930s.json";
import d1940 from "./decades/1940s.json";
import d1950 from "./decades/1950s.json";
import d1960 from "./decades/1960s.json";
import d1970 from "./decades/1970s.json";
import d1980 from "./decades/1980s.json";
import d1990 from "./decades/1990s.json";
import d2000 from "./decades/2000s.json";
import d2010 from "./decades/2010s.json";
import d2020 from "./decades/2020s.json";

export interface DecadePack {
  decade: number;
  vehicles: string;
  signage: string;
  clothing: string;
  streetFurniture: string;
  film: string;
}

const DECADES: Record<number, DecadePack> = {
  1900: d1900,
  1910: d1910,
  1920: d1920,
  1930: d1930,
  1940: d1940,
  1950: d1950,
  1960: d1960,
  1970: d1970,
  1980: d1980,
  1990: d1990,
  2000: d2000,
  2010: d2010,
  2020: d2020,
};

export interface ComposeInput {
  city: string; // canonical, e.g. "Amsterdam, Netherlands"
  countryCode: string;
  decade: number;
  seed?: Seed;
  caps: ModelCapabilities;
}

/**
 * Renders the city × decade prompt within the model's character limit.
 * Always references the seed image so the world continues the photo.
 */
export function composePrompt({ city, countryCode, decade, seed, caps }: ComposeInput): string {
  const pack = DECADES[decade];
  const spec = MODEL_PROMPT_SPEC[caps.id];
  const flavour = countryFlavour(countryCode);
  const seedRef = seed
    ? "Continue the street scene in the seed image — keep its architecture, street layout and light."
    : "Render a plausible street-level scene.";

  const full =
    `${city}, ${decade}s. ${seedRef} ` +
    (pack
      ? `Period detail: ${pack.vehicles}; ${pack.signage}; people in ${pack.clothing}; ` +
        `${pack.streetFurniture}. Look and feel: ${pack.film}.`
      : "") +
    ` Local flavour: ${flavour}. Street-level first-person view, a clear open ` +
    `path ahead — no parked vehicles blocking the way.` +
    spec.suffix;

  if (full.length <= spec.maxChars) return full;

  // Tighten progressively: drop film note, then furniture, then signage.
  const minimal =
    `${city}, ${decade}s. ${seedRef} ` +
    (pack ? `${pack.vehicles}; ${pack.clothing}.` : "") +
    ` ${flavour}.` +
    spec.suffix;
  return minimal.slice(0, spec.maxChars);
}
