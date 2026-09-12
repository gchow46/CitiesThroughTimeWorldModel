// Cache + rate-limit + lock primitives.
// Uses Upstash Redis when UPSTASH_REDIS_REST_URL/TOKEN are set; otherwise an
// in-memory Map so dev works with zero infra.

import { Redis } from "@upstash/redis";

interface Entry {
  value: string;
  expiresAt: number;
}

class MemoryStore {
  private map = new Map<string, Entry>();

  get(key: string): string | null {
    const e = this.map.get(key);
    if (!e) return null;
    if (e.expiresAt < Date.now()) {
      this.map.delete(key);
      return null;
    }
    return e.value;
  }

  set(key: string, value: string, ttlSec: number): void {
    this.map.set(key, { value, expiresAt: Date.now() + ttlSec * 1000 });
  }

  incr(key: string, ttlSec: number): number {
    const cur = this.get(key);
    const next = (cur ? Number(cur) : 0) + 1;
    if (cur === null) this.set(key, String(next), ttlSec);
    else this.map.get(key)!.value = String(next);
    return next;
  }

  clear(): void {
    this.map.clear();
  }
}

let redis: Redis | null = null;
let warnedNoRedis = false;

function getRedis(): Redis | null {
  if (redis) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) redis = new Redis({ url, token });
  else if (!warnedNoRedis) {
    warnedNoRedis = true;
    console.warn("[cache] UPSTASH_* unset — using in-memory cache (dev only)");
  }
  return redis;
}

// globalThis: Next.js dev can evaluate module graphs per route — a plain
// module-level Map would split state between handlers.
const g = globalThis as { __cttMem?: MemoryStore; __cttLocks?: Map<string, Promise<unknown>> };
const mem = (g.__cttMem ??= new MemoryStore());

export async function cacheGet<T>(key: string): Promise<T | null> {
  const r = getRedis();
  if (r) {
    const v = await r.get<T>(key).catch(() => null);
    return (v as T) ?? null;
  }
  const raw = mem.get(key);
  return raw === null ? null : (JSON.parse(raw) as T);
}

export async function cacheSet(key: string, value: unknown, ttlSec: number): Promise<void> {
  const r = getRedis();
  if (r) await r.set(key, value, { ex: ttlSec }).catch(() => {});
  else mem.set(key, JSON.stringify(value), ttlSec);
}

/** Fixed-window counter; returns the new count. */
export async function incrWithTtl(key: string, ttlSec: number): Promise<number> {
  const r = getRedis();
  if (r) {
    const n = await r.incr(key);
    if (n === 1) await r.expire(key, ttlSec);
    return n;
  }
  return mem.incr(key, ttlSec);
}

/** Test-only: clears the in-memory store (rate limits, cached values). */
export function resetMemoryCache(): void {
  mem.clear();
}

const locks = (g.__cttLocks ??= new Map<string, Promise<unknown>>());

/** Per-key mutex — collapses concurrent cold misses for the same world. */
export async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve();
  const run = prev.then(fn);
  locks.set(
    key,
    run.then(
      () => {},
      () => {},
    ),
  );
  try {
    return await run;
  } finally {
    locks.delete(key);
  }
}
