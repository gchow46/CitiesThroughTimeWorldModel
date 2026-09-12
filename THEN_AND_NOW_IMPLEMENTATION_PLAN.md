# Cities Through Time — Then & Now extension

**Status:** Design and implementation proposal; no application changes made by this plan.

**Research date:** 12 September 2026.

**Baseline:** The implemented MVP1 in [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md). This is an additive extension, not a replacement.

**Delivery model:** Two hackers working in parallel, with one small contract-first handoff and exclusive file ownership.

## 1. Recommendation and product promise

Add a **Then & Now** experience to `/world`:

- **Left:** the existing Reactor-generated historical world, with its selected decade, archive credit, and WASD/mouse controls.
- **Right:** interactive Google Street View showing the best available contemporary comparison at the historical seed photograph's location.
- **Circular location widget:** a compact, north-up Google map identifying the archival reference point and the current Street View camera, with a heading indicator and an expand action.

Use the **Maps JavaScript API** for both `StreetViewPanorama` and `Map`, and `StreetViewService` for coverage, panorama selection, location, and imagery-date metadata. Keep the existing Nominatim city geocoder. Do not add Google Places, Google Geocoding, Street View Static, or a new backend service for the first release.

### Two limitations that must be explicit

1. **“Now” is recorded imagery, not live video.** Label the pane **“Present-day reference · Google Street View”**, accompanied by **“Captured MMM YYYY”** when available. Otherwise show **“Capture date unavailable.”** Do not substitute the current year or promise the newest photograph in Google's entire collection: a nearest/best panorama query has no documented latest-date selector. Imagery can be several years old.
2. **The generated world has no geographic camera pose.** The current Reactor adapter contract exposes movement commands and stream/session events, not latitude/longitude, world-space translation, or a calibrated heading. A held W key cannot reliably be converted into meters on a map. This release compares a **historical starting location**, then allows independent exploration. It does not claim continuous geographic synchronization.

**Release promise:** “Explore an AI interpretation of this historic scene beside available Street View imagery of its documented location.” Use weaker copy when the location is approximate. A city-center panorama is never presented as the same photographed street.

**If continuous same-location comparison while walking is mandatory:** treat section 12 as a prerequisite research track. The first release below is not a substitute for that capability; Google APIs alone cannot supply missing Reactor localization.

## 2. What the implemented project already provides

These observations come from the current working tree, including existing local modifications; implementation should preserve those changes.

| Existing area                                                 | Relevant behavior                                                                                                    | Extension seam                                                                                 |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `apps/web/components/journey-experience.tsx`                  | Landing and `/world` composition; switches to a single large viewport while walking                                  | Wrap the existing viewport in a comparison layout; do not replace the journey/session flow     |
| `components/world-viewport.tsx`, `world-hud.tsx`              | Stable video element, historical poster, controls overlay, credits and re-seed action                                | Keep historical rendering and attribution in the left pane; scope its overlay to that pane     |
| `hooks/use-world-controls.ts`                                 | Keyboard events scoped to the control element; document-level pointer-lock mouse events; releases held state on blur | Add explicit input ownership for historical pane versus Street View, map, divider, and dialogs |
| `components/world-provider.tsx`, `hooks/use-world-session.ts` | In-memory session, video registration, token refresh, disposal, seed rotation and model switching                    | Comparison has a separate lifecycle and watches the active seed, not Reactor chunks            |
| `lib/reactor/client/adapter.ts`                               | No geographic position or absolute camera-heading event                                                              | No movement mirroring or fake geographic marker for the generated camera                       |
| `lib/geocode.ts`                                              | Nominatim returns city center and bbox as `lat`/`lon`; currently retained server-side                                | Expose optional city context, converting `lon` to `lng` once at the API boundary               |
| `lib/types.ts`                                                | `SeedCandidate` and `Seed` contain archive metadata but no location                                                  | Add optional, evidence-bearing per-seed location metadata                                      |
| `lib/sources/wikimedia.ts`                                    | Uses a city-centered geosearch, but its returned candidate objects retain no coordinates                             | Preserve coordinates of the individual photo, not the geosearch center                         |
| `lib/sources/flickr.ts`, `europeana.ts`                       | No location metadata retained; Flickr does not request `geo` extras                                                  | Enrich conservatively; missing or ambiguous metadata remains unknown                           |
| `lib/image.ts`                                                | Re-encodes/normalizes to 16:9 and explicitly constructs a new `Seed`                                                 | Carry structured location through normalization; do not depend on EXIF surviving sharp         |
| `lib/orchestrate.ts`                                          | Shared seed cache and separate per-model state; geocodes before checking shared cache                                | Add optional city context on cold and warm responses; preserve sourcing reuse                  |
| `lib/frontend-types.ts`, `lib/world-client.ts`                | Separate presentation contract and explicit response normalization                                                   | Both must preserve the new optional fields for JSON and NDJSON responses                       |
| Vitest and Playwright                                         | Existing backend, compatibility, controls and frontend tests; local and backend mocks                                | Add deterministic Google-driver tests and comparison E2E without credentials                   |

There is currently no Google Maps dependency. Keep Next.js 15, React 19, pnpm, the root lockfile, both Reactor models, and the optional Modal path.

## 3. Google API research and selection

### 3.1 Options

| Option                                                    | Strengths                                                                                                                    | Limitations for this feature                                                                                                                                               | Decision                                                                  |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **Maps JavaScript API: Street View + map**                | Interactive panorama, programmatic position/POV, navigation events, native map markers, coverage lookup and imagery metadata | Metered panorama/map loads; browser key and billing needed; attribution and lifecycle require care                                                                         | **Recommended** [1–4]                                                     |
| **Maps Embed API, `streetview` mode**                     | Simple interactive iframe; Embed has unlimited no-charge usage on the current global price list                              | Cross-origin iframe offers no documented parent API for continuous position/heading events; cannot reliably drive the mini-map from user navigation; minimum 200×200 embed | Good independent low-cost prototype, not the integrated experience [5, 7] |
| **Street View Static API**                                | Simple fixed image; metadata endpoint can check availability and date without an imagery charge                              | Not navigable; separate request when image/view changes; requires additional integration; important EEA restriction with maps                                              | Not in MVP1.1, including as an automatic fallback [6, 10]                 |
| **Maps Static API**                                       | Lightweight static map                                                                                                       | Repeated image requests to follow the camera; poor manual correction/heading interaction; circular cropping still has attribution constraints                              | Not selected                                                              |
| **Map Tiles API / Street View Tiles / photorealistic 3D** | Custom rendering and advanced 3D possibilities                                                                               | Unnecessary renderer/token/attribution complexity; separate billing and EEA restrictions; does not solve Reactor localization                                              | Future research only [11]                                                 |
| **Places API / Google Geocoding API**                     | Address or POI lookup when the user supplies a specific place                                                                | A city name or loosely worded archive title does not identify the historical camera; more SKUs and data-retention rules                                                    | Defer structured address search; keep existing city geocoding             |
| **Maps URLs**                                             | Keyless link to open a map or panorama in Google Maps                                                                        | Opens an external experience rather than embedded comparison                                                                                                               | Explicit fallback/action [12]                                             |

