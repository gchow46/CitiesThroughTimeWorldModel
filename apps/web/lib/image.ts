import crypto from "node:crypto";
import sharp from "sharp";
import type { Seed, SeedCandidate } from "@/lib/types";
import { putBlob } from "./blob";
import { MODELS } from "./reactor/registry";

const MAX_BYTES = 15 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 10_000;
const RESTORE_TIMEOUT_MS = 10_000;
const TARGET_W = 1280;
const TARGET_H = 720;
const TARGET_ASPECT = TARGET_W / TARGET_H;

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/tiff"]);

async function fetchImage(url: string): Promise<Buffer> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    // Wikimedia upload servers 429 requests without a descriptive UA.
    headers: {
      "user-agent":
        "CitiesThroughTime/0.1 (https://github.com/gchow46/CitiesThroughTimeWorldModel)",
    },
  });
  if (!res.ok) throw new Error(`seed fetch ${res.status}`);
  const type = res.headers.get("content-type")?.split(";")[0].trim() ?? "";
  if (!ALLOWED_TYPES.has(type)) throw new Error(`unsupported content-type: ${type}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > MAX_BYTES) throw new Error("seed image exceeds 15MB");
  return buf;
}

/** Optional GPU restoration via the Modal endpoint (B9). sharp-only fallback. */
async function maybeRestore(buf: Buffer): Promise<{ buf: Buffer; restored: boolean }> {
  const endpoint = process.env.RESTORE_ENDPOINT;
  if (!endpoint) return { buf, restored: false };
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.RESTORE_KEY ?? ""}`,
      },
      body: JSON.stringify({ imageBase64: buf.toString("base64"), targetWidth: TARGET_W }),
      signal: AbortSignal.timeout(RESTORE_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`restore ${res.status}`);
    const out = Buffer.from(await res.arrayBuffer());
    return { buf: out, restored: true };
  } catch (e) {
    console.warn(`[image] restore failed, sharp-only: ${(e as Error).message}`);
    return { buf, restored: false };
  }
}

function assertAspectForAllModels(): void {
  for (const id of Object.keys(MODELS) as (keyof typeof MODELS)[]) {
    const a = MODELS[id]().caps.seedAspect;
    if (a && (TARGET_ASPECT < a.min || TARGET_ASPECT > a.max)) {
      throw new Error(`16:9 output violates ${id} seedAspect ${a.min}–${a.max}`);
    }
  }
}

/**
 * Fetch → (optional GPU restore) → EXIF-rotate → smart-crop 16:9 →
 * 1280×720 JPEG q85 (+ 320px thumb) → content-addressed blob store.
 */
export async function normalizeSeed(
  cand: SeedCandidate,
  citySlug: string,
  decade: number,
): Promise<Seed> {
  assertAspectForAllModels();

  const original = await fetchImage(cand.url);
  const { buf: maybeRestored, restored } = await maybeRestore(original);

  const img = sharp(maybeRestored).rotate(); // EXIF-orient
  const jpeg = await img
    .resize(TARGET_W, TARGET_H, { fit: "cover", position: "attention" })
    .jpeg({ quality: 85 })
    .toBuffer();
  const thumb = await sharp(jpeg)
    .resize(320, 180, { fit: "cover" })
    .jpeg({ quality: 80 })
    .toBuffer();

  const hash = crypto.createHash("sha256").update(jpeg).digest("hex").slice(0, 12);
  const base = `seeds/${citySlug}/${decade}/${hash}`;

  const [url, thumbUrl] = await Promise.all([
    putBlob(`${base}.jpg`, jpeg, "image/jpeg"),
    putBlob(`${base}.thumb.jpg`, thumb, "image/jpeg"),
  ]);

  return {
    url,
    thumbUrl,
    source: cand.source,
    year: cand.year,
    title: cand.title,
    author: cand.author,
    license: cand.license,
    sourceUrl: cand.sourceUrl,
    licenseConfidence: cand.licenseConfidence,
    restored,
  };
}
