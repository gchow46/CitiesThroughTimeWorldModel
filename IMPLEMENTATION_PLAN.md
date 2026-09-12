# Cities Through Time — Implementation Plan

An interactive, explorable world model of a city (Amsterdam first) as it looked across decades — 1960s, 70s, 80s… — and eventually forecast ~10 years into the future. A VEED-generated "news reporter" narrates period context as the user walks the streets.

## Stack

| Layer | Tech | Role |
|---|---|---|
| World model | **Reactor** (reactor.inc — LingBot World 2 / Happy Oyster) | Real-time navigable video world, seeded by era-specific images + prompts, steered via WASD/look commands |
| GPU workloads | **Modal** | Batch ingestion, image restoration/upscaling, era classification, optional splat reconstruction |
| Narrator | **VEED** (avatars/Fabric API) | Period "news reporter" clips triggered by location zones |
| Frontend | Next.js + `@reactor-team/js-sdk` | Render world stream to `<video>`, controls, era slider, minimap |
| Backend | Node/FastAPI token service | Mints short-lived Reactor session tokens (API key never reaches browser) |
| Data | Postgres (Supabase/Neon) + S3/R2 | Photo metadata, seed-image registry, district/era graph |

## Key architecture decision

Two ways to make a "walkable city":

- **Generative (Reactor)**: dreamlike, infinite, real-time, but geometry can drift on long walks. Best for atmosphere and MVP speed.
- **Reconstruction (3D Gaussian Splatting / NeRF on Modal)**: geometrically faithful and persistent, but static and data-hungry.

**Recommendation**: MVP1 is generative-first (matches the stated stack). Treat splat reconstruction as a Phase-4+ hybrid for hero landmarks where drift is unacceptable, and as the caching layer for "persistent" streets.

## Phases

### Phase 0 — De-risking spike
Goal: prove a Reactor session seeded with an Amsterdam photo feels like walking Amsterdam.

- Scaffold with `create-reactor-app`; stand up the token-mint endpoint (server holds `REACTOR_API_KEY`, browser gets scoped JWT).
- Pick ONE neighborhood (Jordaan or Dam Square area) and ONE era (e.g. 1968).
- Manually curate 20–50 seed images; test world consistency, drift, session cost.
- Deliverable: a URL where you can WASD-walk "1968 Amsterdam" for 2 minutes.

### Phase 1 — Data pipeline (Modal)
- **Ingestion** (scheduled Modal functions):
  - Google Street View Static API + Places photos (licensed path — see Risks).
  - Amsterdam City Archives / Beeldbank (Stadsarchief) for historical street-level photos; Mapillary as open supplementary source.
- **Era classification**: metadata first (many archival photos are dated), vision-model dating (CLIP-style or fine-tuned classifier on Modal batch GPU) for undated images.
- **Restoration**: upscale/de-noise archival photos (Real-ESRGAN / SUPIR) so they're usable as Reactor seed images.
- **Geocoding**: lat/lon + camera heading per photo; build a street graph of "seed nodes" per district.
- **Storage**: images → R2/S3; metadata → Postgres (`photos`, `districts`, `eras`, `seed_nodes` tables).

### Phase 2 — World generation layer
- **Seed registry**: per (district, era), rank and select anchor seed images.
- **Session service**: mint Reactor tokens, manage session lifecycle, handle drift recovery (re-seed when the world diverges too far from the district).
- **Prompt library**: per-decade prompt packs ("1960s Jordaan: trams, VW Beetles, coal smoke, Provo-era posters…") layered on the seed image.
- **Traversal model**: for MVP, districts are discrete worlds joined by a map/teleport UI. Later: portal seams or continuous generation.
- **VEED integration**: per-location trigger zones → pre-generated reporter clips ("Live from Dam Square, May 1970…") rendered picture-in-picture.

### Phase 3 — Experience frontend (MVP1 ship)
- Next.js app: Reactor SDK → `<video>`, WASD + look controls wired to `move`/`look` commands.
- Era slider (1960s/70s/80s), district picker, minimap (static SVG for MVP; real GIS later).
- VEED reporter overlay + era-appropriate ambient audio.

### Phase 4+ — Post-MVP roadmap
- Multi-era coverage; more districts → whole city.
- GIS ingestion (PDOK / BAG building footprints, street geometry) + Google Maps data for a real navigable ground truth; align generative world to actual street layout.
- Splat reconstruction of generated traversals → persistent, consistent streets (drift correction).
- **Forecasting**: "Amsterdam 2035" — speculative era via prompt packs informed by policy/climate data (e.g. car-free center, sea-level adaptations), generated imagery as seeds.

## Suggested repo layout (monorepo)

```
apps/
  web/            # Next.js — Reactor client, controls, VEED overlay
  api/            # Token service + seed/metadata API
pipelines/
  ingest/         # Modal functions: scraping, archival fetch
  classify/       # Era classification, restoration (GPU)
  recon/          # (later) splat reconstruction
packages/
  prompts/        # Era prompt packs
  shared/         # Types, district/era schemas
infra/            # DB schema, deploy config
```

## Risks & open questions

| Risk | Mitigation |
|---|---|
| Google imagery ToS — scraping Photos/Street View violates terms | Use official APIs (Street View Static, Places) or licensed/open sources (Stadsarchief, Mapillary). Budget for API costs. |
| World drift on long walks | Session re-seeding, bounded "district" worlds with teleport between them, splat anchoring later |
| Sparse 1960s street-level photos | Lean on Stadsarchief Beeldbank; generative fill where data is thin; accept lower fidelity for old eras |
| Per-session real-time generation cost | Measure in Phase 0; consider session pooling, pre-baked loops for free tier |
| VEED API latency/limits | Pre-generate clips per trigger zone rather than live generation |

## How to evaluate quality

- Side-by-side: generated frame vs. real archival photo of the same spot.
- Consistency check: walk a loop — does the street return to where it started?
- Era plausibility: domain-expert or user-test pass per decade.
