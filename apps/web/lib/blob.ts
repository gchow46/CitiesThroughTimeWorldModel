// Seed artifact storage. Vercel Blob when BLOB_READ_WRITE_TOKEN is set;
// otherwise an in-memory store served by /api/seed/[...path] for local dev.

import { put } from "@vercel/blob";

interface Stored {
  body: Buffer;
  contentType: string;
}

const memStore = new Map<string, Stored>();

export function blobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

/** Stores bytes at `path` (e.g. seeds/amsterdam/1960/ab12cd.jpg); returns a public URL. */
export async function putBlob(path: string, body: Buffer, contentType: string): Promise<string> {
  if (blobConfigured()) {
    const blob = await put(path, body, {
      access: "public",
      contentType,
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return blob.url;
  }
  memStore.set(path, { body, contentType });
  return `/api/seed/${path}`;
}

export function getLocalBlob(path: string): Stored | null {
  return memStore.get(path) ?? null;
}
