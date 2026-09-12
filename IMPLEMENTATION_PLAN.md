# Cities Through Time — Implementation Plan

An interactive, explorable world model of any city as it looked in a given decade. The user enters a **city** and a **decade**; the app sources real photos of that city from that era, seeds a Reactor world model with the best one, and lets the user walk the streets with WASD.

Long-term the project roads toward multi-era coverage, GIS-aligned geometry, and forecasting a city ~10 years into the future. Those are tracked as `roadmap` issues; this document covers **MVP1**.

## MVP1 — product spec

**Input**: `city` (free text, geocoded) + `decade` (dropdown, 1900s–2020s).
**Output**: a live Reactor session seeded with a real era photo; first-person WASD + mouse-look navigation.

**Flow**:

1. User submits `{city, decade}` → `POST /api/world`
2. Backend geocodes the city (Nominatim) → canonical name + bounding box
3. Seed pipeline queries open archives (Wikimedia Commons, Europeana, Flickr Commons) for photos matching (bbox/city, decade, open license); falls back to Google Custom Search if too few candidates
4. Candidates are ranked; the top ones are smart-cropped to 16:9 and uploaded to blob storage (optionally upscaled/denoised on Modal first)
5. Prompt composer renders a `city × decade` prompt
6. API mints a Reactor token scoped to the selected model and returns `{model, sessionToken, seed, alternates, prompt, modelState}`
7. Browser opens the session via the model's adapter and the user walks; re-seed on drift

Unsupported (city, decade) pairs return a graceful `insufficient_archival_photos` error with a `closestDecade` hint rather than a broken world.

## Decisions

| Decision | Choice | Consequence |
|---|---|---|
| Reactor model | **Flexible — no lock-in.** LingBot World 2 and Happy Oyster Adventure are both first-class adapters; a day-1 spike calibrates the default but does not eliminate a model | `WorldModelAdapter` registry is core architecture. Seed artifacts satisfy the strictest model's constraints so any adapter can consume them |
| Model selection | Config default (`WORLD_MODEL`) + hidden override (`?model=`, dev-panel cookie). Not user-facing | Token route mints per requested model; cache stores per-model state side by side |
| Photo source | Open archives first, Google Custom Search JSON API as fallback | Clean licensing by default; CSE results carry `licenseConfidence: low` |
| Backend | Single Next.js app (App Router API routes) orchestrates everything | One codebase for both hackers; no separate API service |
| Modal | **Optional, GPU restoration only** — a Modal web endpoint running Real-ESRGAN upscales/denoises chosen seed photos | MVP1 ships and demos with `RESTORE_ENDPOINT` unset. When set, Next.js calls it from the image step with a `sharp`-only fallback, so Modal is never on the critical failure path |
| Infra | Vercel + Vercel Blob + Upstash Redis (+ Modal, optional) | Zero-ops; Modal scales to zero outside demos |

## Model flexibility — design

### `WorldModelAdapter` (`lib/reactor/adapter.ts`)

```ts
interface ModelCapabilities {
  id: ModelId;                               // "lingbot-world-2" | "happy-oyster-adventure" | future
  reactorModelName: string;                  // token scope, e.g. "reactor/lingbot-world-2"
  seedInput: "upload" | "public-url";        // how the seed reaches the model
  seedAspect?: { min: number; max: number }; // e.g. 1.5–2.0 for Happy Oyster
  supportsHotPrompt: boolean;                // set_prompt mid-stream
  supportsReattach: boolean;                 // encrypted_world_id re-attach
  driftReset: "kv-cache" | "reattach" | "reseed";
  perspective?: "first_person" | "third_person";
}

interface WorldModelAdapter {
  readonly caps: ModelCapabilities;
  connect(jwt: string): Promise<void>;
  seed(input: { imageUrl: string; imageBlob?: Blob; prompt: string; reattachId?: string }): Promise<{ reattachId?: string }>;
  start(): Promise<void>;
  setMove(dir: MoveDir | null): void;        // held state; null = idle/stop
  setLook(axis: "h" | "v", dir: LookDir | null): void;
  reseed(next: SeedRef): Promise<void>;      // impl picks kv-reset / reattach / reset+setImage
  dispose(): Promise<void>;
  on(evt: "status" | "chunk" | "error", cb: (e: unknown) => void): () => void;
}
```

