import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

const ENV_KEYS = ["MOCK_WORLD", "REACTOR_API_KEY", "ENABLED_MODELS", "WORLD_MODEL"] as const;
const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.unstubAllGlobals();
});

function req(body: unknown, url = "http://localhost/api/reactor/token") {
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/reactor/token", () => {
  it("returns a mock token per model when MOCK_WORLD=1", async () => {
    process.env.MOCK_WORLD = "1";
    const res = await POST(req({ model: "lingbot-world-2" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.model).toBe("lingbot-world-2");
    expect(json.token).toContain("lingbot-world-2");
  });

  it("rejects unknown or disabled models with 400 unsupported_model", async () => {
    process.env.MOCK_WORLD = "1";
    process.env.ENABLED_MODELS = "happy-oyster-adventure";

    for (const model of ["midjourney", "lingbot-world-2"]) {
      const res = await POST(req({ model }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("unsupported_model");
    }
  });

  it("scopes the upstream mint to the requested model and never leaks the key", async () => {
    delete process.env.MOCK_WORLD;
    process.env.REACTOR_API_KEY = "rk_test_secret_123";

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ token: "jwt.abc", expires_at: "2026-01-01T00:00:00Z" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(req({ model: "happy-oyster-adventure" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.token).toBe("jwt.abc");
    expect(JSON.stringify(json)).not.toContain("rk_test_secret_123");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.reactor.inc/tokens");
    expect(init.headers.Authorization).toBe("Bearer rk_test_secret_123");
    const sent = JSON.parse(init.body);
    // token for model X is scoped so it cannot open model Y
    expect(sent.authorization_details[0].resources.models.match).toEqual([
      "reactor/happy-oyster-adventure",
    ]);
    expect(sent.constraints.max_sessions).toBe(2);
  });

  it("returns 502 when the key is missing outside mock mode", async () => {
    delete process.env.MOCK_WORLD;
    delete process.env.REACTOR_API_KEY;
    const res = await POST(req({ model: "lingbot-world-2" }));
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error).toBe("upstream_failed");
  });

  it("returns 502 when Reactor upstream fails, without the key", async () => {
    delete process.env.MOCK_WORLD;
    process.env.REACTOR_API_KEY = "rk_test_secret_123";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 401 })));

    const res = await POST(req({}));
    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toContain("rk_test_secret_123");
  });
});
