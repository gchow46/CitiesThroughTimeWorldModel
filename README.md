# Cities Through Time

Type a **city** and a **decade**. Walk its streets.

We find real photos of that city from that era, seed a Reactor world model with the best one, and stream a navigable world you explore with WASD.

## How it works

```
city + decade
   → geocode
   → find era photos (Wikimedia Commons, Europeana, Flickr Commons; Google as fallback)
   → rank, crop to 16:9, store          [optional: GPU upscale on Modal]
   → compose a decade prompt
   → open a Reactor session seeded with the photo
   → walk
```

## Stack

|             |                                                                                                              |
| ----------- | ------------------------------------------------------------------------------------------------------------ |
| App         | Next.js — UI and API routes in one codebase                                                                  |
| World model | Reactor, behind a pluggable adapter (LingBot World 2 and Happy Oyster both supported; default set by config) |
| Photos      | Open archives first, Google Custom Search only as fallback                                                   |
| Storage     | Vercel Blob (images), Upstash Redis (cache)                                                                  |
| GPU         | Modal — optional restoration of old scans; the app runs without it                                           |

## Principles

- **Any Reactor model.** All model calls go through `WorldModelAdapter`. Adding a model is one file. Seed images are made to satisfy the strictest model so they work everywhere.
- **Never a broken world.** If a city/decade has too few photos, say so and suggest the nearest decade.
- **Nothing hard-depends on Modal.** GPU restoration is a bonus, with a CPU fallback.
- **Clean licensing.** Every seed shows credit and license.

## Plan

Two people, ~1 week. Day 1 is shared (scaffold, API contract, token route, a short model bake-off). Then in parallel:

- **Experience** — landing form, Reactor adapters, WASD/pointer-lock controls, session states, HUD
- **World data** — geocoder, photo sources, ranking, image prep, orchestrator + cache, decade prompt packs

Meet at E2E and deploy. Tickets: [`mvp1` issues](https://github.com/gchow46/CitiesThroughTimeWorldModel/issues?q=is%3Aissue+label%3Amvp1). Future work (VEED narrator, GIS alignment, splats, forecasting) is tagged `roadmap`.

Full detail: [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).

## Dev quickstart

```bash
pnpm install
cp .env.example apps/web/.env.local   # MOCK_WORLD=1 is all you need
pnpm dev                              # http://localhost:3000
```

Hit the mock (works for every registered model):

```bash
curl -N -X POST localhost:3000/api/world \
  -H 'content-type: application/json' \
  -d '{"city":"Amsterdam","decade":1960,"model":"happy-oyster-adventure"}'
```

## Layout

```
apps/web        Next.js 15 app — UI + API routes (the only service for MVP1)
  lib/types.ts      API contract: WorldPayload, SeedCandidate, ErrorCode, …
  lib/reactor/      WorldModelAdapter interface, model registry, stub adapters
docs/           api-contract.md, adr/001-world-models.md
scripts/        GitHub issue automation
services/       (B9, optional) Modal GPU restoration
```

## Checks

```bash
pnpm typecheck && pnpm lint && pnpm test   # unit
pnpm --filter web e2e                      # playwright (chromium)
pnpm demo:matrix                           # time-to-world per cell, both models
pnpm prewarm                               # warm shared seed cache for demo cells
```

## Deploy (Vercel)

1. `vercel link` at repo root → set project **root directory to `apps/web`**.
2. `vercel env add` / dashboard for: `REACTOR_API_KEY`, `WORLD_MODEL`,
   `ENABLED_MODELS`, `BLOB_READ_WRITE_TOKEN`, `UPSTASH_REDIS_REST_URL`,
   `UPSTASH_REDIS_REST_TOKEN`, and optionally `GOOGLE_CSE_KEY`/`GOOGLE_CSE_CX`,
   `EUROPEANA_KEY`, `FLICKR_KEY`, `RESTORE_ENDPOINT`/`RESTORE_KEY`.
   Do **not** set `MOCK_WORLD`/`MOCK_TOKEN` in production.
3. Provision **Vercel Blob** (needed for Happy Oyster's public-URL seeds) and
   **Upstash Redis** (cross-instance cache + rate limiting).
4. `vercel deploy --prod`, then `pnpm prewarm --base https://<app>.vercel.app`.

## Rules of the road

- `REACTOR_API_KEY` is server-only — browsers get short-lived JWTs from
  `POST /api/reactor/token`, scoped per model (`max_sessions: 2`).
- Models are pluggable via `lib/reactor/registry.ts`; `ENABLED_MODELS` gates ids.
- Seed artifacts are model-agnostic: public blob URL, always 16:9.