Google's own **Street View service sample** demonstrates a side-by-side panorama/map with map-based location selection [4]. Adapt its interaction model, not its legacy marker implementation. Its linked **Resizable Split Map Panes** and **Inset Overview Map** examples are useful layout references. The project's existing dark green, cream, gold, DM Sans and Instrument Serif styling should remain the visual foundation.

### 3.2 API behavior to build against

- Load the Maps JavaScript API only on the client, once per page, after comparison is enabled and any required consent is granted. Use dynamic library import; request `streetView`, `maps`, and `marker` only when needed [13].
- Use the documented `quarterly` channel for predictable releases, and verify required options against that channel during the initial spike. Do not use undocumented Google Maps endpoints or scrape the public Maps UI.
- Query `StreetViewService.getPanorama({ location, radius, preference, sources })`. Prefer `NEAREST` and `sources: [GOOGLE, OUTDOOR]`: current documented sources are intersected, so this requests official outdoor collections. `source` singular is deprecated [2].
- `StreetViewPanoramaData` can provide `location.latLng`, `location.pano`, `imageDate`, `copyright`, and adjacent links. These fields are not all guaranteed; validate them.
- `pano_changed`, `position_changed`, and `pov_changed` drive current-location/date/heading updates. Clear a previous date immediately on panorama change, then resolve metadata for the new ID if needed. Never retain an old photo's date on a new panorama.
- Enable the native `imageDateControl` where supported. A textual date in our pane header supplements, not replaces, Google's native attribution [3].
- Panorama IDs are not durable location identifiers. Re-resolve from the non-Google anchor for a later visit; use IDs only as session handles [2, 6].
- Advanced Markers require the `marker` library and a map ID. Provision a JavaScript map ID; use `DEMO_MAP_ID` only for development, not production [14].

### 3.3 Costs and billing

Snapshot of the **global USD pay-as-you-go price list**, researched 12 September 2026. Prices below are per 1,000 billable events in the first paid band, after the monthly free cap. India pricing, subscriptions, negotiated terms and taxes can differ; verify the actual billing account before launch [7, 8].

| SKU                  | Monthly free cap | First paid band |
| -------------------- | ---------------: | --------------: |
| Dynamic Maps         |           10,000 |      $7 / 1,000 |
| Dynamic Street View  |            5,000 |     $14 / 1,000 |
| Embed                |        Unlimited |              $0 |
| Static Maps          |           10,000 |      $2 / 1,000 |
| Static Street View   |           10,000 |      $7 / 1,000 |
| Street View Metadata |        Unlimited |              $0 |

The JS SKU documentation describes Dynamic Street View charging by panorama-object instantiation/successful load, **not by React render, frame, or every arrow click** [8]. The map has a separate load charge. Do not construct the map's implicit default panorama in addition to our standalone panorama.

For **20,000 comparison visits/month**, assuming exactly one successfully loaded map and one panorama instance per visit, no other usage against those caps, and no additional paid services:

- Map: `(20,000 − 10,000) / 1,000 × $7 = $70`.
- Street View: `(20,000 − 5,000) / 1,000 × $14 = $210`.
- **Illustrative Google total: $280/month**, excluding existing Reactor/storage costs and taxes.

Measure actual SKU usage in Cloud Billing. Preserve one viewer/map across seed changes and temporary hides; avoid remounting them on chunks, focus changes, split resizing or model changes. Use billing alerts plus available API quota limits: **budget alerts do not stop spending**. Existing `/api/world` IP limits do not protect direct browser-to-Google calls.

## 4. Experience design

### 4.1 Desktop layout

```text
Cities Through Time     Amsterdam · 1960s          [Then & Now] [New search]

┌──────────────────────────────┬──────────────────────────────────────┐
│ THEN · 1960s                 │ PRESENT-DAY REFERENCE                │
│ AI-generated interpretation  │ Street View · Captured May 2024      │
│                              │                                      │
│ Existing Reactor video       │ Google Street View panorama          │
│                              │                                      │
│ Click to enter · WASD        │ Click/drag to look · arrows to move   │
│                              │                       ╭──────────╮   │
│ Archive photo credit         │                       │ inset map│   │
│ [Try another photograph]     │                       ╰──────────╯   │
├──────────────────────────────┴──────────────────────────────────────┤
│ Documented photo location · panorama nearby · exploration independent│
│ [Return Street View to reference] [Adjust location] [Open in Maps]   │
└─────────────────────────────────────────────────────────────────────┘
```

The date above is illustrative, not a claim about a verified Amsterdam panorama.

- Start at 50:50 on sufficiently wide screens; constrain each pane to at least 360 CSS px. Use a draggable separator with a keyboard equivalent and a reset-to-equal action. A static equal split is the first usable slice; the divider follows in the same workstream.
- Keep the historical 16:9 video undistorted (`object-fit: contain` in comparison mode). Letterboxing is preferable to cropping away the scene needed for visual comparison. The right panorama may use its own viewport aspect.
- Keep the historical video node and the comparison shell stable across `connecting`, `walking`, `reseeding`, and `refreshing`. Existing walking-dependent grid rules need a scoped comparison override, not a global redesign.
- The toggle collapses the right pane without creating or disposing a Reactor session. Google failure never hides the historical view or changes the world's error state.
- The archive credit stays attached to the historical pane. Google copyright, links, and date controls stay attached to the Google pane.
- Comparison loads independently as soon as the payload/anchor exists; it never delays token minting, seeding, or the first generated frame. Missing key/consent results in a local right-pane message.

### 4.2 Circular location widget without hiding attribution

**Do not apply `border-radius: 50%; overflow: hidden` or a circular `clip-path` to the native Google map.** Google's logo, legal links and third-party attribution usually sit in its corners; cropping those is not a supported shortcut [9, 15]. Adding a replacement logo elsewhere does not authorize hiding SDK-provided credits.

The initial design is a **circular instrument housing**, approximately **288 px in diameter**, containing an **unclipped 200×200 rectangular Google map**, centered entirely within the circle. The surrounding ring supplies the circular visual language, north label and expand button. This deliberately preserves the map's native corners rather than promising a fully circular crop of Google tiles.

