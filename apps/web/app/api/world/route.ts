import { NextRequest } from "next/server";
import { isMockWorld } from "@/lib/env";
import { apiError } from "@/lib/errors";
import {
  resolveInputFromRequest,
  resolveModel,
  UnsupportedModelError,
} from "@/lib/reactor/registry";
import { mockWorldPayload, MOCK_STAGES } from "@/lib/mock/world";
import { runWorldPipeline } from "@/lib/orchestrate";
import { incrWithTtl } from "@/lib/cache";
import { InvalidCityError } from "@/lib/geocode";
import { InsufficientPhotosError } from "@/lib/ranking";
import { UpstreamError } from "@/lib/reactor/token";
import { MAX_DECADE, MIN_DECADE, type WorldRequest } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const RATE_LIMIT = 10; // requests / minute / IP

function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "anon";
}

function ndjsonStream(lines: unknown[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for (const l of lines) controller.enqueue(encoder.encode(JSON.stringify(l) + "\n"));
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8" },
  });
}

function errorStatus(e: unknown): { status: number; body: Record<string, unknown> } | null {
  if (e instanceof InvalidCityError)
    return { status: 400, body: { error: e.code, message: e.message } };
  if (e instanceof UnsupportedModelError)
    return { status: 400, body: { error: e.code, message: e.message } };
  if (e instanceof InsufficientPhotosError)
    return {
      status: 404,
      body: { error: e.code, message: e.message, closestDecade: e.closestDecade },
    };
  if (e instanceof UpstreamError)
    return { status: 502, body: { error: e.code, message: e.message } };
  return null;
}

/**
 * POST /api/world — NDJSON progress stream; final line is the WorldPayload.
 * MOCK_WORLD=1 → canned Amsterdam-1960 payloads. Otherwise runs the real
 * geocode → sources → rank → normalize → prompt → token pipeline (B7).
 */
export async function POST(req: NextRequest) {
  const allowed = await incrWithTtl(`rl:world:${clientIp(req)}`, 60);
  if (allowed > RATE_LIMIT) {
    return apiError(429, "rate_limited", "Too many requests — 10/min/IP.");
  }

  const body = (await req.json().catch(() => null)) as Partial<WorldRequest> | null;

  if (!body || typeof body.city !== "string" || body.city.trim().length === 0) {
    return apiError(400, "invalid_city", "Body must include a non-empty 'city' string.");
  }
  if (
    typeof body.decade !== "number" ||
    body.decade < MIN_DECADE ||
    body.decade > MAX_DECADE ||
    body.decade % 10 !== 0
  ) {
    return apiError(
      400,
      "unsupported_decade",
      `'decade' must be a multiple of 10 in [${MIN_DECADE}, ${MAX_DECADE}].`,
    );
  }

  let model;
  try {
    model = resolveModel({ ...resolveInputFromRequest(req), modelParam: body.model ?? null });
  } catch (e) {
    if (e instanceof UnsupportedModelError) {
      return apiError(400, "unsupported_model", e.message);
    }
    throw e;
  }

  if (isMockWorld()) {
    return ndjsonStream([...MOCK_STAGES, mockWorldPayload(model)]);
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(encoder.encode(JSON.stringify(o) + "\n"));
      try {
        const payload = await runWorldPipeline(
          { city: body.city!, decade: body.decade!, model },
          send,
        );
        send(payload);
      } catch (e) {
        const known = errorStatus(e);
        if (known) send({ status: known.status, ...known.body });
        else {
          console.error("[world] pipeline failed:", e);
          send({ status: 502, error: "upstream_failed", message: "World pipeline failed." });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8" },
  });
}
