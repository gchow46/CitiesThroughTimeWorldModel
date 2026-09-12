# API contract — MVP1

Single Next.js app (`apps/web`, App Router route handlers). All types live in
`apps/web/lib/types.ts` — that file is the source of truth; this doc is the
human-readable mirror.

## `POST /api/world`

Creates (or reuses) a world for a `{city, decade}` pair and returns everything
the browser needs to open a Reactor session.

**Request**

```jsonc
{
  "city": "Amsterdam", // free text, geocoded server-side
  "decade": 1960, // multiple of 10, 1900–2020
  "model": "happy-oyster-adventure", // optional; see model resolution
}
```

**Response — `200`, `content-type: application/x-ndjson`**

Zero or more progress lines, then exactly one payload line (the last line):

```jsonc
{"stage":"sourcing","detail":"3 archives, 14 candidates"}
{"stage":"opening","detail":"minting session token"}
{
  "model": { "id": "happy-oyster-adventure", "reactorModelName": "reactor/happy-oyster-adventure",
             "caps": { "seedInput": "public-url", "seedAspect": {"min":1.5,"max":2.0},
                       "supportsHotPrompt": false, "supportsReattach": true,
                       "driftReset": "reattach", "perspective": "first_person" } },
  "sessionToken": "<jwt scoped to model>",
  "seed": { "url": "https://blob/.../amsterdam-1960-a1.jpg", "thumbUrl": "...",
            "source": "wikimedia", "year": 1967, "title": "...", "author": "...",
            "license": "CC BY-SA 3.0", "sourceUrl": "...",
            "licenseConfidence": "high", "restored": true },
  "alternates": [ /* ≤3 more Seed objects for re-seed rotation */ ],
  "prompt": "Amsterdam, Netherlands, 1960s: ...",
  "modelState": { "encryptedWorldId": "..." },
  "meta": { "canonicalCity": "Amsterdam, Netherlands", "cacheHit": false, "sourcingMs": 4120 }
}
```

Budget: ≤ 25s cold (≤ 30s with restoration), ≤ 2s warm (shared-cache hit).

**Errors — JSON `{error, message, closestDecade?}`**

| Status | `error`                        | When                                                   |
| ------ | ------------------------------ | ------------------------------------------------------ |
| 400    | `invalid_city`                 | missing/empty city, or geocoding found nothing         |
| 400    | `unsupported_decade`           | decade outside 1900–2020 or not a multiple of 10       |
| 400    | `unsupported_model`            | unknown id, or id not in `ENABLED_MODELS`              |
| 404    | `insufficient_archival_photos` | no usable seeds; `closestDecade` hints a nearby decade |
| 429    | `rate_limited`                 | > 10 req/min/IP                                        |
| 502    | `upstream_failed`              | archive/blob/Reactor failure                           |
| 501    | `not_implemented`              | real pipeline not wired yet — set `MOCK_WORLD=1`       |

**Model resolution** (also used by `/api/reactor/token`): `model` body field or
`?model=` query param → `ctt_model` cookie → `WORLD_MODEL` env → first enabled
model in the registry. `ENABLED_MODELS` (comma list) gates accepted ids.

## `PATCH /api/world/cache`

Per-model state write-back (lands in B7). Body:

```jsonc
{
  "city": "Amsterdam",
  "decade": 1960,
  "model": "happy-oyster-adventure",
  "state": { "encryptedWorldId": "..." },
}
```

Stores under `world:{citySlug}:{decade}:{modelId}`. `200 {ok:true}` or the
error table above.

## `POST /api/reactor/token`

Mints a short-lived Reactor JWT scoped to one model. `REACTOR_API_KEY` stays
server-side; it must never appear in a response.

**Request**: `{ "model": "lingbot-world-2" }` (optional; same resolution as above)

**Response — `200`**

```jsonc
{ "token": "<jwt>", "model": "lingbot-world-2", "expiresAt": "<iso8601|null>" }
```

The upstream mint is `POST https://api.reactor.inc/tokens` with
`authorization_details[].resources.models.match = [reactorModelName]` and
`constraints.max_sessions = 2`. Errors: `400 unsupported_model`,
`502 upstream_failed`.

## Mock mode

`MOCK_WORLD=1`: `/api/world` returns canned Amsterdam-1960 NDJSON payloads for
every registered model (validating `city`/`decade`/`model` first), and
`/api/reactor/token` returns a fake `mock-jwt.<model>.dev` token without needing
`REACTOR_API_KEY`. This is the default dev configuration until B7 lands.