- On large panes, dock it above the Street View attribution-safe area, initially near the lower right. If the native attribution occupies that space, move the widget to a separate control rail; do not overlay the legal strip.
- Marker 1: gold archival reference pin; use a different shape for uncertain/subject locations. After a manual override, label this pin “User-selected reference” instead and retain the original archive evidence separately; never overwrite the seed's documented location.
- Marker 2: blue Street View camera with a rotating direction indicator. This is **not** the Reactor camera and **not** the user's device GPS.
- North stays up. Only the camera indicator rotates with Street View POV. Do not rotate the whole Google map and its labels.
- Keep the camera in view; offer **“Fit reference and Street View”** when the user navigates away. If the reference is off-screen, show distance and an explicit return action rather than a misleading combined marker.
- The small map is an overview, not a precision editor: suppress optional zoom/Street View/map-type/fullscreen controls through supported options, never branding. A focusable app-owned expand button opens a larger rectangular map with pan/zoom and location selection.
- Expand the **same map host** through layout changes instead of creating another map. Restore keyboard focus when the expanded panel closes.
- Verify attribution at browser zoom, long localized legal text, and narrow widths. If the native 200×200 view cannot preserve readable credits, use a larger rectangular map card with the circular control as its launcher. A genuinely circular tile viewport requires a separate supported-rendering and attribution review; it is not a release assumption.

### 4.3 Responsive and accessible behavior

- Below the two-pane minimum width, switch to stacked panels or **Then / Present-day** tabs; keep a clear indication that both refer to the same reference anchor. Prefer tabs on phones to avoid two unusably short views.
- Collapsed mobile map widget: a 56 px circular **“Show location map”** button; expand to an unclipped map panel. Do not squeeze Google into a 56 px tile image.
- Retain the existing desktop-keyboard guidance for the generated walk. Mobile Street View can work without claiming that Reactor has acquired touch movement controls.
- Pane labels and location accuracy must be text, not color alone. Status changes use a polite live region; heading updates must not produce continuous screen-reader announcements.
- Divider: focusable `separator`, orientation and current value, Arrow/Home/End support. All actions remain usable without pointer lock.
- Honor reduced motion; disable automatic Street View device-motion tracking and its control in this release. No device-geolocation permission is needed.
- Expanded map/dialog: normal focus containment, Escape to close, and focus restoration. Do not trap focus inside the historical control surface.

### 4.4 Input ownership and navigation semantics

Maintain one explicit input owner: `historical | present | map | ui | none`.

1. Entering the historical viewport enables its existing held-state controls and requests pointer lock only after an intentional click.
2. Escape releases pointer lock and publishes `IDLE`. Switching to Street View, the map, the divider, or another control also clears held keys/mouse state and publishes `IDLE` **before** transferring focus. While pointer-locked, instruct the user to press Escape first; do not assume a click can reach another pane.
3. Street View receives native drag, keyboard and navigation behavior only while its pane owns focus. Its events must never dispatch Reactor commands.
4. Historical movement does not move Street View or either map pin. Show **“Independent exploration — map follows Street View; historic pin marks the seed location.”** This statement is visible from the start, not only after detected drift.
5. **Return Street View to reference** restores the initial selected panorama and initial POV, re-resolving the anchor if its ID has gone stale. It does not claim to reset the generated world or call a model-specific SDK method.
6. **Try another photograph** uses the existing re-seed flow; comparison switches to that alternate's own anchor. Immediately clear stale comparison date/match information while resolving the new seed. An unlocated alternate must not inherit the previous seed's pin.
7. An existing/reattached Reactor world can already be far from the seed scene. Label the pin as a reference location even on initial attach; never claim reattach restored the geographic camera.

Focus release stops movement commands, **not necessarily generation or billing**. There is no cross-model pause capability in the current adapter. New search/exit still disposes sessions; hiding one pane is not a metering pause.

## 5. Establishing the same location

This is the main data problem. A city, a title such as “Amsterdam street,” and a nearby panorama are insufficient evidence of a same-location comparison.

### 5.1 Anchor hierarchy

| Evidence available                                               | Action                                                                             | Honest UI label                                           |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Human-reviewed camera location tied to the exact archival photo  | Look up nearby outdoor Street View and orient from documented heading if available | “Verified photo reference; nearby Street View”            |
| Archive explicitly identifies camera coordinates                 | Use them; preserve provenance and any supplied uncertainty                         | “Archive camera location; viewpoint approximate”          |
| Archive identifies the depicted building/subject, not the camera | Search nearby; orient toward subject if meaningful                                 | “Near the photographed subject; camera location unknown”  |
| Generic geotag or uncertain coordinates                          | Treat as approximate, never verified                                               | “Approximate photo area”                                  |
| Only canonical city center                                       | Center the overview map, but do not auto-label a city-center panorama as a match   | “Photo location unknown — choose a reference point”       |
| User selects a point on the expanded Google map                  | Use as a temporary comparison target, preserving its manual/unverified origin      | “User-selected reference; not verified against the photo” |

**Camera and subject locations are different.** Commons has separate camera-location and object-location conventions; its `Location` template describes camera coordinates and may carry a heading [16]. Flickr or Europeana coordinates may describe something else, including an institution or a broad area. No automatic confidence upgrade based only on the presence of numbers.

### 5.2 Source changes

- **Wikimedia first:** request per-file coordinates with the existing batched query (`prop=...|coordinates`, appropriate coordinate properties) and inspect the archive's metadata/semantics. Fixtures must prove the field interpretation. A coordinate of uncertain origin remains `role: unknown`; never copy `q.lat/q.lon` into a seed.
- **Flickr:** add `geo` to requested extras and parse latitude/longitude/accuracy when present. Treat provider accuracy codes as provider-specific, not meters. Confirm that metadata relates to the photograph before assigning a camera role.
- **Europeana and CSE:** preserve explicit, attributable spatial metadata only when its meaning can be established. No full-title Google geocoding or LLM location guessing. Missing coordinates are a supported result. Do not add a slow, multi-provider enrichment pipeline to this release.
- **Curated launch anchors:** add a small typed list keyed by exact canonical archive record/source URL, not by city/decade alone. Each entry needs the photo reference, location role, evidence source, reviewer date, optional heading, and a rationale. Start with at least three reviewed photo/location pairs across two cities, and include located alternates for a re-seed demo. Confirm present-day coverage separately during live verification.
- Curated coordinates must come from independently licensed archive/open data or original research, **not extracted Google Maps content**. A pin selected in Google Maps is a session-local override, not an automatic addition to this dataset.
- Preserve location on every candidate → normalized seed → alternate → shared cache → response → frontend normalization hop.
- Do not silently replace the selected archive photo with a geographically convenient but less suitable one. Preserve current era/license/walkability ranking. A location-aware ranking bonus is a later, explicitly tested product choice, not necessary to deliver the first extension.

