# Creates phase labels + implementation-plan issues on GitHub via REST API.
# Token is pulled from Git Credential Manager (same credential used by git push).
# Usage: pwsh scripts/create_issues.ps1

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

New-Label "phase-0" "e99695" "Phase 0 — de-risking spike"
New-Label "phase-1" "f9d0c4" "Phase 1 — data pipeline (Modal)"
New-Label "phase-2" "fef2c0" "Phase 2 — world generation layer"
New-Label "phase-3" "c2e0c6" "Phase 3 — MVP1 frontend"
New-Label "phase-4" "bfdadc" "Phase 4+ — post-MVP roadmap"

$issues = @(
    @{ title = "[P0] Scaffold Reactor app + token-mint endpoint"
       labels = @("phase-0")
       body = @"
Scaffold the app with ``create-reactor-app`` and stand up the server-side token exchange.

- Server holds ``REACTOR_API_KEY``; POST to ``api.reactor.inc/tokens`` returns a session-scoped JWT
- Browser receives only the JWT; scope token per model (``reactor/lingbot-world-2`` or ``reactor/happy-oyster``)
- Token TTL <= 6h; mint per model

Done when: a local page connects to a Reactor model and renders the video track.
"@ },
    @{ title = "[P0] Curate seed set: 1 district x 1 era (~50 images)"
       labels = @("phase-0")
       body = @"
Hand-curate 20-50 seed images for one neighborhood (Jordaan or Dam Square) and one era (suggest 1968).

- Street-level viewpoints, variety of angles/weather
- Record source + license per image (Stadsarchief, personal archive, etc.)
- Note lat/lon + heading where known

Done when: seed folder + manifest.csv committed under pipelines/seed_sets/.
"@ },
    @{ title = "[P0] Walkthrough spike: quality, drift, and session cost eval"
       labels = @("phase-0")
       body = @"
Seed a Reactor session with the curated set; evaluate whether it feels like walking Amsterdam.

- Measure: visual fidelity vs. source photos, world drift over 2+ min walks, cost per session
- Test ``set_prompt`` mid-session for era/atmosphere swaps
- Capture screen recordings for review

Done when: findings doc written; go/no-go on generative-first MVP.
"@ },
    @{ title = "[P1] Ingestion: Street View Static + Places photos (Modal)"
       labels = @("phase-1")
       body = @"
Scheduled Modal function to pull licensed Google imagery for target districts.

- Street View Static API per street segment (lat/lon grid + headings)
- Places API photos for POIs
- Store raw images to R2/S3, metadata to Postgres ``photos`` table
- Respect API quotas; budget tracking

Done when: a district can be bulk-ingested on a schedule.
"@ },
    @{ title = "[P1] Ingestion: Stadsarchief Beeldbank + Mapillary historical photos"
       labels = @("phase-1")
       body = @"
Historical photo ingestion for pre-2000s eras.

- Amsterdam City Archives / Beeldbank API (dated, geocoded archival photos)
- Mapillary as open supplementary source
- Capture archive metadata (date, location, photographer, license)

Done when: 1960s-80s photo corpus per district stored + indexed.
"@ },
    @{ title = "[P1] Era classification pipeline"
       labels = @("phase-1")
       body = @"
Assign each ingested photo to a decade bucket.

- Metadata-first: use archive dates where present
- Vision-model fallback for undated images (CLIP-style dating classifier) on Modal batch GPU
- Confidence score per assignment; low-confidence goes to manual review queue

Done when: every photo has era + confidence in Postgres.
"@ },
    @{ title = "[P1] Archival photo restoration / upscaling"
       labels = @("phase-1")
       body = @"
GPU job on Modal to make archival photos usable as Reactor seed images.

- Real-ESRGAN / SUPIR upscale + denoise + deblur
- Output alongside originals; link in DB
- Batch over the seed candidate pool only (not the whole corpus)

Done when: restored seeds pass a visual quality bar for seeding sessions.
"@ },
    @{ title = "[P1] Geocoding + seed-node street graph + storage schema"
       labels = @("phase-1")
       body = @"
Normalize all photos to lat/lon + camera heading and build the traversal graph.

- Postgres schema: ``photos``, ``districts``, ``eras``, ``seed_nodes``
- Seed node = (lat, lon, heading) -> ranked candidate images per era
- R2/S3 bucket layout conventions documented

Done when: query 'give me best seeds for district X, era Y' returns a ranked list.
"@ },
    @{ title = "[P2] Seed registry: per-(district, era) anchor selection"
       labels = @("phase-2")
       body = @"
Ranking layer over seed_nodes that picks anchor images for Reactor sessions.

- Score by restoration quality, viewpoint coverage, era confidence
- Support N anchors per district for re-seeding
- API endpoint consumed by session service

Done when: session service can request seeds by (district, era).
"@ },
    @{ title = "[P2] Session service: lifecycle, drift detection, re-seed"
       labels = @("phase-2")
       body = @"
Backend managing Reactor sessions for end users.

- Mint tokens, open/close sessions, enforce session caps
- Drift detection: periodically compare current frames to district anchors; re-seed on divergence
- Graceful handoff between districts (teleport boundary)

Done when: user can walk a district for N minutes with automatic drift recovery.
"@ },
    @{ title = "[P2] Era prompt packs (1960s/70s/80s Amsterdam)"
       labels = @("phase-2")
       body = @"
Curated prompt library per decade, stored in packages/prompts/.

- Per era: vehicles, signage, fashion, street furniture, atmosphere
- Composable modifiers (weather, time of day)
- Versioned + reviewable; tested against seed set for plausibility

Done when: each supported era has a reviewed prompt pack.
"@ },
    @{ title = "[P2] VEED reporter pipeline + location trigger zones"
       labels = @("phase-2")
       body = @"
Pre-generate 'news reporter' clips per location zone via VEED avatars.

- Script per (district, era): period-accurate news hooks (e.g. Provo riots, Dam Square 1970)
- Geofenced trigger zones in seed graph metadata
- Picture-in-picture asset format for the frontend

Done when: entering a trigger zone plays the correct era/district clip.
"@ },
    @{ title = "[P3] Next.js frontend: Reactor stream + WASD/look controls"
       labels = @("phase-3")
       body = @"
Core experience shell in apps/web.

- Reactor JS SDK -> video element; attach main_video track
- Wire WASD + mouse look to move/look commands (held state, not per-frame)
- Handle chunk-boundary command semantics; status UI for session state

Done when: user can walk a seeded world in the browser.
"@ },
    @{ title = "[P3] Era slider + district picker + minimap"
       labels = @("phase-3")
       body = @"
Navigation UI over the world stream.

- Era slider (1960s/70s/80s) -> triggers session re-seed with new era
- District picker / teleport map (static SVG minimap for MVP)
- Loading/re-seed states surfaced clearly

Done when: user can switch era and district without a page reload.
"@ },
    @{ title = "[P3] VEED overlay + era ambient audio"
       labels = @("phase-3")
       body = @"
Presentation layer for narration and atmosphere.

- PiP overlay for reporter clips, tied to trigger zones
- Era-appropriate ambient street audio (tram bells, period music distance)
- Mute/dismiss controls

Done when: MVP1 experience is complete end-to-end.
"@ },
    @{ title = "[P4] GIS ingestion (PDOK/BAG) + street geometry alignment"
       labels = @("phase-4")
       body = @"
Ground-truth geometry for the generated world.

- Ingest BAG building footprints + street geometry via PDOK
- Align seed graph to real street layout
- Real minimap from GIS tiles instead of static SVG
"@ },
    @{ title = "[P4] Splat reconstruction for persistent streets"
       labels = @("phase-4")
       body = @"
Convert generated traversals into persistent geometry on Modal GPUs.

- Capture traversal frames -> 3D Gaussian Splat reconstruction
- Cache splats as the 'canon' street; generative layer fills gaps
- Anchor hero landmarks where drift is unacceptable
"@ },
    @{ title = "[P4] 'Amsterdam 2035' forecast era"
       labels = @("phase-4")
       body = @"
Speculative future era built from policy/climate data.

- Prompt pack informed by known plans (car-free center, climate adaptation)
- Generate future seed imagery; flag clearly as speculative in UI
- Optional overlays: sea-level, density scenarios
"@ }
)

foreach ($i in $issues) {
    $payload = @{ title = $i.title; body = $i.body; labels = $i.labels } | ConvertTo-Json -Depth 5
    try {
        $r = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/issues" -Headers $headers -Method Post -Body $payload
        Write-Host ("#{0}: {1}" -f $r.number, $i.title)
    } catch {
        Write-Warning "FAILED: $($i.title) — $($_.Exception.Message)"
    }
}
