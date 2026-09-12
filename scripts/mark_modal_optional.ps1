# Marks the Modal restoration ticket (#53) as optional for MVP1.
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

try {
    Invoke-RestMethod -Uri "$base/labels" -Headers $headers -Method Post `
        -Body (@{ name = "optional"; color = "ededed"; description = "Not required for MVP1 to ship" } | ConvertTo-Json) | Out-Null
    Write-Host "label created: optional"
} catch {
    if ($_.Exception.Response.StatusCode.value__ -eq 422) { Write-Host "label exists: optional" } else { throw }
}

$body = @"
**Optional for MVP1.** The app must ship and demo with ``RESTORE_ENDPOINT`` unset (sharp-only path in B6). Pick this up when B1-B8 are green or if 1920s-1940s seeds look too soft to demo.

Modal app in ``services/restore/`` exposing a web endpoint that upscales/denoises archival seed photos so they seed the world model well.

- ``@app.function(gpu="A10G", ...)`` + ``@modal.web_endpoint(method="POST")``: input ``{imageUrl, targetWidth: 1280}`` -> output ``{restoredUrl, ms}``
- Real-ESRGAN (x4plus or general-x4v3) with face-enhance off; optional light denoise for scans; weights baked into the image at build time
- Writes output to Vercel Blob (or returns bytes for B6 to upload); content-addressed by input hash so re-runs are free
- Auth: shared secret header ``X-Restore-Key`` from Modal secrets; reject unauthenticated calls
- ``keep_warm=1`` during demo; scale to zero otherwise
- ``modal deploy`` + ``modal run services/restore/smoke.py --url <img>`` smoke test
- Budget: <= 8s p50 for a 1000px input incl. cold start amortised

**Done when** B6 can call it and a 1920s scan comes back sharper at 1280x720 than the sharp-only path - and ``/api/world`` still succeeds with the endpoint unset or down.
"@

Invoke-RestMethod -Uri "$base/issues/53" -Headers $headers -Method Patch `
    -Body (@{ title = "[B9][optional] Modal GPU restoration endpoint (Real-ESRGAN)"; body = $body; labels = @("mvp1", "hacker-b", "optional") } | ConvertTo-Json -Depth 3) | Out-Null
Write-Host "patched #53 as optional"