### 5.3 Validation and lookup policy

**Coordinates and evidence**

- Validate finite latitude `[-90, 90]`, longitude `[-180, 180]`, optional nonnegative uncertainty, heading normalized to `[0, 360)`, and safe provenance URLs. Reject malformed metadata, not the entire otherwise valid historical world.
- Do not treat `(0, 0)` as a universal invalid coordinate. Reject provider-documented sentinel values; validate against the selected city's bbox/context with a documented allowance for boundary streets. Out-of-area evidence is flagged and omitted from automatic matching.
- Preserve camera versus subject role through the client. Decimal precision is not evidence of accuracy. No numerical “confidence percentage” fabricated from distance.

**Street View selection**

1. For a usable archive/curated/manual anchor, search within **50 m** with `NEAREST`, official outdoor sources. This is a proposed product default, not a Google guarantee.
2. If no result, retry within **150 m**, then **500 m**. Maximum three location lookups per explicit target, with an overall **8-second UI deadline**. Only expand after `ZERO_RESULTS`; a denied request, failed loader or quota error should not trigger three more calls.
3. Measure actual returned camera distance from the requested anchor. Within 50 m means “near reference,” not “same viewpoint.” At 50–150 m show the distance prominently. Beyond 150 m require an explicit **“Show nearby imagery”** action; no auto-switch to a distant street. Nothing found within 500 m is a normal no-coverage state.
4. Distance alone cannot validate the street, bank of a canal, floor, side of a building, or camera direction. Require visual review before calling a curated pair verified; allow manual correction for other cases. Display both anchor provenance and panorama distance as separate dimensions.
5. Use a documented archive camera heading when available, acknowledging crop/lens uncertainty. For a subject point, bearing from panorama to subject is only an orientation aid and remains approximate. Without either, leave a neutral/default POV and invite manual rotation; do not infer heading from the selected city or Reactor mouse deltas.
6. When only a city center exists, show the map and selection UI first. A separate **“Explore city center instead”** action may deliberately open an unverified reference. If legacy payloads lack even city coordinates, show an external city-search link rather than inventing coordinates or adding a new geocoder call.
7. On panorama navigation, update the camera pin, heading and date; keep the archival reference fixed. If navigation moves away, retain the independent-exploration label and provide return-to-reference.
8. Google service promises cannot necessarily be canceled at the network layer. Use an incrementing request generation plus disposal guard so late results after a seed change, retry or exit cannot update the wrong view.

The radii and deadline are tunable constants with tests. Observe coverage and latency on actual demo locations before widening them.

## 6. Architecture and contracts

### 6.1 Data flow

```text
Existing server world pipeline
  Nominatim city context + archive photo metadata + curated open-data anchors
       → candidate → normalized seed/alternates → shared world cache
       → existing /api/world final payload (optional location fields)
                         │
                         ▼
  world-client normalization → in-memory WorldProvider
                         │
          ┌──────────────┴────────────────────┐
          ▼                                   ▼
  Existing Reactor adapter          Comparison controller / Google driver
  seed photo + era prompt           anchor + city context only
          │                                   │
          ▼                                   ▼
  Historical video                  StreetViewService → panorama + mini-map
```

**No Google imagery, panorama metadata, or user-selected Google reference is passed to Reactor, image normalization, Modal, prompt composition, Blob storage, or a model evaluation pipeline.** The display-only comparison boundary is intentional.

### 6.2 Additive backend fields — Hacker B owns

Keep `lib/types.ts` as the source of truth. Proposed additions:

```ts
export type GeoPoint = { lat: number; lng: number };

export interface SeedLocation {
  point: GeoPoint;
  role: "camera" | "subject" | "unknown";
  provenance: "archive" | "curated";
  evidenceUrl: string;
  label?: string;
  accuracyMeters?: number;
  headingDeg?: number;
  reviewedAt?: string;
}

export interface CityLocation {
  center: GeoPoint;
  bounds: { south: number; west: number; north: number; east: number };
  source: "nominatim";
}
```

- Add `location?: SeedLocation` to **both** `SeedCandidate` and `Seed`.
- Add `cityLocation?: CityLocation` to `WorldPayload.meta`.
- Only curated, reviewed camera evidence can drive a “verified reference” badge. Other location roles remain visible even for curated entries. `headingDeg` means a documented camera heading, not a subject's orientation.
- `lib/frontend-types.ts` imports these types; presentation seeds/meta keep the same optional information. `parseSeed` and `parseWorldPayload` validate and preserve it, including alternates. Old payloads still parse.
- Keep the `/api/world` request, NDJSON progress stages, token response, model selection and `PATCH /api/world/cache` unchanged. This extension requires **no new API route**.

**Cache compatibility:** keep `world:{citySlug}:{decade}` and model-specific keys unchanged. The pipeline already has `GeoResult` on both paths, so it can populate city context even for a legacy cached `SharedWorld`. Existing cached seeds without locations remain valid; apply a matching curated override in memory when available. Otherwise show unknown location until normal cache refresh supplies metadata. Do not invalidate all seed caches, regenerate images, re-source on model changes, or mutate model-state blobs to attach Google data. Curated override edits must take precedence at response assembly so a week-old seed cache cannot hide a correction.

### 6.3 Browser integration contract — freeze before parallel implementation

Create `lib/comparison/types.ts`; it imports geographic types from `lib/types.ts` and contains no Google SDK imports. Hacker B owns this file. Agree these signatures once:

```ts
export interface ComparisonTarget {
  key: string;
  point: GeoPoint;
  kind: "camera" | "subject" | "approximate" | "manual" | "city";
  headingDeg?: number;
}

export interface PresentView {
  panoId: string;
  position: GeoPoint;
  headingDeg: number;
  pitchDeg: number;
  imageDate?: string;
  distanceMeters: number;
}

export type ComparisonState =
  | { status: "disabled" | "loading" | "needs-location" }
  | { status: "ready"; view: PresentView }
  | { status: "nearby-offer"; view: PresentView }
  | {
      status: "unavailable";
      reason: "no-coverage" | "timeout" | "configuration" | "network" | "quota";
    };

export interface PresentDayDriver {
  setReference(target: ComparisonTarget | null, city?: CityLocation): Promise<void>;
  acceptNearby(): void;
  returnToReference(): Promise<void>;
  fitReferenceAndCamera(): void;
  setVisible(visible: boolean): void;
  setMapExpanded(expanded: boolean): void;
  resize(): void;
  dispose(): void;
}

export interface PresentDayDriverOptions {
  panoramaElement: HTMLElement;
  mapElement: HTMLElement;
  onState: (state: ComparisonState) => void;
  onManualTarget: (point: GeoPoint) => void;
}

export type PresentDayDriverFactory = (
  options: PresentDayDriverOptions,
  signal: AbortSignal,
) => Promise<PresentDayDriver>;
```

