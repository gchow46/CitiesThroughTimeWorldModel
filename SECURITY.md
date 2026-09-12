# Security

## Secrets model

- `REACTOR_API_KEY` is **server-only**. It lives in env vars (Vercel env /
  `apps/web/.env.local`) and is sent only to `https://api.reactor.inc/tokens`
  in the `Reactor-API-Key` header. It must never:
  - get a `NEXT_PUBLIC_` prefix,
  - appear in a response body, log line, or URL,
  - be committed to the repo (`*.env*` is gitignored except `.env.example`).
- Browsers receive short-lived **session-scoped JWTs** minted by
  `POST /api/reactor/token` (`type:"session"`, `resources.models.match`,
  `max_sessions: 2`, ≤6h). A leaked JWT can only operate its own sessions on
  the one model it was minted for.
- `MOCK_WORLD=1` / `MOCK_TOKEN=1` must never be set in production — they
  bypass real auth.
- The token route and `/api/world` enforce `ENABLED_MODELS` so disabled model
  ids are rejected with `400 unsupported_model` without a code deploy.

## Other secrets

`GOOGLE_CSE_KEY`, `GOOGLE_CSE_CX`, `EUROPEANA_KEY`, `FLICKR_KEY`,
`BLOB_READ_WRITE_TOKEN`, `UPSTASH_*`, `RESTORE_KEY` — server-only, same rules.

## Then & Now / Google Maps

- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is **intentionally browser-visible** — it
  is not a secret like `REACTOR_API_KEY`. It must be secured with Google
  Cloud application restrictions (exact website referrers; never
  `*.vercel.app`) and API restrictions (Maps JavaScript API only). Never
  reuse `GOOGLE_CSE_KEY` for this purpose.
- `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` is a public identifier, not a secret.
- `NEXT_PUBLIC_ENABLE_THEN_NOW` is a build-time flag embedded in the bundle.
  The operator-controlled incident stop is disabling the key/API in Google
  Cloud, not the flag.
- `NEXT_PUBLIC_COMPARISON_DRIVER=fake` is a development/preview escape that
  selects a deterministic fake driver with no Google network access. It must
  never be set in production.
- The comparison driver never receives a Reactor session token, and no
  Google data (imagery, pano IDs/metadata, user-selected points) is persisted
  to Redis, Blob, storage, or any dataset.
- Loader/service failures are normalized to stable reasons
  (`no-coverage|timeout|configuration|network|quota`); raw provider error
  text is never reflected to the UI.

## Data handling

- Seed images are re-encoded through sharp (metadata stripped) before
  storage; source URLs are fetched with a 15MB cap and content-type
  allowlist.
- Error responses never echo upstream messages verbatim; clients get stable
  error codes.
- Rate limiting: 10 req/min/IP on `/api/world`.

## Reporting

Open a GitHub issue (no exploit details) or contact the maintainers directly.
