import { afterEach, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as worldRoute } from "../app/api/world/route";
import { POST as tokenRoute } from "../app/api/reactor/token/route";
import { mockWorldPayload, MOCK_STAGES } from "../lib/mock/world";
import { MODEL_IDS, type WorldPayload as BackendPayload } from "../lib/types";
import { MODELS } from "../lib/reactor/registry";
import { CAPABILITIES } from "../lib/reactor/client/capabilities";
import {
  parseWorldPayload,
  readWorldResponse,
  refreshToken,
  WorldError,
} from "../lib/world-client";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

test("actual backend NDJSON routes feed the frontend for both models", async () => {
  vi.stubEnv("MOCK_WORLD", "1");
  vi.stubEnv("ENABLED_MODELS", MODEL_IDS.join(","));
  for (const model of MODEL_IDS) {
    const request = new NextRequest("http://localhost:3000/api/world", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ city: "Amsterdam", decade: 1960, model }),
    });
    const response = await worldRoute(request);
    const stages: string[] = [];
    const payload = await readWorldResponse(response, "http://localhost:3000", (event) =>
      stages.push(event.stage),
    );
    expect(payload.model.id).toBe(model);
    expect(payload.alternates).toHaveLength(3);
    expect(stages).toEqual(MOCK_STAGES.map((stage) => stage.stage));
    expect(payload.seed.url).toBe("http://localhost:3000/mock/amsterdam-1960.svg");
    expect(payload.seed.licenseConfidence).toBe("high");
  }
});

test("frontend refresh consumes the real token route envelope, not a jwt field", async () => {
  vi.stubEnv("MOCK_WORLD", "1");
  vi.stubEnv("ENABLED_MODELS", MODEL_IDS.join(","));
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init: RequestInit) =>
      tokenRoute(
        new NextRequest(new URL(url, "http://localhost:3000"), {
          ...init,
          signal: init.signal ?? undefined,
        }),
      ),
    ),
  );
  for (const model of MODEL_IDS)
    expect(await refreshToken(model, new AbortController().signal)).toBe(`mock-jwt.${model}.dev`);
});

test("optional backend seed metadata renders honest fallbacks", () => {
  const body: BackendPayload = mockWorldPayload("lingbot-world-2");
  body.seed = {
    url: "/seed.jpg",
    thumbUrl: "/thumb.jpg",
    source: "wikimedia",
    licenseConfidence: "low",
    restored: false,
  };
  const parsed = parseWorldPayload(body, "http://localhost:3000");
  expect(parsed.seed.author).toBe("Author not provided");
  expect(parsed.seed.license).toBe("License not provided");
  expect(parsed.seed.sourceUrl).toBe("");
  expect(parsed.seed.licenseConfidence).toBe("low");
});

test("client capability flags match the preserved server registry", () => {
  for (const model of MODEL_IDS) expect(MODELS[model]().caps).toMatchObject(CAPABILITIES[model]);
});

test("NDJSON handles split UTF-8, CRLF and a final line without newline", async () => {
  const text = `${JSON.stringify({ stage: "sourcing", detail: "Montréal" })}\r\n${JSON.stringify(mockWorldPayload("lingbot-world-2"))}`;
  const encoded = new TextEncoder().encode(text);
  const stream = new ReadableStream({
    start(controller) {
      for (let i = 0; i < encoded.length; i += 3) controller.enqueue(encoded.slice(i, i + 3));
      controller.close();
    },
  });
  const details: string[] = [];
  const payload = await readWorldResponse(
    new Response(stream, { headers: { "content-type": "application/x-ndjson" } }),
    "http://localhost:3000",
    (event) => details.push(event.detail),
  );
  expect(details).toEqual(["Montréal"]);
  expect(payload.model.id).toBe("lingbot-world-2");
});

test("a terminal streamed backend error never becomes a world payload", async () => {
  const response = new Response(
    '{"stage":"sourcing"}\n{"status":404,"error":"insufficient_archival_photos","closestDecade":1970}\n',
    { headers: { "content-type": "application/x-ndjson" } },
  );
  await expect(readWorldResponse(response, "http://localhost:3000")).rejects.toMatchObject({
    code: "insufficient_archival_photos",
    closestDecade: 1970,
  });
});

test("a truncated progress-only stream fails", async () => {
  await expect(
    readWorldResponse(
      new Response('{"stage":"sourcing"}', { headers: { "content-type": "application/x-ndjson" } }),
      "http://localhost:3000",
    ),
  ).rejects.toBeInstanceOf(WorldError);
});