Contract rules:

- The UI owns DOM hosts, input ownership, visible copy, reference evidence, and manual-target state. The driver owns Google objects, service calls, pins, date/POV updates and resize effects. The driver never owns Reactor state or takes a session token.
- A null reference with a city initializes the map only and emits `needs-location`; it does not create a city-center panorama. A manual map click emits `onManualTarget`; the UI assigns `kind: manual` and calls `setReference` explicitly. Programmatic map/marker moves do not emit manual-selection callbacks.
- `nearby-offer` is a candidate, not an accepted displayed comparison. `acceptNearby()` displays it while retaining its distance/approximate label. The target key travels with internal requests so an acceptance cannot apply to a previous seed.
- Derive a target key from the **active seed URL plus source URL**, location values and manual-override revision, not from city/decade/model or source URL alone. Existing mock alternates can share source URLs; changing their anchor must still reset comparison state.
- `setReference` is latest-wins and does not recreate existing viewers; the first accepted target may lazily create the initial panorama. `returnToReference` uses the last accepted initial panorama/POV for that target. `dispose` is idempotent, invalidates in-flight operations, removes listeners/overlays and clears retained DOM references.
- `setMapExpanded` changes supported map interaction/control options without changing the host or instance; only the expanded map permits manual point selection. `fitReferenceAndCamera` adjusts map bounds without changing the selected panorama or emitting a manual target.
- `resize` preserves POV and position; use a `ResizeObserver` at the UI boundary and coalesce notifications. Throttle POV-derived UI notifications to at most 10 per second while preserving the final value. Do not add a per-frame map loop.
- Factory failure and driver failure use normalized local errors, never raw provider messages reflected into UI. A Google failure does not call `failRun` in `use-world-session.ts`.
- Provide a fake implementation with deterministic states and no Google network access. Keep test controls behind test/preview-only selection, never a public production bypass. Factory selection is at the component boundary, so A need not import Google types.

### 6.4 Lifecycle, performance and privacy

- Comparison is separate from `WorldPhase`. It can be loading/unavailable while the historical world is walking.
- Use a singleton loader promise, with retry behavior for a genuinely failed load. Import a reviewed compatible `@googlemaps/js-api-loader` release and `@types/google.maps` via pnpm; select versions published at least seven days earlier and record them in the root lockfile. Do not add a second React map wrapper library.
- Instantiate at most one `Map` and one successful standalone `StreetViewPanorama` per active comparison experience. React Strict Mode cleanup must not leave duplicate viewers/listeners; lazy construction after coverage resolution should not race a canceled effect.
- Keep instantiated hosts alive for temporary hide/show, mobile tab changes, pane resize, or same-world model refresh. Do not reconstruct Google objects from a dependency on the entire frequently changing world-state object. On journey exit/unmount, remove listeners, detach markers, hide the panorama, release references, and discard session metadata. Google objects have no general Reactor-style `dispose()` API; the wrapper implements that lifecycle rather than calling an invented SDK method.
- On re-seed, use a generation guard to suppress old results and clear manual overrides from the previous photo. Reconnection to the same active seed need not repeat Google lookup.
- Do not persist Google imagery, provider addresses/dates/coordinates, or panorama responses to Redis, Blob, localStorage, a service-worker cache, or a dataset. Keep only what is needed in the current display session; use aggregate telemetry without panorama content.
- Independently licensed archive anchor metadata can use the existing shared cache. The two data origins must stay distinct; Google-ID caching exceptions are not permission to store arbitrary metadata [9, 15].
- No Google requests on the landing page, in local UI preview, in normal mock E2E, while the feature is disabled, or before applicable consent. A production kill switch must prevent future loads, not merely hide UI.

## 7. Configuration, policy and launch gates

### Required configuration

Hacker B owns environment/dependency changes; no real credentials belong in the repo.

| Setting                           | Scope                             | Purpose                                                                   |
| --------------------------------- | --------------------------------- | ------------------------------------------------------------------------- |
| `NEXT_PUBLIC_ENABLE_THEN_NOW`     | Public build-time flag            | Enables comparison UI; default false until rollout                        |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Intentionally browser-visible key | Maps JavaScript API only; restricted by allowed website referrers and API |
| `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`  | Public identifier                 | Production JavaScript map ID for Advanced Markers                         |

The Google browser key is **not** a secret like `REACTOR_API_KEY`. It must be visible to the browser and secured with application/API restrictions [17]. Never reuse `GOOGLE_CSE_KEY` or expose any server-side archive/Reactor/restore credential.

Deployment checklist:

1. Owner enables billing and Maps JavaScript API in the intended Google Cloud project; creates map ID and separate dev/production website-restricted keys. No billing account or cloud resource is created as part of writing this plan.
2. Allowlist exact production and approved preview origins, plus local development origins on the dev key. Do not allow all `*.vercel.app`. API restrictions allow only required services. Keep normal referrer transmission compatible with those restrictions.
3. Set quota limits supported by the API, billing alerts, and a named operator for alerts. Record the baseline SKU usage after the first live test.
4. `NEXT_PUBLIC_*` values are embedded at build time: flag/key changes require a redeploy. For an immediate incident, the cloud project/key/API restriction is an operator-controlled stop; do not pretend a build-time flag is a live server kill switch.
5. Publish `/privacy` and `/terms`, linked from the footer, describing Google processing and incorporating the required Google terms/privacy references. Confirm consent requirements for target regions; when required, render an explicit “Load Google comparison” consent gate before loading the SDK.
6. Review current CSP, referrer policy and hosting headers against Google's documented loader/network requirements. Do not disable existing security controls to make a map work. Any new CSP allowance must be narrowly reviewed alongside existing fonts, Reactor and Blob connections.

### Licensing and regional requirements

