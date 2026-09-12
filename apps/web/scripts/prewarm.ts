// I5 pre-warm — populates the shared sourcing cache for the demo matrix so
// every demo cell answers in <2s regardless of which model is chosen first.
// Per-model state is filled by real sessions, not here.
//
//   pnpm prewarm [--base https://your-app.vercel.app]

export {};

const CELLS = [
  { city: "Amsterdam", decade: 1960 },
  { city: "Paris", decade: 1920 },
  { city: "New York", decade: 1980 },
  { city: "Tokyo", decade: 1970 },
];

const i = process.argv.indexOf("--base");
const BASE = ((i >= 0 ? process.argv[i + 1] : undefined) ?? "http://localhost:3000").replace(
  /\/$/,
  "",
);

async function main() {
  for (const cell of CELLS) {
    const t0 = Date.now();
    const res = await fetch(`${BASE}/api/world`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(cell),
    });
    const last = (await res.text())
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l))
      .at(-1);
    const status = last.error
      ? `✗ ${last.error}`
      : `✓ ${last.seed?.title?.split("\n")[0].slice(0, 50)}`;
    console.log(`${cell.city} ${cell.decade}  ${Date.now() - t0}ms  ${status}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
