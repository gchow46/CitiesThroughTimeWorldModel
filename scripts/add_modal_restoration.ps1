# Re-adds Modal to MVP1 as a GPU restoration service:
#   1. creates ticket [B9] Modal restoration endpoint
#   2. patches #48 (B6), #49 (B7), #52 (I5) bodies to call/configure it
# Requires GH_TOKEN env var.

$repo = "gchow46/CitiesThroughTimeWorldModel"
$token = $env:GH_TOKEN
if (-not $token) { Write-Error "Set GH_TOKEN env var before running"; exit 1 }

$headers = @{
    Authorization = "Bearer $token"
    Accept        = "application/vnd.github+json"
    "User-Agent"  = "cities-through-time-setup"
}
$base = "https://api.github.com/repos/$repo"

function Patch-Issue($n, $body) {
    Invoke-RestMethod -Uri "$base/issues/$n" -Headers $headers -Method Patch `
        -Body (@{ body = $body } | ConvertTo-Json -Depth 3) | Out-Null
    Write-Host "patched #$n"
}

# ---------- 1. new ticket ----------
$b9 = @{
    title  = "[B9] Modal GPU restoration endpoint (Real-ESRGAN)"
    labels = @("mvp1", "hacker-b")
    body   = @"
Modal app in ``services/restore/`` exposing a web endpoint that upscales/denoises archival seed photos so they seed the world model well.

- ``@app.function(gpu="A10G", ...)`` + ``@modal.web_endpoint(method="POST")``: input ``{imageUrl, targetWidth: 1280}`` -> output ``{restoredUrl, ms}``
- Real-ESRGAN (x4plus or general-x4v3) with face-enhance off; optional light denoise for scans; weights baked into the image at build time
- Writes output to Vercel Blob (or returns bytes for B6 to upload); content-addressed by input hash so re-runs are free
- Auth: shared secret header ``X-Restore-Key`` from Modal secrets; reject unauthenticated calls
- ``keep_warm=1`` during demo; scale to zero otherwise
- ``modal deploy`` + ``modal run services/restore/smoke.py --url <img>`` smoke test
- Budget: <= 8s p50 for a 1000px input incl. cold start amortised

**Done when** B6 can call it and a 1920s scan comes back sharper at 1280x720 than the sharp-only path.
"@
}
$r = Invoke-RestMethod -Uri "$base/issues" -Headers $headers -Method Post `
    -Body ($b9 | ConvertTo-Json -Depth 5)
$b9Num = $r.number
Write-Host "#$($b9Num): $($b9.title)"

# ---------- 2. patch existing tickets ----------
Patch-Issue 48 @"
``lib/image.ts`` - normalization that works for **every** registered model, with Modal doing the GPU part.

- Fetch original with 15MB cap + content-type check
- If ``RESTORE_ENDPOINT`` is set and the source is below ``targetWidth`` (or flagged as a scan): call the Modal restoration endpoint (#$b9Num) with a 10s timeout; **fall back to sharp-only on any failure** so Modal is never on the critical failure path
- ``sharp``: EXIF-rotate, smart-crop (attention/entropy) to 16:9, resize 1280x720, strip metadata, JPEG q85; plus 320px thumbnail
- Upload to Vercel Blob, content-addressed: ``seeds/{citySlug}/{decade}/{hash}.jpg`` (idempotent re-runs)
- Assert output aspect satisfies **every registered model's** ``caps.seedAspect``
- Record ``seed.restored: boolean`` in the payload for the HUD/dev panel

Output is a public URL (works directly for Happy Oyster; LingBot adapter fetches it into a Blob for upload).
Depends on: #$b9Num (soft - sharp-only path must work without it).
"@

Patch-Issue 49 @"
Wire B1-B6 + B8 + token mint:
1. validate; ``resolveModel()``; Upstash rate-limit 10/min/IP
2. shared cache ``world:{citySlug}:{decade}`` -> on hit load ``world:{citySlug}:{decade}:{modelId}`` state, mint token, return (< 2s)
3. geocode -> sources in parallel (6s each) -> CSE fallback -> rank -> **restore + normalize top 4 in parallel** (B6, Modal calls concurrent) -> Blob
4. compose prompt (consults ``caps``) -> mint token -> write cache -> return

- ``PATCH /api/world/cache`` stores per-model state (e.g. ``encryptedWorldId``)
- Per-key lock against thundering herd
- NDJSON progress stream ``{stage, detail}`` including a ``restoring`` stage; final line is the ``WorldPayload``
- ``pnpm seed:dry --city Amsterdam --decade 1960 [--no-restore]`` CLI for testing without the UI

Budget: <= 30s cold (incl. restoration), <= 2s warm.
Depends on: B1-B6, B8, I2.
"@

Patch-Issue 52 @"
- Vercel project; env secrets (``REACTOR_API_KEY``, ``GOOGLE_CSE_*``, ``EUROPEANA_KEY``, ``FLICKR_KEY``, ``BLOB_READ_WRITE_TOKEN``, ``UPSTASH_*``, ``WORLD_MODEL``, ``ENABLED_MODELS``, ``RESTORE_ENDPOINT``, ``RESTORE_KEY``)
- Vercel Blob + Upstash Redis provisioned
- **Modal**: ``modal deploy services/restore`` from CI on main; ``RESTORE_KEY`` + ``BLOB_READ_WRITE_TOKEN`` in Modal secrets; GPU spend alert
- pino structured logging with request id + model id + ``restored`` flag; error tracking; stage-timing analytics (incl. Modal latency)
- ``SECURITY.md``: Reactor key and restore key are server-only
- Pre-warm script for demo matrix (shared sourcing + restoration once, per-model state for each enabled model)
- README: run/deploy + ``docs/adding-a-model.md``

Depends on: I4.
"@