- **Registry** (`lib/reactor/registry.ts`): `MODELS: Record<ModelId, () => WorldModelAdapter>`; `resolveModel(req)` = `?model=` → cookie → `WORLD_MODEL` env → first registered. `ENABLED_MODELS` gates accepted ids; unknown/disabled → `400 unsupported_model`.
- **Adding a model** = one adapter file + a registry entry + a token scope string. No UI or API changes.
- **Seed artifacts are model-agnostic**: always a public Blob URL at 16:9 — usable as a URL (Happy Oyster) or fetched into a Blob for upload (LingBot).
- **Cache is model-aware**: `world:{citySlug}:{decade}` holds shared payload (seed, alternates, prompt); `world:{citySlug}:{decade}:{modelId}` holds per-model state (e.g. `encryptedWorldId`). Switching models never re-runs sourcing.
- **Controls are normalized**: UI emits `MoveDir`/`LookDir`; each adapter maps to its own vocabulary (`setMovement("forward")` vs `move("Front")`).
- **Capability-driven UI**: re-seed behaviour and hot-prompt controls render from `caps`, so a missing feature degrades instead of erroring.

### Reactor API notes per adapter

**LingBot World 2** (`@reactor-models/lingbot-world-2`): `connect(jwt)` → `uploadFile(blob)` → `setImage` → `setPrompt` → `start`. Held-state `setMovement` / `setLookHorizontal` / `setLookVertical` / `setRotationSpeedDeg`; commands land at the next chunk (~1.4s); errors arrive as `command_error` events. Drift: `triggerKvCacheReset()`, `setAttnWindow`. Re-seed = `reset()` → `setImage` → `start()`.

**Happy Oyster Adventure** (`@reactor-models/happy-oyster`): `connect(jwt)` → `createWorld({prompt, first_frame_image_url, perspective: "first_person"})` → `startTravel()`; returns `encrypted_world_id` for instant `attachWorld()` later. `move("Front"|…)`, `look("Mouse_Left"|…)`, `stop()`. Seed must be a public URL, landscape, aspect 1.5–2.0. Token scope `reactor/happy-oyster-adventure`.

**Both**: tokens from `POST https://api.reactor.inc/tokens` with `authorization_details[].resources.models.match` + `constraints.max_sessions`; JWT ≤ 6h; mint per model; API key never reaches the browser.

## Architecture

```
apps/web (Next.js 15, App Router, TS)
  app/
    page.tsx                      landing: city input + decade select
    world/page.tsx                experience: <video> + controls + HUD (+ dev panel behind ?dev=1)
    api/world/route.ts            POST {city, decade, model?} → WorldPayload (NDJSON progress stream)
    api/world/cache/route.ts      PATCH {city, decade, model, state} → per-model state (e.g. encryptedWorldId)
    api/reactor/token/route.ts    POST {model} → JWT scoped to that model
  lib/
    types.ts                      WorldPayload, SeedCandidate, ErrorCode, ModelId, ModelCapabilities
    geocode.ts                    Nominatim → {canonicalName, countryCode, bbox, lat, lon}
    sources/                      SeedSource interface + wikimedia.ts, europeana.ts, flickrCommons.ts, googleCse.ts
    ranking.ts                    score + threshold + insufficiency
    image.ts                      fetch, validate → Modal restore (optional) → sharp smart-crop 16:9, 1280x720 JPEG → Blob
    prompts/                      decades/1900s…2020s.json + compose(city, country, decade, seed, caps)
    cache.ts                      Upstash Redis: shared + per-model keys
    reactor/
      adapter.ts                  interface + capabilities
      registry.ts                 MODELS map + resolveModel()
      lingbot.ts, happyOyster.ts  implementations
      controls.ts                 normalized MoveDir/LookDir + per-model mapping tables
services/restore (Modal, Python — optional)
  app.py                        @modal.web_endpoint POST {imageUrl, targetWidth} → {restoredUrl, ms}; Real-ESRGAN on A10G
  smoke.py                      modal run smoke test
docs/
  api-contract.md, adr/001-world-models.md, adding-a-model.md
scripts/                          GitHub issue automation
```

