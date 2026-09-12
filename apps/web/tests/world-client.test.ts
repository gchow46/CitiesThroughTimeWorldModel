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