- **Attribution is a release gate**, including native Google Maps branding, copyright, legal/report links, and provider credits. Do not recolor/filter the Google content or cover attribution with the minimap, divider, HUD, or mobile sheet [9, 15].
- Keep Google content clearly differentiated from AI-generated material. No Street View screenshots, tiles, image URLs, or extracted scene information enter Reactor, Modal, prompts, training, testing or model-quality evaluation. Google terms restrict creating content from Maps content and using it to improve AI/ML models [15]. This feature is a human-facing reference display, not an automated model-validation tool.
- Non-EEA terms restrict displaying Street View with non-Google maps. Use a Google mini-map, not an OSM/Mapbox basemap next to Street View. Existing Nominatim supplies independent city context, not a second rendered map. Attribute OSM-derived location data as required in source details, separately from Google attribution.
- Have the product owner review whether the generated-world presentation could be considered a non-Google map under the applicable agreement; labels alone are not legal approval. If unresolved, retain the feature flag and use the external Google Maps action until the display integration is cleared.
- **EEA billing-address gate:** Google's EEA guidance restricts Street View Static API content used “With any Map,” even a Google map. Its recommended alternatives include the Maps JavaScript API Street View service [10]. Map Tiles Street View has a similar restriction [11]. This is why neither static imagery nor a Static metadata helper is silently added to the chosen JS flow. Check the current binding agreement for the actual billing account; the selected city's country does not determine the account terms.

## 8. Work split — two hackers, minimal overlap

### 8.1 Small shared kickoff, then independent delivery

**I0 — Freeze the contract and one fixture pack.** Both review sections 5–7; **B is the sole author** of the additive types, driver interface and fake driver. Freeze property names, nullable/unknown behavior, target identity, normalized error states and DOM-host ownership. Provide fixtures for located, subject-only, unlocated, distant, no-coverage, denied and stale-result cases.

A starts the split shell and plain DOM hosts immediately against the documented interface; B starts source/Google work. Merge the small contract/fake-driver commit as soon as it is ready. A never needs a Google key or completed source enrichment to continue, and B never needs the finished comparison layout to test the driver.

### 8.2 Hacker A — Experience, focus and lifecycle integration

**Owns user-visible React/UI behavior. Does not implement Google SDK calls or source geolocation.**

| Ticket                                                | Work                                                                                                                                                                       | Acceptance / test                                                                                                                           | Dependencies                             |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| **A1 — Comparison shell**                             | Add `components/world-comparison.tsx`, `present-day-pane.tsx`; integrate in `journey-experience.tsx`; stable left video, headers, toggle, equal split, responsive layout   | Existing journey works with flag off; fake comparison displays beside the same video node; no additional Reactor connect on resize/toggle   | Documented I0 contract; fake when merged |
| **A2 — Input isolation**                              | Add explicit input ownership; adapt `world-viewport.tsx` and `use-world-controls.ts`; scope overlays/HUD; release pointer lock and held state when leaving historical pane | Holding W then Escape/focus switch sends IDLE; Street View/map/divider inputs never move Reactor; existing control tests remain green       | A1                                       |
| **A3 — Circular widget and accessible layout**        | Add `location-widget.tsx`, expanded-map host, keyboard separator and mobile tab behavior; reuse project tokens                                                             | Unclipped native-host rectangle inside circular housing; expand without extra map instance; 390 px and 200% zoom usable; credits unobscured | A1, fake driver                          |
| **A4 — Data normalization and comparison controller** | Update frontend types/normalizers; add `hooks/use-world-comparison.ts`; manage target identity, manual overrides, pane status, nearby acceptance and factory lifecycle     | JSON/NDJSON/legacy payloads parse; same seed/model refresh retains comparison; alternate/re-seed changes target; stale callbacks ignored    | I0; can build entirely against fake      |
| **A5 — Honest UX and integration tests**              | Date/provenance/distance copy, return/adjust/open-in-Maps actions; update local preview metadata; add comparison Playwright tests; wire privacy/terms footer links         | Unknown location/date and all failures have actionable UI; local preview makes zero Google requests; both model paths tested                | A1–A4                                    |

A owns:

- Existing `components/journey-experience.tsx`, `world-viewport.tsx`, `world-hud.tsx`, and `app/globals.css`.
- Existing `lib/frontend-types.ts`, `lib/world-client.ts`, and local-preview payloads in `lib/reactor/client/mock.ts`.
- New comparison React components and `hooks/use-world-comparison.ts`; existing `hooks/use-world-controls.ts`.
- Frontend/controls/normalization tests under `tests/`, including new `tests/comparison.spec.ts` and related unit tests.
- `world-provider.tsx` / `use-world-session.ts` **only if a small stable lifecycle signal is required**; prefer composition so session internals stay unchanged. No live Reactor adapter changes are expected.

### 8.3 Hacker B — Location data, Google driver and configuration

**Owns all geospatial evidence and Google integration. Does not edit the comparison React components or global CSS.**

| Ticket                              | Work                                                                                                                                                                                                              | Acceptance / test                                                                                                                                                          | Dependencies                                   |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| **B1 — Contract and fake driver**   | Land I0 additions in `lib/types.ts`, new `lib/comparison/types.ts`, and fake driver/fixtures                                                                                                                      | Typecheck with optional fields; fake covers all states and late callbacks; no Google types leak through interface                                                          | Shared contract review                         |
| **B2 — Archive anchor propagation** | Add `lib/location.ts`; enrich Wikimedia and Flickr conservatively; propagate through `image.ts`, `orchestrate.ts`, backend mocks and API contract                                                                 | Correct lat/lng mapping; camera/subject roles preserved; invalid evidence omitted; all alternates covered; old cache accepted; no extra sourcing on model switch           | B1                                             |
| **B3 — Curated launch locations**   | Add reviewed, independently sourced `lib/locations/curated.ts`; apply exact-record overrides on cold/warm paths                                                                                                   | At least three evidence-backed pairs across two cities; at least one located alternate; no city-name-only matching; no Google-derived persistent coordinates               | B2                                             |
| **B4 — Google loader and driver**   | Add `lib/comparison/google-loader.ts`, `google-driver.ts`, and pure lookup/geometry helpers; install dependencies; implement coverage/radii, IDs, date, markers, heading, map selection, cancellation and cleanup | Driver tests cover lookup sequence, distance gates, date clearing, stale IDs/results, no duplicate objects and idempotent cleanup; live smoke after configuration approval | B1; does not wait for B2/B3 or A               |
| **B5 — Deployment/policy support**  | Extend `.env.example`, dependency/lockfile and setup docs; create privacy/terms page content for owner review; document key restrictions, EEA check, attribution and quota setup                                  | Missing/denied key degrades cleanly; secrets remain server-only; operator can disable Google independently of Reactor                                                      | B4; owner supplies approved configuration/text |

B owns:

