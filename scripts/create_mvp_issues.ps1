# Creates MVP1 tickets (city + decade -> seeded Reactor world) on GitHub.
# Requires GH_TOKEN env var. Usage:
#   GH_TOKEN=<token> powershell -File scripts/create_mvp_issues.ps1

$repo = "gchow46/CitiesThroughTimeWorldModel"
$token = $env:GH_TOKEN
if (-not $token) { Write-Error "Set GH_TOKEN env var before running"; exit 1 }

$headers = @{
    Authorization = "Bearer $token"
    Accept        = "application/vnd.github+json"
    "User-Agent"  = "cities-through-time-setup"
}

function New-Label($name, $color, $desc) {
    try {
        Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/labels" -Headers $headers -Method Post `
            -Body (@{ name = $name; color = $color; description = $desc } | ConvertTo-Json) | Out-Null
        Write-Host "label created: $name"
    } catch {
        if ($_.Exception.Response.StatusCode.value__ -eq 422) { Write-Host "label exists: $name" }
        else { Write-Warning "label $name failed: $($_.Exception.Message)" }
    }
}

New-Label "mvp1" "d4c5f9" "MVP1 — city+decade walkable world app"
New-Label "hacker-a" "1f6feb" "Experience workstream (frontend + Reactor client)"
New-Label "hacker-b" "8250df" "World-data workstream (backend + seed pipeline)"
New-Label "integration" "fb8500" "Shared / cross-workstream"

