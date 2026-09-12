# Cities Through Time

City + decade → real era photos → a Reactor world model you walk through with WASD. See `IMPLEMENTATION_PLAN.md` for the full MVP1 plan and GitHub issues #34–#53 for tickets.

## Stack (MVP1)

- **Frontend + backend**: single Next.js app in `apps/web` (App Router, TS strict, pnpm) orchestrates everything. No separate API service.
- **GPU (optional)**: Modal (Python) in `services/restore` — one web endpoint running Real-ESRGAN to upscale/denoise seed photos. Called from `lib/image.ts` only when `RESTORE_ENDPOINT` is set; `sharp`-only otherwise or on failure. MVP1 must ship without it.
- **World models**: Reactor (reactor.inc) via a pluggable adapter registry — `lingbot-world-2` and `happy-oyster-adventure` are both first-class. `REACTOR_API_KEY` is server-only; the browser gets short-lived model-scoped JWTs from `POST /api/reactor/token`.
- **Photo sourcing**: Wikimedia Commons, Europeana, Flickr Commons (open licenses), Google Custom Search as fallback only.
- **Storage**: Vercel Blob (seed images, public URLs), Upstash Redis (cache + rate limit).
- **Deploy**: Vercel (web); `modal deploy` for the optional restore service.

## Repo layout

```
apps/web/app           routes: landing, /world, /api/world, /api/world/cache, /api/reactor/token
apps/web/lib           geocode, sources/, ranking, image, prompts/, cache, reactor/
apps/web/lib/reactor   adapter.ts (interface), registry.ts, lingbot.ts, happyOyster.ts, controls.ts
services/restore       (optional) Modal app: app.py (web endpoint), smoke.py
docs/                  api-contract.md, adr/, adding-a-model.md
scripts/               GitHub issue automation (PowerShell, needs GH_TOKEN)
```

## Conventions

- **Model flexibility is a hard rule.** All Reactor interaction goes through `WorldModelAdapter`. Never import a model SDK outside `lib/reactor/<model>.ts`. Adding a model = one adapter file + registry entry + token scope; no UI/API changes.
- Model selection: `WORLD_MODEL` env default → `?model=` query → dev-panel cookie. `ENABLED_MODELS` gates what's accepted.
- Seed images are normalized to 16:9 public Blob URLs so every adapter can consume them (Happy Oyster requires public URL, aspect 1.5–2.0).
- Controls are held state, one command per state change — never per-frame. UI emits normalized `MoveDir`/`LookDir`; adapters map to model vocab.
- Cache keys: `world:{citySlug}:{decade}` (shared) and `world:{citySlug}:{decade}:{modelId}` (per-model state). Switching models must not re-run sourcing.
- Licensing: only open-licensed archive photos by default; every rendered seed shows credit + license. Google CSE seeds carry `licenseConfidence: low`.
- Always `dispose()` sessions on teardown — Reactor sessions are metered.
- Modal is optional and never on the critical failure path: nothing may require `RESTORE_ENDPOINT`; every call has a timeout and a `sharp`-only fallback; `seed.restored` records which path ran.
- Never ship `REACTOR_API_KEY`, `RESTORE_KEY`, or archive keys to the browser.

## Commands (once `apps/web` exists)

```
pnpm dev                                   # MOCK_WORLD=1 for the canned /api/world
pnpm typecheck && pnpm lint && pnpm test
pnpm e2e                                   # Playwright, fake adapter
pnpm seed:dry --city Amsterdam --decade 1960 [--no-restore]   # run sourcing pipeline without UI
modal deploy services/restore              # (optional) deploy GPU restoration endpoint
modal run services/restore/smoke.py --url <img>   # (optional) smoke test
```

## GitHub issue tooling

`scripts/*.ps1` create/close issues via the REST API. Run from Git Bash so the token comes from Git Credential Manager without being printed:

```
GH_TOKEN=$(printf 'protocol=https\nhost=github.com\n\n' | git credential fill | grep '^password=' | cut -d= -f2-) \
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts/<script>.ps1
```

## Status

Day-0 foundation landed (scaffold, contract, registry, token route, mocks).
Hacker-B world-data pipeline implemented: geocoder, Wikimedia/Europeana/
Flickr/CSE sources, ranking, sharp normalization + blob store, decade prompt
packs, `/api/world` orchestrator with NDJSON progress + model-aware cache,
`PATCH /api/world/cache`, `pnpm seed:dry`. Modal restore service scaffolded
under `services/restore` (optional — `RESTORE_ENDPOINT` unset = sharp-only).
Remaining: Hacker-A experience tickets + I3 calibration spike.
Roadmap items (bulk Modal pipelines, VEED narrator, GIS, splats, forecasting) are issues #1–#18 tagged `roadmap`.