- `lib/types.ts`, `lib/sources/wikimedia.ts`, `lib/sources/flickr.ts`, any narrowly necessary Europeana changes, `lib/image.ts`, `lib/orchestrate.ts`, `lib/mock/world.ts`.
- All new `lib/location*` / `lib/locations/*` and `lib/comparison/*` files, including fake driver and colocated driver/location unit tests. A consumes these without editing them.
- Backend source/pipeline tests and API contract tests; `docs/api-contract.md`.
- `.env.example`, `apps/web/package.json`, root `pnpm-lock.yaml`, required `next.config.ts`/hosting configuration proposals, and setup additions in `README.md` / `SECURITY.md`.
- New `app/privacy/page.tsx` and `app/terms/page.tsx`; A owns only their footer links and shared styling.

### 8.4 Ownership rules and integration sequence

- **No shared editing of the same files.** B changes backend/driver types; A changes presentation types and normalization. Any contract revision is a B-authored patch agreed with A, not duplicated local types.
- B alone runs package-manager changes. A uses existing React/CSS tooling; no splitter/map wrapper dependency needed.
- B's Google tests stub the Maps objects at the driver boundary; A's E2E uses the fake driver. A does not wait for live credentials or parse Google's DOM in automated tests.
- Do not modify ranking/walkability/prompts or Reactor SDK implementations for this feature. Preserve unrelated working-tree changes already present in those areas.
- Treat legal/billing approvals as external launch gates, not reasons to block UI/data development or weaken security settings.

```text
I0 contract/fake ─┬─ A1 shell ─┬─ A2 focus ──────────┐
                 │            └─ A3 widget ─────────┤
                 ├─ A4 normalization/controller ── A5 ─┐
                 ├─ B2 metadata ─ B3 curated anchors ───┤
                 └─ B4 Google driver ─ B5 configuration ┤
                                                        ▼
                                      I1 integrated fake E2E
                                                        ▼
                                  I2 approved live matrix + rollout
```

**I1 — Integration owner A; B reviews driver/data behavior.** Replace the fake factory with the real factory only in live-enabled mode, preserving the same props/events. Run full automated checks. B fixes driver/data issues in B-owned files; A fixes UI issues in A-owned files.

**I2 — Live verification owner B; A reviews UX and attribution.** Verify the curated matches, actual SKU counts, date freshness behavior, keys and coverage on the deployed preview. Both verify focus transitions and exit cleanup with each live Reactor model. This is a verification checkpoint, not an invitation for overlapping feature edits.

## 9. Verification and acceptance criteria

### Automated checks

