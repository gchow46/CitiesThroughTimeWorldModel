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

| | |
|---|---|
| App | Next.js — UI and API routes in one codebase |
| World model | Reactor, behind a pluggable adapter (LingBot World 2 and Happy Oyster both supported; default set by config) |
| Photos | Open archives first, Google Custom Search only as fallback |
| Storage | Vercel Blob (images), Upstash Redis (cache) |
| GPU | Modal — optional restoration of old scans; the app runs without it |

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
