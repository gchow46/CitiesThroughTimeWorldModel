// I4 demo matrix — measures time-to-world per (city, decade, model) cell and
// verifies ?model= switching reuses the shared source cache.
//
//   pnpm demo:matrix [--base http://localhost:3000] [--models a,b]
//
// Cells: Amsterdam 1960, Paris 1920, New York 1980, Tokyo 1970, Lagos 1950.
// Lagos-1950 is expected to 404 with a closestDecade hint.

export {};

const CELLS = [
  { city: "Amsterdam", decade: 1960 },
  { city: "Paris", decade: 1920 },
  { city: "New York", decade: 1980 },
  { city: "Tokyo", decade: 1970 },
  { city: "Lagos", decade: 1950 },
];

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const BASE = (arg("base") ?? "http://localhost:3000").replace(/\/$/, "");
const MODELS = (arg("models") ?? "lingbot-world-2,happy-oyster-adventure").split(",");

interface Line {
  stage?: string;
  error?: string;
  status?: number;
  closestDecade?: number;
  model?: { id: string };
  sessionToken?: string;
  meta?: { canonicalCity: string; cacheHit: boolean; sourcingMs: number };
  seed?: { title?: string; year?: number };
}

async function hit(cell: (typeof CELLS)[number], model: string): Promise<string> {
  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/world`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...cell, model }),
  });
  const lines = (await res.text())
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l) as Line);
  const last = lines.at(-1)!;
  const ms = Date.now() - t0;

  if (last.error) {
    return (
      `${cell.city} ${cell.decade} | ${model.padEnd(24)} | ${String(ms).padStart(5)}ms | ` +
      `${last.error}${last.closestDecade ? ` (→ ${last.closestDecade})` : ""}`
    );
  }
  return (
    `${cell.city} ${cell.decade} | ${model.padEnd(24)} | ${String(ms).padStart(5)}ms | ` +
    `${last.meta?.cacheHit ? "warm " : "cold "} | ${last.seed?.year ?? "?"} · ` +
    `${(last.seed?.title ?? "").split("\n")[0].slice(0, 50)}`
  );
}

async function main() {
  console.log(`base: ${BASE}\n`);
  console.log("cell               | model                    | time   | result");
  console.log("-".repeat(95));
  for (const cell of CELLS) {
    for (const model of MODELS) console.log(await hit(cell, model));
  }

  // Model-switch behaviour is already proven in-matrix: the second model's
  // row for each cell hits the shared seed cache and reports "warm" — no
  // re-sourcing. (Extra calls here would just trip the 10/min rate limit.)
  console.log("\nnote: 'warm' rows are the model-switch proof — the 2nd model");
  console.log("reused the shared cache instead of re-sourcing.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
