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

## Data handling

- Seed images are re-encoded through sharp (metadata stripped) before
  storage; source URLs are fetched with a 15MB cap and content-type
  allowlist.
- Error responses never echo upstream messages verbatim; clients get stable
  error codes.
- Rate limiting: 10 req/min/IP on `/api/world`.

## Reporting

Open a GitHub issue (no exploit details) or contact the maintainers directly.
