import { describe, expect, it, vi, afterEach } from "vitest";
import sharp from "sharp";
import { scoreWalkability, walkabilityFromRaw } from "./walkability";
import type { SeedCandidate } from "./types";

const W = 96;
const H = 54;

/** Smooth top (sky) + chosen bottom-centre texture. */
function grid(bottom: "smooth" | "noisy"): Uint8Array {
  const px = new Uint8Array(W * H).fill(200);
  for (let y = Math.floor(H * 0.55); y < H; y++)
    for (let x = Math.floor(W * 0.25); x < Math.ceil(W * 0.75); x++)
      px[y * W + x] = bottom === "smooth" ? 120 : (x + y) % 2 === 0 ? 20 : 235;
  return px;
}

describe("walkabilityFromRaw", () => {
  it("scores an open foreground high and a cluttered one low", () => {
    const open = walkabilityFromRaw(grid("smooth"), W, H);
    const cluttered = walkabilityFromRaw(grid("noisy"), W, H);
    expect(open).toBeGreaterThan(0.9);
    expect(cluttered).toBeLessThan(0.2);
  });
});

describe("scoreWalkability", () => {
  afterEach(() => vi.unstubAllGlobals());

  const cand = (url: string): SeedCandidate => ({
    url,
    source: "wikimedia",
    year: 1960,
    licenseConfidence: "high",
  });

  it("uses the 160px Commons thumb and sets walkability on the candidate", async () => {
    // A tiny JPEG with a smooth lower half.
    const px = new Uint8Array(W * H).fill(180);
    const jpeg = await sharp(px, { raw: { width: W, height: H, channels: 1 } })
      .jpeg()
      .toBuffer();
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(new Response(jpeg, { headers: { "content-type": "image/jpeg" } })),
      );
    vi.stubGlobal("fetch", fetchMock);

    const out = await scoreWalkability([
      cand("https://upload.wikimedia.org/wikipedia/commons/a/af/Street_1960.jpg"),
    ]);
    expect(out[0].walkability).toBeGreaterThan(0.9);
    expect(fetchMock.mock.calls[0][0]).toContain(
      "/thumb/a/af/Street_1960.jpg/160px-Street_1960.jpg",
    );
  });

  it("leaves walkability unset when the image can't be fetched", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("boom")));
    const out = await scoreWalkability([cand("https://x.example/y.jpg")]);
    expect(out[0].walkability).toBeUndefined();
  });

  it("only scores the first `limit` candidates", async () => {
    const px = new Uint8Array(W * H).fill(180);
    const jpeg = await sharp(px, { raw: { width: W, height: H, channels: 1 } })
      .jpeg()
      .toBuffer();
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(new Response(jpeg, { headers: { "content-type": "image/jpeg" } })),
      );
    vi.stubGlobal("fetch", fetchMock);

    const many = Array.from({ length: 12 }, (_, i) => cand(`https://x.example/${i}.jpg`));
    const out = await scoreWalkability(many, 3);
    expect(out.slice(0, 3).every((c) => c.walkability !== undefined)).toBe(true);
    expect(out.slice(3).every((c) => c.walkability === undefined)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
