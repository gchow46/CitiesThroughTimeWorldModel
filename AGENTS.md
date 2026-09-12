# Cities Through Time

Interactive world-model exploration of Amsterdam across decades (1960s → future forecast). See `IMPLEMENTATION_PLAN.md` for the full plan.

## Stack

- **World model**: Reactor (reactor.inc) — LingBot World 2 / Happy Oyster, via `@reactor-team/js-sdk` (browser) and Python SDK (pipelines). API key stays server-side; browser gets short-lived session JWTs from the token endpoint.
- **GPU jobs**: Modal — image ingestion, era classification, photo restoration/upscaling, (later) 3D Gaussian Splat reconstruction.
- **Narrator**: VEED avatar "news reporter" clips triggered by location zones.
- **Frontend**: Next.js. **Data**: Postgres + S3/R2.

## Repo layout

```
apps/web        Next.js frontend (Reactor client, controls, VEED overlay)
apps/api        Token service + seed/metadata API
pipelines/      Modal functions (ingest, classify, recon)
packages/       Era prompt packs, shared schemas
```

## Conventions

- Never ship `REACTOR_API_KEY` to the browser — always mint scoped tokens server-side.
- Use licensed imagery sources only (Street View Static API, Places, Stadsarchief, Mapillary). No scraping Google Photos.
- Seed images are versioned per (district, era) — see `seed_nodes` schema before adding fields.

## Status

Repo initialized. Phase 0 (Reactor spike on one district/era) is the first milestone.
