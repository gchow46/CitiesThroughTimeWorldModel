import { NextRequest } from "next/server";
import { getLocalBlob } from "@/lib/blob";

export const runtime = "nodejs";

/** Serves locally-stored seed artifacts when BLOB_READ_WRITE_TOKEN is unset (dev). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const stored = getLocalBlob(path.join("/"));
  if (!stored) return new Response("not found", { status: 404 });
  return new Response(stored.body as BodyInit, {
    headers: { "content-type": stored.contentType, "cache-control": "no-store" },
  });
}
