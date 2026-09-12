import {
  MODEL_IDS,
  type ModelId,
  type WorldPayload,
  type WorldRequest,
} from "../../frontend-types";
import { AdapterBus, defineAdapter, type AdapterFactory } from "./adapter";
import { CAPABILITIES } from "./capabilities";
import { WorldError } from "../../world-client";

export function mockPayload(request: WorldRequest): WorldPayload {
  const id = request.model ?? "lingbot-world-2";
  const seed: WorldPayload["seed"] = {
    url: "/preview-city.svg",
    title: "Imagined canal street — UI illustration, not an archival photo",
    author: "Cities Through Time",
    license: "Local UI illustration",
    sourceUrl: "",
    // Synthetic preview anchor (Damrak, Amsterdam) for the Then & Now pane.
    // Clearly labelled — this is not real archive evidence.
    location: {
      point: { lat: 52.3779, lng: 4.8975 },
      role: "camera",
      provenance: "curated",
      evidenceUrl: "https://commons.wikimedia.org/wiki/Amsterdam",
      label: "Synthetic preview anchor — Damrak, Amsterdam",
      headingDeg: 250,
      reviewedAt: "2026-09-12",
    },
  };
  return {
    model: { id, reactorModelName: `reactor/${id}` },
    sessionToken: "local-preview-not-a-token",
    seed,
    // The alternate deliberately has no location so the preview exercises the
    // "photo location unknown — choose a reference point" flow on re-seed.
    alternates: [
      {
        url: "/preview-city.svg",
        title: "Alternate UI illustration — not an archival photo",
        author: "Cities Through Time",
        license: "Local UI illustration",
        sourceUrl: "",
      },
    ],
    enabledModels: [...MODEL_IDS],
    prompt: "Local preview only",
    meta: {
      canonicalCity: request.city,
      cityLocation: {
        center: { lat: 52.3676, lng: 4.9041 },
        bounds: { south: 52.28, west: 4.73, north: 52.43, east: 5.08 },
        source: "nominatim",
      },
    },
  };
}

export function mockFactory(id: ModelId): AdapterFactory {
  return () => {
    const bus = new AdapterBus();
    let disposed = false;
    const active = () => {
      if (disposed) throw new DOMException("Cancelled", "AbortError");
    };
    return defineAdapter({
      caps: CAPABILITIES[id],
      on: bus.on,
      async connect() {
        active();
        bus.emit("status", "preview-connected");
      },
      async seed() {
        active();
        bus.emit("status", "preview-seeded");
      },
      async start() {
        active();
        bus.emit("status", "preview-ready");
      },
      async reseed() {
        active();
        bus.emit("status", "preview-reseeded");
      },
      async setPrompt() {
        active();
        if (!CAPABILITIES[id].supportsHotPrompt) throw new WorldError("unsupported_model");
      },
      async applyControls() {
        active();
      },
      async dispose() {
        disposed = true;
        bus.clear();
      },
    });
  };
}
