# MVP1 re-plan (model-flexible, no Modal):
#   1. closes the superseded MVP tickets (#19-33) with a pointer comment
#   2. labels the original roadmap tickets (#1-18) `roadmap`
#   3. creates the 16 new MVP1 tickets
# Requires GH_TOKEN env var. Usage:
#   GH_TOKEN=<token> powershell -File scripts/replan_mvp_issues.ps1

$repo = "gchow46/CitiesThroughTimeWorldModel"
$token = $env:GH_TOKEN
if (-not $token) { Write-Error "Set GH_TOKEN env var before running"; exit 1 }

$headers = @{
    Authorization = "Bearer $token"
    Accept        = "application/vnd.github+json"
    "User-Agent"  = "cities-through-time-setup"
}
$base = "https://api.github.com/repos/$repo"

function New-Label($name, $color, $desc) {
    try {
        Invoke-RestMethod -Uri "$base/labels" -Headers $headers -Method Post `
            -Body (@{ name = $name; color = $color; description = $desc } | ConvertTo-Json) | Out-Null
        Write-Host "label created: $name"
    } catch {
        if ($_.Exception.Response.StatusCode.value__ -eq 422) { Write-Host "label exists: $name" }
        else { Write-Warning "label $name failed: $($_.Exception.Message)" }
    }
}

New-Label "mvp1" "d4c5f9" "MVP1 - city+decade walkable world app"
New-Label "hacker-a" "1f6feb" "Experience workstream (frontend + Reactor adapters)"
New-Label "hacker-b" "8250df" "World-data workstream (API routes + seed pipeline)"
New-Label "integration" "fb8500" "Shared / cross-workstream"
New-Label "day-0" "e4e669" "Do first - unblocks parallel work"
New-Label "roadmap" "c5def5" "Post-MVP roadmap (Modal, VEED, GIS, splats, forecasting)"

# ---------- 1. close superseded tickets ----------
$supersededNote = "Superseded by the MVP1 re-plan (model-flexible adapter registry, no Modal). See IMPLEMENTATION_PLAN.md and the new ``mvp1`` tickets."
foreach ($n in 19..33) {
    try {
        Invoke-RestMethod -Uri "$base/issues/$n/comments" -Headers $headers -Method Post `
            -Body (@{ body = $supersededNote } | ConvertTo-Json) | Out-Null
        Invoke-RestMethod -Uri "$base/issues/$n" -Headers $headers -Method Patch `
            -Body (@{ state = "closed"; state_reason = "not_planned" } | ConvertTo-Json) | Out-Null
        Write-Host "closed #$n"
    } catch { Write-Warning "close #$n failed: $($_.Exception.Message)" }
}

# ---------- 2. label roadmap tickets ----------
foreach ($n in 1..18) {
    try {
        Invoke-RestMethod -Uri "$base/issues/$n/labels" -Headers $headers -Method Post `
            -Body (@{ labels = @("roadmap") } | ConvertTo-Json) | Out-Null
        Write-Host "labelled #$n roadmap"
    } catch { Write-Warning "label #$n failed: $($_.Exception.Message)" }
}

