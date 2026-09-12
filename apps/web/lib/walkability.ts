import sharp from "sharp";
import type { SeedCandidate } from "@/lib/types";
import { fetchImage } from "./image";

// Scores how "walkable" a candidate's foreground is: a walkable street photo
// has a smooth, open ground plane in the lower-centre of the frame (that's
// effectively the world model's spawn view). Parked cars, crowds and works
// show up as dense edge blobs there.
//
// Heuristic: downscale to a tiny grayscale grid, take mean |dx|+|dy| gradient
// magnitude over the bottom-centre region, map to 0–1.

const GRID_W = 96;
const GRID_H = 54;
// Region of interest: bottom 45% of the frame, horizontally centred half.
// Gradient means: ~8 → open pavement → 1.0; ~58+ → cluttered → 0.
const GRAD_FLOOR = 8;
const GRAD_SPAN = 50;

const THUMB_BYTES = 3 * 1024 * 1024;
const THUMB_TIMEOUT_MS = 4_000;
const SCORE_LIMIT = 8; // only the top metadata-ranked candidates get pixels

/**
 * Mean gradient magnitude over the walkable region → 0–1.
 * Exported for tests on synthetic buffers.
 */
export function walkabilityFromRaw(gray: Uint8Array, width: number, height: number): number {
  const top = Math.floor(height * 0.55);
  const left = Math.floor(width * 0.25);
  const right = Math.ceil(width * 0.75);
  let sum = 0;
  let n = 0;
  for (let y = Math.max(1, top); y < height - 1; y++) {
    for (let x = Math.max(1, left); x < Math.min(right, width - 1); x++) {
      const i = y * width + x;
      sum += Math.abs(gray[i + 1] - gray[i]) + Math.abs(gray[i + width] - gray[i]);
      n++;
    }
  }
  if (n === 0) return 0.5;
  const mean = sum / n;
  return Math.max(0, Math.min(1, 1 - (mean - GRAD_FLOOR) / GRAD_SPAN));
}

/** Commons thumb derivation — 160px wide, ~15–30KB instead of the full scan. */
function thumbUrlFor(c: SeedCandidate): string {
  const m = c.url.match(
    /^(https:\/\/upload\.wikimedia\.org\/wikipedia\/commons)\/([0-9a-f]\/[0-9a-f]{2}\/)(.+)$/,
  );
  if (!m) return c.url;
  const [, host, hash, name] = m;
  const suffix = /\.(tiff?|jfif|webp)$/i.test(name) ? `${name}.jpg` : name;
  return `${host}/thumb/${hash}${name}/160px-${suffix.replace(/^.*\//, "")}`;
}

async function scoreOne(c: SeedCandidate): Promise<number> {
  const buf = await fetchImage(thumbUrlFor(c), {
    timeoutMs: THUMB_TIMEOUT_MS,
    maxBytes: THUMB_BYTES,
  });
  const { data, info } = await sharp(buf)
    .rotate()
    .resize(GRID_W, GRID_H, { fit: "fill" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return walkabilityFromRaw(
    new Uint8Array(data.buffer, data.byteOffset, data.length),
    info.width,
    info.height,
  );
}

/**
 * Attaches `walkability` (0–1) to up to `limit` candidates — intended for the
 * metadata-ranked shortlist. Fetch/score failures leave the field unset so
 * ranking treats them as neutral; a total outage costs nothing but latency.
 */
export async function scoreWalkability(
  candidates: SeedCandidate[],
  limit = SCORE_LIMIT,
): Promise<SeedCandidate[]> {
  const head = candidates.slice(0, limit);
  const scored = await Promise.allSettled(
    head.map(async (c) => ({ c, walkability: await scoreOne(c) })),
  );
  const byUrl = new Map(
    scored
      .filter((r): r is PromiseFulfilledResult<{ c: SeedCandidate; walkability: number }> => {
        if (r.status === "rejected")
          console.warn(`[walkability] ${r.reason instanceof Error ? r.reason.message : r.reason}`);
        return r.status === "fulfilled";
      })
      .map((r) => [r.value.c.url, r.value.walkability]),
  );
  return candidates.map((c) => (byUrl.has(c.url) ? { ...c, walkability: byUrl.get(c.url) } : c));
}
