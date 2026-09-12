import { HappyOysterModel } from "@reactor-models/happy-oyster";
import { AdapterBus, defineAdapter, type AdapterFactory } from "./adapter";
import { CAPABILITIES } from "./capabilities";
import { OYSTER_ROTATIONS, OYSTER_TRANSLATIONS } from "./controls";
import { sdkError, WorldError } from "../../world-client";
import type { WorldPayload } from "../../frontend-types";

export const createHappyOyster: AdapterFactory = (video) => {
  const model = new HappyOysterModel({
    mode: "adventure",
    videoElement: video,
    logLevel: (process.env.NEXT_PUBLIC_REACTOR_LOG_LEVEL ?? "off") as
      | "off"
      | "error"
      | "warn"
      | "info"
      | "debug"
      | "trace",
  });
  const bus = new AdapterBus();
  let disposed = false;
  let reseeding = false;
  let cleanup: Promise<void> | undefined;
  const active = () => {
    if (disposed) throw new DOMException("Cancelled", "AbortError");
  };
  const onError = (error: unknown) => {
    if (!disposed) bus.emit("error", sdkError(error));
  };
  const unlisten = [
    model.onTravelError(onError),
    model.onPhaseChanged((phase) => {
      if (disposed) return;
      bus.emit("status", phase);
      if (phase === "ended" && !reseeding) bus.emit("ended", undefined);
      if (phase === "failed") bus.emit("error", new WorldError("connection_failed"));
    }),
  ];
  model.on("error", onError);
  const seed = async (payload: WorldPayload, signal: AbortSignal) => {
    active();
    signal.throwIfAborted();
    if (payload.prompt.length > 2000) throw new WorldError("invalid_response");
    const world = payload.modelState?.encryptedWorldId
      ? await model.attachWorld(payload.modelState.encryptedWorldId)
      : await model.createWorld({
          prompt: payload.prompt,
          firstFrameImageUrl: payload.seed.url,
          perspective: "first_person",
        });
    active();
    signal.throwIfAborted();
    if (world.phase !== "ready") throw new WorldError("connection_failed");
    if (world.encrypted_world_id)
      bus.emit("modelState", { encryptedWorldId: world.encrypted_world_id });
  };
  const start = async () => {
    active();
    const result = await model.startTravel();
    active();
    if (!result.streaming) throw new WorldError("connection_failed");
  };
  return defineAdapter({
    caps: CAPABILITIES["happy-oyster-adventure"],
    on: bus.on,
    seed,
    start,
    async connect(token) {
      active();
      await model.connect(token);
      active();
    },
    async setPrompt() {
      throw new WorldError("unsupported_model");
    },
    async reseed(payload, signal) {
      active();
      reseeding = true;
      try {
        await model.stop();
        await model.endTravelSession();
        active();
        await seed({ ...payload, modelState: undefined }, signal);
        await start();
      } finally {
        reseeding = false;
      }
    },
    async applyControls(state) {
      if (disposed) return;
      await model.hold({
        translation: OYSTER_TRANSLATIONS[state.forward + 1][state.right + 1],
        rotation: OYSTER_ROTATIONS[state.lookY + 1][state.lookX + 1],
      });
    },
    dispose() {
      if (cleanup) return cleanup;
      disposed = true;
      unlisten.forEach((off) => off());
      bus.clear();
      model.off("error", onError);
      cleanup = model.disconnect();
      return cleanup;
    },
  });
};