Use the existing workspace commands; do not replace the backend suite or create a nested lockfile:

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm --filter web e2e
```

Install Playwright Chromium if needed with `pnpm --filter web exec playwright install chromium`. Keep all ordinary automated runs credential-free; fake Google data must be clearly synthetic, not stored production screenshots/metadata.

| Layer             | Required coverage                                                                                                                                                                                                                |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source parsing    | Camera vs subject vs unknown; invalid/range/sentinel data; swapped lon/lng; out-of-city metadata; missing heading/accuracy; Flickr geo extras                                                                                    |
| Pipeline/cache    | Coordinates survive normalization and alternate rotation; legacy cached seeds work; curated corrections apply on warm responses; no Google calls from `/api/world`; model switch reuses sourced seeds                            |
| Frontend contract | Old/new JSON and NDJSON payloads; malformed optional geo stripped without breaking world; all alternate fields preserved                                                                                                         |
| Driver            | Three-radius cap; no widening on auth/quota errors; candidate >150 m requires acceptance; absent/old dates; changed/stale pano IDs; delayed result after re-seed/dispose; source filters; subject-bearing edge cases             |
| Lifecycle/cost    | One loader; no duplicated active map/viewer/listeners; hide/show/resize/seed change reuse; map expansion preserves object; cleanup safe twice; no stale state after exit                                                         |
| Controls          | Held W cleared on focus transfer; pointer-lock release; Google keyboard/drag and UI shortcuts do not reach Reactor; no per-frame geographic updates                                                                              |
| E2E               | Split and historical-only toggle; approximate/no-location/no-coverage/config-error states; accept-nearby; manual point; return action; located → unlocated re-seed; model change; repeated search; responsive and keyboard paths |
| Privacy/security  | No Google requests in local/backend mock mode, disabled/consent-pending mode; no session token handed to driver; no Google data saved through cache/model state; raw upstream errors not reflected                               |

### Live verification matrix

Do not hard-code an imagery date or assert that a named city has current coverage without checking. Validate at least:

1. A curated Amsterdam camera-location pair with a recognizably matching subject/street.
2. A curated pair in a second city, plus a re-seed alternate with a different anchor.
3. A subject-only or uncertain geotag, verifying weaker match copy and manual correction.
4. A real no-coverage location (or a deliberately restricted search), plus an unlocated historical seed.
5. Imagery with a known older date, a no-date simulated result, a blocked/invalid key, and a network interruption.
6. Both `lingbot-world-2` and `happy-oyster-adventure`; no model-specific comparison branches.
7. Desktop Chrome/Safari, keyboard-only, narrow viewport and 200% browser zoom; all Google/native archive credits remain readable.
8. Compare-toggle, divider drag, Google navigation, map expansion, re-seed, model switch and exit while observing constructor counts, network activity and actual billing telemetry.

### Definition of done

- [ ] A documented historical reference opens alongside nearby interactive Street View with independently verified launch examples.
- [ ] Circular location housing displays the actual map without hiding attribution; camera and archival reference are distinguishable.
- [ ] Both panes have honest labels: selected decade/AI interpretation versus Street View capture date; no live/latest/exact-alignment claims.
- [ ] Unknown/approximate locations never masquerade as exact; a user can choose an unverified reference or continue historical-only.
- [ ] Map follows Street View, never guessed Reactor movement. Re-seed updates the anchor correctly, including missing metadata.
- [ ] Google failure does not interrupt the historical session; default mocks and flag-off deployments need no Google credentials.
- [ ] Focus transfer clears all held controls; resize/toggle/Google navigation neither restarts nor duplicates Reactor sessions.
- [ ] No Google content enters the generation/restoration/cache pipeline; server secrets remain private.
- [ ] Automated checks pass; both-model live smoke, attribution review, billing/key setup and applicable terms review are recorded before enabling production.

## 10. Performance, observability and rollout

**Performance targets to measure, not guarantees:** no new Google work in `/api/world`; metadata extraction piggybacks on existing archive requests; compare the historical first-frame latency before/after. Aim for right-pane readiness within 3 seconds after an anchor is available on a warm client/network, with the 8-second deadline ending in a usable local fallback. Google loading must not compete with initial seed sourcing on the landing page.

Record aggregate events/counters such as `comparison_enabled`, `anchor_kind`, `lookup_outcome`, `distance_bucket`, `comparison_ready_ms`, `map_created`, `panorama_created`, `comparison_failed`, and `comparison_disposed`. Do not log full Google responses, panorama IDs, exact camera coordinates, token/key-bearing URLs, or an individual's browsing path. Use Cloud Billing for authoritative charges.

Rollout:

1. Merge contract, fake UI and source enrichment with the public feature flag off.
2. Enable on an approved preview origin; test real Google independently with a fake Reactor adapter through an explicit developer-only mode. Keep normal local/backend mocks completely network-free and label mixed live-Google/mock-world testing honestly.
3. Complete policy/attribution and curated-location checks; then test both live Reactor models.
4. Enable for the reviewed demo journeys first. Unreviewed cities remain supported through approximate/manual/no-coverage states rather than fake matching.
5. Monitor anchor availability, lookup success/latency and map/panorama instance counts; investigate remounts before broad rollout.
6. Roll back by disabling the comparison build flag and redeploying; for an immediate Google issue use the approved cloud-side restriction/disable action. Existing world generation and shared seed caches continue working.

## 11. Risks and explicit deferrals

| Risk                                                        | Mitigation                                                                                                      |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Wrong “same location” claim                                 | Evidence-bearing per-photo anchors; camera/subject distinction; reviewed launch set; manual/unverified fallback |
| Generated camera drifts away                                | Independent-exploration contract from the start; fixed archive pin; no WASD dead reckoning                      |
| Old or missing Street View imagery                          | Capture-date labels, visible distance, bounded lookup, no-coverage fallback                                     |
| Circular layout hides native legal UI                       | Unclipped rectangular map in circular housing; expanded rectangular fallback; live attribution gate             |
| Google restrictions conflict with display or account region | JS service choice, data isolation, applicable-agreement review, feature gate/external link fallback             |
| React effects create avoidable paid loads                   | Stable DOM hosts, one loader/driver, constructor tests and billing observation                                  |
| Reseeding races old map callbacks                           | Latest-target generation guard, clear metadata immediately, no cross-seed manual override                       |
| Data work grows into a geolocation research project         | Wikimedia/Flickr metadata plus curated launch set; no automatic title geocoding or computer vision              |
| Comparing quietly leaves Reactor metered                    | Make “stop controls” versus “end session” clear; keep explicit exit/disposal; do not claim pause                |

**Out of scope for this release:** live camera feeds, guaranteed newest panorama, historical Google imagery date selection, seamless pixel-aligned wipe/overlay, Google imagery restoration, Street View-to-Reactor seeding, automatic image geolocation, address autocomplete, collaborative persistent pin edits, synchronized walking, GIS reconstruction, and 3D tiles. Do not describe any of these as solved by the split-screen UI.

## 12. Follow-on: continuously aligned exploration

A true “the same location as I walk” feature requires more than a map widget:

1. Independently licensed street geometry and a geographically calibrated historical scene, with a known starting camera transform.
2. A model or navigation substrate that emits reliable world-space camera pose and supports reproducible position/heading control. Introduce optional geographic-pose capabilities through `WorldModelAdapter`, not UI checks for specific model names.
3. A localization-confidence model and automatic disengagement when generated geometry diverges. Do not integrate W-key duration as if it were measured displacement.
4. A policy-reviewed mechanism mapping that pose to current Street View coverage. Snap only within defensible bounds and indicate missing coverage; Street View's discrete capture locations still cannot supply a continuous live camera.
5. Separate acceptance tests for position/orientation error, loss of tracking, reattach/reset and model capability differences, using independently licensed ground truth rather than Google imagery to evaluate/improve the generative model.

Until this research establishes feasibility, keep the two views independently navigable and the map explicitly anchored to the photographic reference and Street View camera.

## 13. Research references

Official documentation consulted on 12 September 2026 unless noted. Recheck prices, supported channel options and account-specific agreements when implementing.

1. [Maps JavaScript API — Street View service](https://developers.google.com/maps/documentation/javascript/streetview): interactive panorama/service overview and coverage.
2. [Street View service reference](https://developers.google.com/maps/documentation/javascript/reference/street-view-service): location request, `sources`, `NEAREST`, image date, camera position and ID stability.
3. [Street View rendering reference](https://developers.google.com/maps/documentation/javascript/reference/street-view): viewer options, events, date control and device-motion settings.
4. [Directly accessing Street View data — official sample](https://developers.google.com/maps/documentation/javascript/examples/streetview-service): map/panorama interaction inspiration and related split/inset samples.
5. [Maps Embed API — embedding a map](https://developers.google.com/maps/documentation/embed/embedding-map): Street View iframe mode and minimum dimensions.
6. [Street View Static API — image metadata](https://developers.google.com/maps/documentation/streetview/metadata): availability/date metadata, no-charge requests and panorama refresh caveat.
7. [Google Maps Platform global price list](https://developers.google.com/maps/billing-and-pricing/pricing): free caps and per-1,000 event rates.
8. [Google Maps Platform SKU details](https://developers.google.com/maps/billing-and-pricing/sku-details): separate map/panorama loads and panorama-object billing triggers.
9. [Maps JavaScript API policies and attribution](https://developers.google.com/maps/documentation/javascript/policies): attribution, privacy/terms, caching and regional requirements.
10. [Street View Static adjustments for EEA customers](https://developers.google.com/maps/comms/eea/street-view-static): restriction with any map; JS Street View listed as an alternative.
11. [Map Tiles adjustments for EEA customers](https://developers.google.com/maps/comms/eea/map-tiles): Street View Tiles restrictions and supported alternatives.
12. [Google Maps URLs](https://developers.google.com/maps/documentation/urls/get-started): external map/panorama fallback without an API key.
13. [Loading the Maps JavaScript API](https://developers.google.com/maps/documentation/javascript/load-maps-js-api) and [version channels](https://developers.google.com/maps/documentation/javascript/versions): dynamic import and quarterly channel.
14. [Advanced Markers — getting started](https://developers.google.com/maps/documentation/javascript/advanced-markers/start): marker library and map-ID requirement.
15. [Google Maps Platform terms](https://cloud.google.com/maps-platform/terms) and [service-specific terms](https://cloud.google.com/maps-platform/terms/maps-service-terms): attribution, storage, non-Google maps, derived content, AI restrictions and ID exceptions.
16. [Wikimedia Commons — Location template](https://commons.wikimedia.org/wiki/Template:Location): distinction between camera coordinates, heading and object location.
17. [Google Maps API security guidance](https://developers.google.com/maps/api-security-best-practices): browser referrer/API restrictions and separate key usage.