# ---------- 3. create new tickets ----------
$issues = @(
    # ===== Day 0-1: foundation + calibration (both) =====
    @{ title = "[I1] Repo scaffold + API contract + mock /api/world"
       labels = @("mvp1", "integration", "day-0")
       body = @"
**Unblocks both workstreams. Do first.**

- ``create-next-app`` in ``apps/web`` (App Router, TS strict), ESLint + Prettier, pnpm
- ``lib/types.ts``: ``WorldPayload``, ``SeedCandidate``, ``ErrorCode``, ``ModelId``, ``ModelCapabilities``
- ``docs/api-contract.md``: request/response/error codes for ``POST /api/world`` (see IMPLEMENTATION_PLAN.md)
- Mock ``POST /api/world`` behind ``MOCK_WORLD=1`` returning canned Amsterdam-1960 payloads for **each** registered model
- CI: typecheck + lint on PR

**Done when** both hackers can ``pnpm dev`` and hit the mock for both models.
"@ },
    @{ title = "[I2] Token route + model registry skeleton"
       labels = @("mvp1", "integration", "day-0")
       body = @"
- ``lib/reactor/registry.ts``: ``MODELS`` map + capability descriptors for ``lingbot-world-2`` and ``happy-oyster-adventure`` (adapters stubbed); ``resolveModel(req)`` = ``?model=`` -> cookie -> ``WORLD_MODEL`` env -> first registered
- ``ENABLED_MODELS`` env (comma list) gates which ids are accepted; unknown/disabled -> ``400 unsupported_model``
- ``POST /api/reactor/token {model}``: exchanges ``REACTOR_API_KEY`` at ``https://api.reactor.inc/tokens`` for a JWT scoped via ``authorization_details[].resources.models.match`` with ``constraints.max_sessions: 2``
- Tests: key never appears in any response; token for model X is rejected when opening model Y

**Done when** a token opens a session on both models.
"@ },
    @{ title = "[I3] Model calibration spike: LingBot World 2 vs Happy Oyster (timeboxed 3h, pair)"
       labels = @("mvp1", "integration", "day-0")
       body = @"
Same Amsterdam 1960s photo + same prompt on both models. **Both remain enabled** - this picks the default and records per-model tuning, it does not eliminate a model.

Score:
- (a) seed fidelity at t=0
- (b) fidelity after 60s WASD walk
- (c) latency to first frame
- (d) drift recovery (``triggerKvCacheReset`` vs ``attachWorld`` re-attach)
- (e) session cost

Record clips.

**Output**: ``docs/adr/001-world-models.md`` with per-model strengths, the ``WORLD_MODEL`` default, and any per-model prompt suffixes for B8.
"@ },

    # ===== Hacker A: experience =====
    @{ title = "[A1] Landing form: city + decade"
       labels = @("mvp1", "hacker-a")
       body = @"
- City text input (debounced Nominatim autocomplete optional), decade ``<select>`` 1900-2020
- Client validation; submit -> ``POST /api/world`` (forward ``?model=`` if present) -> route to ``/world`` with payload in a store
- Every error code renders a specific message: ``invalid_city``, ``unsupported_decade``, ``unsupported_model``, ``insufficient_archival_photos`` (show ``closestDecade`` hint), ``rate_limited``, ``upstream_failed``

Depends on: I1 (mock).
"@ },
    @{ title = "[A2] WorldModelAdapter interface + LingBot + Happy Oyster implementations"
       labels = @("mvp1", "hacker-a")
       body = @"
``lib/reactor/adapter.ts`` interface (see IMPLEMENTATION_PLAN.md): ``connect``, ``seed``, ``start``, ``setMove``, ``setLook``, ``reseed``, ``dispose``, ``on``; ``caps: ModelCapabilities``.

- ``lingbot.ts``: fetch seed URL -> Blob -> ``uploadFile`` -> ``setImage`` -> ``setPrompt`` -> ``start``; ``reseed`` via ``triggerKvCacheReset`` or ``reset``+``setImage`` per caps; held-state ``setMovement``/``setLookHorizontal``/``setLookVertical``
- ``happyOyster.ts``: ``createWorld({prompt, first_frame_image_url, perspective:'first_person'})`` or ``attachWorld`` when ``modelState.encryptedWorldId`` present -> ``startTravel``; persist new id via ``PATCH /api/world/cache``; ``move``/``look``/``stop``
- Adapter **contract test suite** run against a fake adapter so future adapters inherit the same tests

**Done when** switching ``WORLD_MODEL`` or ``?model=`` requires zero UI changes.
Depends on: I2.
"@ },
    @{ title = "[A3] Video surface + normalized WASD / pointer-lock controls"
       labels = @("mvp1", "hacker-a")
       body = @"
- ``<video>`` bound to the model's video track
- Pointer-lock on click; Escape exits
- WASD -> ``MoveDir`` held state (``forward|back|left|right|fl|fr|bl|br``); mouse delta -> ``LookDir`` with dead-zone
- **One command per state change** - no per-frame spam, ignore key repeats; release -> idle/stop
- ``lib/reactor/controls.ts``: per-model mapping tables (``setMovement('forward')`` vs ``move('Front')``)
- Stretch: on-screen touch d-pad

Depends on: A2.
"@ },
    @{ title = "[A4] Session lifecycle state machine"
       labels = @("mvp1", "hacker-a")
       body = @"
States: ``idle -> requesting -> sourcing -> seeding -> ready -> walking -> (reseeding | error | ended)``

- Loading screen shows the actual seed thumbnail + credit while the model warms
- Handles ``command_error``, disconnect, token expiry (re-mint via ``/api/reactor/token`` for the **current** model)
- "New search" teardown always calls ``dispose()`` - no dangling Reactor sessions

Depends on: A1, A2.
"@ },
    @{ title = "[A5] Streamed progress UX + dev panel (model switcher)"
       labels = @("mvp1", "hacker-a")
       body = @"
- Consume NDJSON progress from ``/api/world``: "Searching Wikimedia... 12 found -> ranking -> preparing image -> opening world"; spinner fallback
- ``?dev=1`` panel: current model id + caps, chunk index, session status, and a **model switcher** that re-requests ``/api/world`` with the other enabled model (sets cookie so it sticks)

Depends on: A4, B7 (real stream; mock can emit fake stages earlier).
"@ },
    @{ title = "[A6] HUD, capability-aware actions, credits + polish"
       labels = @("mvp1", "hacker-a")
       body = @"
- Badge: canonical city + decade; seed credit + license link (required for CC-BY); low-confidence badge for Google CSE seeds
- "Re-seed" rotates ``alternates``; behaviour follows ``caps.driftReset``
- Hot-prompt "atmosphere" chips rendered only when ``caps.supportsHotPrompt``
- Keyboard hints, responsive layout, reduced-motion respect, OG/meta

Depends on: A4.
"@ },

    # ===== Hacker B: world data =====
    @{ title = "[B1] City geocoder (Nominatim)"
       labels = @("mvp1", "hacker-b")
       body = @"
``lib/geocode.ts``: Nominatim ``search?format=jsonv2`` with custom UA + 1 req/s throttle (usage policy), prefer city/town by ``importance``.

- Returns ``{canonicalName, countryCode, bbox, lat, lon}`` or ``invalid_city``
- Redis cache 30d keyed by normalized input
- Tests: "Amsterdam", "NYC", "New York", "Springfield" (ambiguous -> best guess + ``meta.ambiguous``)
"@ },
    @{ title = "[B2] SeedSource interface + Wikimedia Commons source"
       labels = @("mvp1", "hacker-b")
       body = @"
``lib/sources/``: ``SeedSource.search({bbox, cityName, countryCode, decade}) -> SeedCandidate[]``.

Wikimedia Commons:
- File-namespace search for ``"{city}" {decade}s`` + ``geosearch`` within bbox
- ``imageinfo`` + ``extmetadata`` (DateTimeOriginal, LicenseShortName, Artist)
- Filter: license allowlist (PD, CC0, CC-BY, CC-BY-SA); date within ``[decade, decade+9]`` +/-2; >= 800px wide; croppable to 16:9
- Recorded HTTP fixtures (msw) for tests
"@ },
    @{ title = "[B3] Europeana + Flickr Commons sources"
       labels = @("mvp1", "hacker-b")
       body = @"
- Europeana Search API: ``reusability:open``, ``TYPE:IMAGE``, year range, place/text query
- Flickr ``photos.search``: ``license=7,9,10``, ``min/max_taken_date``, bbox or text
- Same ``SeedCandidate`` shape; **per-source timeout + error isolation** so one failing API never fails the request

Depends on: B2.
"@ },
    @{ title = "[B4] Google Custom Search fallback"
       labels = @("mvp1", "hacker-b")
       body = @"
Programmable Search JSON API, ``searchType=image``, ``rights=cc_publicdomain|cc_attribute|cc_sharealike``, ``imgSize=large``, ``q="{city} {decade}s street photo"``.

- Only invoked when archive candidates ``< MIN_CANDIDATES``
- Candidates tagged ``licenseConfidence:'low'``; never rank above archive results
- Quota logging (100/day free); feature-flag off if key missing

Depends on: B2.
"@ },
    @{ title = "[B5] Seed ranking + insufficiency fallback"
       labels = @("mvp1", "hacker-b")
       body = @"
``lib/ranking.ts`` deterministic score:
- date confidence (exact year > decade tag > inferred)
- resolution
- aspect proximity to 16:9 - **hard penalty on portrait** (strictest model needs 1.5-2.0)
- street-level heuristic: Commons categories (``Streets in {city}``), keywords (street/square/canal/avenue/tram); penalize aerial/maps/documents/interiors/portraits
- license confidence, source tier (archives > CSE)

Threshold: best ``< MIN_SCORE`` or count ``< 1`` -> ``insufficient_archival_photos`` with ``closestDecade`` hint (probe adjacent decades cheaply).

Golden tests on fixtures: Amsterdam 1960, Paris 1920, Lagos 1950 (sparse).
Depends on: B2.
"@ },
    @{ title = "[B6] Model-agnostic image normalization + Blob upload"
       labels = @("mvp1", "hacker-b")
       body = @"
``lib/image.ts``:
- Fetch original with 15MB cap + content-type check
- ``sharp``: EXIF-rotate, smart-crop (attention/entropy) to 16:9, resize 1280x720, strip metadata, JPEG q85; plus 320px thumbnail
- Upload to Vercel Blob, content-addressed: ``seeds/{citySlug}/{decade}/{hash}.jpg`` (idempotent re-runs)
- Assert output aspect satisfies **every registered model's** ``caps.seedAspect``

Output is a public URL (works directly for Happy Oyster; LingBot adapter fetches it into a Blob for upload).
"@ },
    @{ title = "[B7] /api/world orchestrator + model-aware cache + NDJSON progress"
       labels = @("mvp1", "hacker-b")
       body = @"
Wire B1-B6 + B8 + token mint:
1. validate; ``resolveModel()``; Upstash rate-limit 10/min/IP
2. shared cache ``world:{citySlug}:{decade}`` -> on hit load ``world:{citySlug}:{decade}:{modelId}`` state, mint token, return (< 2s)
3. geocode -> sources in parallel (6s each) -> CSE fallback -> rank -> normalize top 4 -> Blob
4. compose prompt (consults ``caps``) -> mint token -> write cache -> return

- ``PATCH /api/world/cache`` stores per-model state (e.g. ``encryptedWorldId``)
- Per-key lock against thundering herd
- NDJSON progress stream ``{stage, detail}``; final line is the ``WorldPayload``
- ``pnpm seed:dry --city Amsterdam --decade 1960`` CLI for testing without the UI

Budget: <= 25s cold, <= 2s warm.
Depends on: B1-B6, B8, I2.
"@ },
    @{ title = "[B8] Prompt composer + decade packs (1900s-2020s)"
       labels = @("mvp1", "hacker-b")
       body = @"
``lib/prompts/decades/*.json`` per decade: vehicles, signage, clothing, street furniture, film stock/grain, colour vs B&W bias.

- ``compose(city, country, decade, seed, caps)`` -> prompt within the model's limit (HO: 2000 chars) that references the seed ("continue this street scene, keep the architecture and period vehicles")
- Country flavour table for demo set: NL, FR, US, UK, JP
- Optional per-model suffix table populated from I3 findings
- Review pass on Amsterdam 1960 / Paris 1920 / New York 1980 prompts
"@ },

    # ===== Final stretch (both) =====
    @{ title = "[I4] E2E + demo matrix on both models"
       labels = @("mvp1", "integration")
       body = @"
- Playwright with a **fake adapter registered in the registry** (proves the extension point): landing -> ``walking`` state; each error code renders distinct UI
- Manual matrix, recorded, **on both models**: Amsterdam 1960, Paris 1920, New York 1980, Tokyo 1970, Lagos 1950 (expect 404 + closestDecade)
- Time-to-world logged per cell; ``?model=`` switch must not re-run sourcing

Depends on: A6, B7.
"@ },
    @{ title = "[I5] Production hardening + deploy"
       labels = @("mvp1", "integration")
       body = @"
- Vercel project; env secrets (``REACTOR_API_KEY``, ``GOOGLE_CSE_*``, ``EUROPEANA_KEY``, ``FLICKR_KEY``, ``BLOB_READ_WRITE_TOKEN``, ``UPSTASH_*``, ``WORLD_MODEL``, ``ENABLED_MODELS``)
- Vercel Blob + Upstash Redis provisioned
- pino structured logging with request id + model id; error tracking; stage-timing analytics
- ``SECURITY.md``: Reactor key is server-only
- Pre-warm script for demo matrix (shared sourcing once, per-model state for each enabled model)
- README: run/deploy + ``docs/adding-a-model.md``

Depends on: I4.
"@ }
)

foreach ($i in $issues) {
    $payload = @{ title = $i.title; body = $i.body; labels = $i.labels } | ConvertTo-Json -Depth 5
    try {
        $r = Invoke-RestMethod -Uri "$base/issues" -Headers $headers -Method Post -Body $payload
        Write-Host ("#{0}: {1}" -f $r.number, $i.title)
    } catch {
        Write-Warning "FAILED: $($i.title) - $($_.Exception.Message)"
    }
}