**Secrets**: `REACTOR_API_KEY`, `GOOGLE_CSE_KEY`, `GOOGLE_CSE_CX`, `EUROPEANA_KEY`, `FLICKR_KEY`, `BLOB_READ_WRITE_TOKEN`, `UPSTASH_*`, `RESTORE_KEY` (shared with Modal).
**Config**: `WORLD_MODEL` (default model id), `ENABLED_MODELS` (comma list), `RESTORE_ENDPOINT` (Modal URL; unset = sharp-only), `MOCK_WORLD=1` (dev mock).

### `POST /api/world` contract

```jsonc
// request
{ "city": "Amsterdam", "decade": 1960, "model": "happy-oyster-adventure" }   // model optional

// 200 — final NDJSON line; earlier lines are {stage, detail}
{
  "model": { "id": "happy-oyster-adventure", "reactorModelName": "reactor/happy-oyster-adventure",
             "caps": { "seedInput": "public-url", "supportsReattach": true, "driftReset": "reattach", "supportsHotPrompt": false } },
  "sessionToken": "<jwt scoped to model>",
  "seed": { "url": "https://blob/.../amsterdam-1960-a1.jpg", "thumbUrl": "...", "source": "wikimedia", "year": 1967,
            "title": "...", "author": "...", "license": "CC BY-SA 3.0", "sourceUrl": "...", "licenseConfidence": "high",
            "restored": true },
  "alternates": [ /* ≤3 seed objects for re-seed rotation */ ],
  "prompt": "Amsterdam, Netherlands, 1960s: ...",
  "modelState": { "encryptedWorldId": "..." },     // per-model, null on miss
  "meta": { "canonicalCity": "Amsterdam, Netherlands", "cacheHit": false, "sourcingMs": 4120 }
}

// errors — JSON {error, message, closestDecade?}
400 invalid_city | 400 unsupported_decade | 400 unsupported_model
404 insufficient_archival_photos | 429 rate_limited | 502 upstream_failed
```

### Orchestration

1. Validate + normalize; `resolveModel()`; rate-limit 10/min/IP
2. Shared cache lookup → on hit load per-model state, mint token, return (≤ 2s)
3. Geocode (cached 30d)
4. Sources in parallel (6s timeout each, error-isolated); `< MIN_CANDIDATES (5)` → Google CSE; `< 1` → 404
5. Rank → top 4 → [optional: restore on Modal, parallel, 10s timeout, sharp-only fallback] → normalize → Blob
6. Compose prompt (consults `caps`) → mint token → write cache → return

Budget: ≤ 25s cold (≤ 30s with restoration on), ≤ 2s warm.

## Tickets — 2 hackers

GitHub issues **#34–#53**, labels `mvp1` + `hacker-a` / `hacker-b` / `integration`; `day-0` marks the tickets that unblock parallel work.

| Day 0–1 (both) | Hacker A — Experience | Hacker B — World data | Final (both) |
|---|---|---|---|
| #34 I1 scaffold + contract + mock | #37 A1 landing form | #43 B1 Nominatim geocoder | #51 I4 E2E + demo matrix (both models) |
| #35 I2 token route + registry | #38 A2 adapter + both impls | #44 B2 SeedSource + Wikimedia | #52 I5 hardening + deploy |
| #36 I3 calibration spike (3h, pair) | #39 A3 video + WASD/pointer-lock | #45 B3 Europeana + Flickr Commons | |
| | #40 A4 session state machine | #46 B4 Google CSE fallback | |
| | #41 A5 progress UX + dev panel | #47 B5 ranking + insufficiency | |
| | #42 A6 HUD + capability-aware actions | #48 B6 image normalization + Blob (calls B9) | |
| | | #49 B7 orchestrator + cache + streaming | |
| | | #50 B8 prompt composer + decade packs | |
| | | #53 B9 Modal GPU restoration endpoint *(optional)* | |

