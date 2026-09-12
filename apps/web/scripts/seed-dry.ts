// pnpm seed:dry --city Amsterdam --decade 1960 [--model happy-oyster-adventure]
// Exercises the sourcing pipeline (geocode → sources → rank → prompt) without
// the UI. Image normalization runs only with --normalize (needs network + blob).

import fs from "node:fs";
import path from "node:path";

// Load .env.local/.env without a dotenv dep.
for (const f of [".env.local", ".env"]) {
  const p = path.resolve(process.cwd(), f);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const city = arg("city") ?? "Amsterdam";
const decade = Number(arg("decade") ?? "1960");
const model = (arg("model") ?? "happy-oyster-adventure") as
  "lingbot-world-2" | "happy-oyster-adventure";
const doNormalize = process.argv.includes("--normalize");

async function main() {
  const { geocodeCity } = await import("../lib/geocode");
  const { gatherCandidates, ARCHIVE_SOURCES, FALLBACK_SOURCE } = await import("../lib/sources");
  const { rankCandidates, assertSufficient, MIN_CANDIDATES } = await import("../lib/ranking");
  const { composePrompt } = await import("../lib/prompts");
  const { MODELS } = await import("../lib/reactor/registry");

  const t0 = Date.now();
  const geo = await geocodeCity(city);
  console.log(
    `\n→ ${geo.canonicalName} (${geo.countryCode})${geo.ambiguous ? " [ambiguous]" : ""}`,
  );
  console.log(`  bbox ${JSON.stringify(geo.bbox)} @ ${geo.lat},${geo.lon}`);

  const q = {
    cityName: geo.canonicalName.split(",")[0],
    countryCode: geo.countryCode,
    bbox: geo.bbox,
    lat: geo.lat,
    lon: geo.lon,
    decade,
  };

  let candidates = await gatherCandidates(ARCHIVE_SOURCES, q);
  console.log(`\n→ archives: ${candidates.length} candidates`);
  if (candidates.length < MIN_CANDIDATES) {
    const cse = await gatherCandidates([FALLBACK_SOURCE], q);
    console.log(`→ google-cse fallback: +${cse.length}`);
    candidates = candidates.concat(cse);
  }

  const ranked = rankCandidates(candidates, decade);
  console.log("\nrank  score  year   source       title");
  for (const c of ranked.slice(0, 10)) {
    console.log(
      `${String(ranked.indexOf(c) + 1).padStart(4)}  ${c.score.toFixed(2)}  ` +
        `${String(c.year ?? "????").padEnd(5)}  ${c.source.padEnd(12)} ${(c.title ?? "").slice(0, 60)}`,
    );
  }

  const top = assertSufficient(ranked);
  if (doNormalize) {
    const { normalizeSeed } = await import("../lib/image");
    const { citySlug } = await import("../lib/slug");
    const seed = await normalizeSeed(top[0], citySlug(geo.canonicalName), decade);
    console.log(`\n→ normalized seed: ${seed.url} (restored=${seed.restored})`);
  }

  const caps = MODELS[model]().caps;
  console.log(`\n→ prompt (${model}, ${caps.reactorModelName}):\n`);
  console.log(
    composePrompt({ city: geo.canonicalName, countryCode: geo.countryCode, decade, caps }),
  );
  console.log(`\n${Date.now() - t0}ms`);
}

main().catch((e) => {
  console.error(`\n✗ ${e.code ?? "error"}: ${e.message}`);
  if (e.closestDecade) console.error(`  closestDecade hint: ${e.closestDecade}`);
  process.exit(1);
});