$issues = @(
    # ---------- Integration / contract ----------
    @{ title = "[MVP-I] API contract: POST /api/world"
       labels = @("mvp1", "integration")
       body = @"
**Day-1 ticket — both hackers align on this before building.**

Request:
``````json
{ "city": "Amsterdam", "decade": 1960 }
``````

Response:
``````json
{
  "sessionToken": "<scoped JWT>",
  "model": "reactor/lingbot-world-2",
  "seedImageUrl": "https://...",
  "prompt": "Amsterdam, 1960s: trams, ...",
  "meta": { "canonicalCity": "Amsterdam, NL", "seedSource": "wikimedia", "seedYear": 1967 }
}
``````

Errors: ``404 insufficient_archival_photos``, ``400 invalid_city``, ``400 unsupported_decade``.

Done when: contract committed as ``packages/shared/api-contract.md`` + mock server returning a canned response for ``{city:'Amsterdam', decade:1960}``.
"@ },
    @{ title = "[MVP-I] E2E happy path: submit -> walking world"
       labels = @("mvp1", "integration")
       body = @"
Full loop wired end-to-end: form submit -> /api/world -> Reactor session -> WASD walking.

- Time-to-world < 30s on cache miss, < 10s on hit
- Demo matrix: 3 cities x 3 decades (e.g. Amsterdam 1960, Paris 1920, NYC 1980)
- Known-bad pairs return graceful error, not a broken session

Done when: recorded demo of all 9 matrix cells.
"@ },
    @{ title = "[MVP-I] Deploy: web + api + secrets"
       labels = @("mvp1", "integration")
       body = @"
- Web on Vercel, API on hosted runner (Railway/Fly/Modal web endpoint)
- ``REACTOR_API_KEY`` + archive API keys in env secrets, never client-side
- Staging URL + basic CI (typecheck/lint on PR)
"@ },

    # ---------- Hacker A: Experience ----------
    @{ title = "[MVP-A] Next.js scaffold + landing form (city, decade)"
       labels = @("mvp1", "hacker-a")
       body = @"
``apps/web``: Next.js app router scaffold.

- Landing: city text input + decade dropdown (1920-2020)
- Client-side validation; submit -> ``POST /api/world``
- Route to ``/world`` experience page with session payload

Done when: form submits against the mock contract server and navigates.
"@ },
    @{ title = "[MVP-A] Reactor session client"
       labels = @("mvp1", "hacker-a")
       body = @"
Connect to the world model using the token/seed/prompt from ``/api/world``.

- ``@reactor-team/js-sdk`` (or typed model SDK) -> ``main_video`` track -> ``<video>``
- Send ``set_prompt`` + seed image + ``start`` once session is ``ready``
- Handle ``statusChanged`` / ``chunk_complete`` events; surface connection state

Done when: hardcoded payload renders a live world stream.
"@ },
    @{ title = "[MVP-A] WASD + pointer-lock look controls"
       labels = @("mvp1", "hacker-a")
       body = @"
First-person controls against the stream.

- WASD -> ``move`` commands, mouse drag/pointer-lock -> ``look``
- Held-state input (not per-frame spam); commands respect chunk boundaries
- Touch fallback optional

Done when: navigation feels responsive; no command flooding.
"@ },
    @{ title = "[MVP-A] Session lifecycle UI"
       labels = @("mvp1", "hacker-a")
       body = @"
States: submitting -> sourcing photos -> seeding world -> ready -> walking; error + re-seed.

- Loading screen can show the actual seed photo being used ('Seeding from a 1967 photo of...')
- Error states: insufficient photos, session dropped, drift re-seed notice
- 'New search' exits session cleanly

Done when: every non-happy path has a defined UI state.
"@ },
    @{ title = "[MVP-A] HUD + visual polish"
       labels = @("mvp1", "hacker-a")
       body = @"
- Badge: canonical city + decade + seed photo credit/license
- Minimal chrome so the stream is the hero
- Responsive layout; keyboard hints overlay
"@ },

    # ---------- Hacker B: World data ----------
    @{ title = "[MVP-B] Token service: model-scoped Reactor JWTs"
       labels = @("mvp1", "hacker-b")
       body = @"
``apps/api``: POST /api/reactor/token.

- Server holds ``REACTOR_API_KEY``; exchange for short-lived session-scoped JWT
- Scope per model; cap session count per token
- Never expose API key to client

Done when: client can mint a token and open a session.
"@ },
    @{ title = "[MVP-B] City geocoder (Nominatim)"
       labels = @("mvp1", "hacker-b")
       body = @"
City string -> canonical name, lat/lon, bounding box.

- OpenStreetMap Nominatim API (respect usage policy; add UA header)
- Disambiguation: prefer highest-population/admin match; return ``invalid_city`` on no match
- Cache results

Done when: 'Amsterdam', 'NYC', 'New York' all resolve correctly.
"@ },
    @{ title = "[MVP-B] Seed sourcing: open photo archives"
       labels = @("mvp1", "hacker-b")
       body = @"
Query open archives for real photos matching (city bbox, decade, open license).

- Wikimedia Commons (geo + date categories), Europeana, Flickr Commons
- Filter: license allows use, date within decade (+/- tolerance), geo within bbox or city-name tagged
- Extract: image URL, date, location, author, license -> ``seed_candidates`` table

Done when: pipeline returns >=5 licensed candidates for Amsterdam 1960.
"@ },
    @{ title = "[MVP-B] Seed ranking + insufficiency fallback"
       labels = @("mvp1", "hacker-b")
       body = @"
Rank candidates and pick the session anchor.

- Score: resolution, date confidence, street-level viewpoint heuristic, license safety
- Threshold: below N quality seeds -> ``insufficient_archival_photos`` (don't seed a broken world)
- Return ranked list so re-seed can rotate anchors

Done when: ranking is deterministic + tested on sparse cities.
"@ },
    @{ title = "[MVP-B] Modal job: seed upscale/restoration"
       labels = @("mvp1", "hacker-b")
       body = @"
GPU job to make low-res archival photos seed-worthy.

- Real-ESRGAN (or equivalent) upscale/denoise on Modal
- Runs on-demand for the chosen anchor (+ pre-warm top 3)
- Restored image written to R2/S3; URL returned in /api/world response

Done when: restored seed demonstrably improves session quality on a 1920s photo.
"@ },
    @{ title = "[MVP-B] Prompt composer: decade packs x city"
       labels = @("mvp1", "hacker-b")
       body = @"
``packages/prompts``: one pack per decade (1920s-2020s).

- Era vocabulary: vehicles, signage, fashion, street furniture, film grain
- Template: ``{city}, {decade}s: <era pack>`` (+ optional regional flavor)
- Packs are data files, reviewable per era

Done when: all 11 decades have packs; Amsterdam 1960 prompt reviewed for plausibility.
"@ },
    @{ title = "[MVP-B] Cache layer: (city, decade) -> world payload"
       labels = @("mvp1", "hacker-b")
       body = @"
Avoid re-running sourcing on repeat requests.

- Cache {geocode, seed set, prompt, restored image URLs} keyed by (city, decade)
- Postgres/Supabase for metadata, R2/S3 for images
- Pre-warm demo matrix cities

Done when: repeat request returns in <2s.
"@ }
)

foreach ($i in $issues) {
    $payload = @{ title = $i.title; body = $i.body; labels = $i.labels } | ConvertTo-Json -Depth 5
    try {
        $r = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/issues" -Headers $headers -Method Post -Body $payload
        Write-Host ("#{0}: {1}" -f $r.number, $i.title)
    } catch {
        Write-Warning "FAILED: $($i.title) - $($_.Exception.Message)"
    }
}