### Dependency graph

```
I1 ─┬─ A1 ─ A4 ─ A5 ─ A6
    ├─ A2 ─ A3 ─┘
    ├─ B1 ─ B2 ─ B3 ─ B4 ─ B5 ─ B7 ─ I4 ─ I5
    │   (B9)─ B6 ──┘     B8 ─┘
I2 ─┴─ I3 (needs I2 + stub adapters)
```

B9 is **optional** and a soft dependency of B6: the `sharp`-only path must work with `RESTORE_ENDPOINT` unset. Pick B9 up after B1–B8 are green, or earlier if pre-1950 seeds look too soft to demo.

A builds against the I1 mock until B7 lands; B tests sourcing via `pnpm seed:dry --city Amsterdam --decade 1960` until A1 lands.

## Verification

- `pnpm typecheck && pnpm lint && pnpm test` green in CI
- Unit: geocoder fixtures; each `SeedSource` against recorded HTTP fixtures; ranking golden tests; prompt composer per-model limits; token route never leaks the key and rejects disabled/unknown models
- Adapter contract tests pass for LingBot, Happy Oyster, and the fake adapter
- Integration: Amsterdam/1960 cold ≤ 25s (≤ 30s with restoration), warm ≤ 2s; Lagos/1950 → 404 with `closestDecade`; `?model=` switches token scope and adapter without re-sourcing
- `/api/world` succeeds with `RESTORE_ENDPOINT` unset (`seed.restored: false`) — this is the default MVP1 configuration
- Modal (if B9 is done): `modal run services/restore/smoke.py` returns a sharper 1280×720 from a 1920s scan than sharp-only; `/api/world` still succeeds with the endpoint down
- E2E (Playwright, fake adapter): landing → walking; distinct error UIs
- Manual: both real adapters respond to WASD; re-seed works per model; teardown leaves no dangling sessions
- Licensing: every seed shows credit + license; CSE seeds carry a low-confidence badge

## Risks

| Risk | Mitigation |
|---|---|
| Photo scarcity for non-Western / pre-1950 pairs | 404 with `closestDecade` hint; rank resolution heavily |
| Happy Oyster aspect constraint (1.5–2.0) | B6 always outputs 16:9; portrait ranked down hard |
| Modal cold starts / outages add latency or fail | 10s timeout + `sharp`-only fallback; `keep_warm=1` during demos; restoration results content-addressed so repeats are free |
| GPU spend | Restore only the top 4 candidates, only when below target width or flagged as a scan; Modal spend alert in I5 |
| Model SDK divergence | Adapter contract tests; `ENABLED_MODELS` kill-switch without a code deploy |
| Reactor session cost | `max_sessions` on tokens; `dispose()` discipline; measured in I3 |
| Nominatim policy / Google CSE quota | Aggressive caching; CSE fallback-only with logging |
| World drift on long walks | Per-model `driftReset` via the adapter (`triggerKvCacheReset`, re-attach, or reset+reseed) |

## Post-MVP roadmap (`roadmap` issues #1–#18)

Not part of MVP1. Kept for direction:

- **More Modal GPU work**: bulk ingestion, era classification for undated photos (vision model feeding the ranker), SUPIR-grade restoration, splat reconstruction
- **VEED narrator**: period "news reporter" clips triggered by location zones
- **GIS alignment**: PDOK/BAG footprints + street geometry; real minimap; align generated world to actual street layout
- **Persistence**: 3D Gaussian Splat reconstruction of generated traversals for consistent, revisitable streets
- **Forecasting**: speculative future decades ("Amsterdam 2035") from policy/climate-informed prompt packs and generated seed imagery
- **Additional Reactor models**: Helios / H3 for non-navigable "postcard" mode via the same adapter registry
