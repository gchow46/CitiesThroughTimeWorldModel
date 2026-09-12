import assert from "node:assert/strict";
import { test } from "vitest";
import { parseWorldPayload, asFailure, WorldError } from "../lib/world-client";
import { MODEL_IDS, safeUrl } from "../lib/frontend-types";

const fixture = {
  model: { id: "lingbot-world-2", reactorModelName: "reactor/lingbot-world-2" },
  sessionToken: "test-not-a-token",
  seed: {
    url: "/seed.jpg",
    title: "Canal",
    author: "Archive",
    license: "CC0",
    sourceUrl: "https://example.com/source",
  },
  prompt: "Amsterdam in the 1960s",
  meta: { canonicalCity: "Amsterdam, Netherlands" },
};

test("both model payloads use the same contract", () => {
  for (const id of MODEL_IDS) {
    const parsed = parseWorldPayload(
      { ...fixture, model: { id, reactorModelName: `reactor/${id}` } },
      "https://example.com",
    );
    assert.equal(parsed.model.id, id);
    assert.equal(parsed.seed.url, "https://example.com/seed.jpg");
  }
});

test("invalid model scopes and missing tokens are rejected", () => {
  assert.throws(() => parseWorldPayload({ ...fixture, sessionToken: "" }, "https://example.com"));
  assert.throws(() =>
    parseWorldPayload(
      {
        ...fixture,
        model: { id: "lingbot-world-2", reactorModelName: "reactor/helios" },
      },
      "https://example.com",
    ),
  );
});

test("source links and image URLs reject executable protocols", () => {
  assert.equal(safeUrl("javascript:alert(1)"), undefined);
  assert.throws(() =>
    parseWorldPayload(
      { ...fixture, seed: { ...fixture.seed, url: "data:text/html,x" } },
      "https://example.com",
    ),
  );
});

test("failure copy never reflects raw provider secrets", () => {
  assert.equal(asFailure(new Error("secret-token")).message.includes("secret-token"), false);
  assert.equal(asFailure(new WorldError("insufficient_archival_photos", 1970)).closestDecade, 1970);
});

// --- Then & Now: optional geo normalization (plan §6.2) ---

const LOCATED_SEED = {
  ...fixture.seed,
  location: {
    point: { lat: 52.3779, lng: 4.8975 },
    role: "camera",
    provenance: "curated",
    evidenceUrl: "https://commons.wikimedia.org/wiki/File:Damrak.jpg",
    label: "Damrak, Amsterdam",
    accuracyMeters: 12,
    headingDeg: 250,
    reviewedAt: "2026-09-12",
  },
};

const CITY = {
  center: { lat: 52.3676, lng: 4.9041 },
  bounds: { south: 52.28, west: 4.73, north: 52.43, east: 5.08 },
  source: "nominatim",
};

test("seed location and meta.cityLocation survive normalization", () => {
  const parsed = parseWorldPayload(
    {
      ...fixture,
      seed: LOCATED_SEED,
      alternates: [LOCATED_SEED, fixture.seed],
      meta: { canonicalCity: "Amsterdam, Netherlands", cityLocation: CITY },
    },
    "https://example.com",
  );
  assert.equal(parsed.seed.location?.role, "camera");
  assert.equal(parsed.seed.location?.point.lat, 52.3779);
  assert.equal(parsed.seed.location?.headingDeg, 250);
  assert.equal(parsed.seed.location?.evidenceUrl, LOCATED_SEED.location.evidenceUrl);
  assert.equal(parsed.alternates?.[0].location?.provenance, "curated");
  assert.equal(parsed.alternates?.[1].location, undefined);
  assert.equal(parsed.meta.cityLocation?.center.lng, 4.9041);
  assert.equal(parsed.meta.cityLocation?.bounds.south, 52.28);
});

test("malformed optional geo is dropped without rejecting the world", () => {
  const malformed = [
    {
      point: { lat: 95, lng: 4.9 },
      role: "camera",
      provenance: "archive",
      evidenceUrl: "https://x.co/a",
    },
    { point: { lat: 52.3 }, role: "camera", provenance: "archive", evidenceUrl: "https://x.co/a" },
    {
      point: { lat: 52.3, lng: 4.9 },
      role: "aerial",
      provenance: "archive",
      evidenceUrl: "https://x.co/a",
    },
    {
      point: { lat: 52.3, lng: 4.9 },
      role: "camera",
      provenance: "guessed",
      evidenceUrl: "https://x.co/a",
    },
    {
      point: { lat: 52.3, lng: 4.9 },
      role: "camera",
      provenance: "archive",
      evidenceUrl: "javascript:x",
    },
    { point: { lat: 52.3, lng: 4.9 }, role: "camera", provenance: "archive" },
    "52.3,4.9",
    42,
  ];
  for (const location of malformed) {
    const parsed = parseWorldPayload(
      { ...fixture, seed: { ...fixture.seed, location } },
      "https://example.com",
    );
    assert.equal(parsed.seed.location, undefined, JSON.stringify(location));
    assert.equal(parsed.seed.url, "https://example.com/seed.jpg");
  }
});

test("malformed optional location subfields are dropped individually", () => {
  const parsed = parseWorldPayload(
    {
      ...fixture,
      seed: {
        ...fixture.seed,
        location: {
          point: { lat: 52.37, lng: 4.89 },
          role: "subject",
          provenance: "archive",
          evidenceUrl: "https://x.co/a",
          accuracyMeters: -5,
          headingDeg: Number.NaN,
          label: 42,
        },
      },
    },
    "https://example.com",
  );
  const location = parsed.seed.location;
  assert.equal(location?.role, "subject");
  assert.equal(location?.accuracyMeters, undefined);
  assert.equal(location?.headingDeg, undefined);
  assert.equal(location?.label, undefined);
});

test("heading is normalized into [0, 360)", () => {
  for (const [input, expected] of [
    [370, 10],
    [-10, 350],
    [360, 0],
  ] as const) {
    const parsed = parseWorldPayload(
      {
        ...fixture,
        seed: {
          ...fixture.seed,
          location: {
            point: { lat: 52.37, lng: 4.89 },
            role: "camera",
            provenance: "archive",
            evidenceUrl: "https://x.co/a",
            headingDeg: input,
          },
        },
      },
      "https://example.com",
    );
    assert.equal(parsed.seed.location?.headingDeg, expected);
  }
});

test("malformed cityLocation is dropped while the payload still parses", () => {
  for (const cityLocation of [
    { center: { lat: 52.4 }, bounds: CITY.bounds, source: "nominatim" },
    {
      center: CITY.center,
      bounds: { south: 60, west: 4, north: 50, east: 5 },
      source: "nominatim",
    },
    { center: CITY.center, bounds: CITY.bounds, source: "google" },
    { center: { lat: "52.4", lng: 4.9 }, bounds: CITY.bounds, source: "nominatim" },
  ]) {
    const parsed = parseWorldPayload(
      { ...fixture, meta: { canonicalCity: "Amsterdam", cityLocation } },
      "https://example.com",
    );
    assert.equal(parsed.meta.cityLocation, undefined, JSON.stringify(cityLocation));
  }
});

test("legacy payloads without any geo fields still parse", () => {
  const parsed = parseWorldPayload(fixture, "https://example.com");
  assert.equal(parsed.seed.location, undefined);
  assert.equal(parsed.meta.cityLocation, undefined);
});
