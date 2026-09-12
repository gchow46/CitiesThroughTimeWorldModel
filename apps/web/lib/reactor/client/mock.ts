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
  const seed = {
    url: "/preview-city.svg",
    title: "Imagined canal street — UI illustration, not an archival photo",
    author: "Cities Through Time",
    license: "Local UI illustration",
    sourceUrl: "",
  };
  return {
    model: { id, reactorModelName: `reactor/${id}` },
    sessionToken: "local-preview-not-a-token",
    seed,
    alternates: [{ ...seed, title: "Alternate UI illustration — not an archival photo" }],
    enabledModels: [...MODEL_IDS],
    prompt: "Local preview only",
    meta: { canonicalCity: request.city },
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
