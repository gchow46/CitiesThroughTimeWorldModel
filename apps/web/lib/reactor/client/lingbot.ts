import { LingbotWorld2Model } from "@reactor-models/lingbot-world-2";
import { AdapterBus, defineAdapter, type AdapterFactory } from "./adapter";
import { IDLE, type Controls } from "./controls";
import { CAPABILITIES } from "./capabilities";
import { sdkError, WorldError } from "../../world-client";
import type { WorldPayload } from "../../frontend-types";

export const createLingbot: AdapterFactory = (video) => {
  const model = new LingbotWorld2Model({
    logLevel: (process.env.NEXT_PUBLIC_REACTOR_LOG_LEVEL ?? "off") as
      "off" | "error" | "warn" | "info" | "debug" | "trace",
  });
  const bus = new AdapterBus();
  let disposed = false;
  let connected = false;
  let previous: Controls = { ...IDLE };
  let cleanup: Promise<void> | undefined;
  const active = () => {
    if (disposed) throw new DOMException("Cancelled", "AbortError");
  };
  const onError = (error: unknown) => {
    if (!disposed) bus.emit("error", sdkError(error));
  };
  const onStatus = (status: string) => {
    if (disposed) return;
    bus.emit("status", status);
    if (connected && status === "disconnected") bus.emit("ended", undefined);
  };
  const onTrack = (name: string, track: MediaStreamTrack) => {
    if (disposed || name !== "main_video") return;
    video.srcObject = new MediaStream([track]);
    void video.play().catch(() => undefined);
  };
  model.on("error", onError);
  model.on("statusChanged", onStatus);
  model.on("trackReceived", onTrack);
  const unlisten = [
    model.onCommandError(onError),
    model.onChunkComplete((message) => {
      if (!disposed) bus.emit("chunk", message.chunk_index);
    }),
    model.onGenerationComplete(() => {
      if (!disposed) bus.emit("ended", undefined);
    }),
  ];
  const setPrompt = async (prompt: string) => {
    active();
    const reply = await model.setPrompt({ prompt });
    active();
    if (!reply) throw new WorldError("connection_failed");
  };
  const seed = async (payload: WorldPayload, signal: AbortSignal) => {
    active();
    const response = await fetch(payload.seed.url, { signal, credentials: "omit" });
    if (!response.ok || !response.headers.get("content-type")?.startsWith("image/"))
      throw new WorldError("image_failed");
    const blob = await response.blob();
    if (blob.size > 15 * 1024 * 1024) throw new WorldError("image_failed");
    signal.throwIfAborted();
    active();
    const file = await model.uploadFile(blob);
    active();
    const image = await model.setImage({ image: file });
    active();
    if (!image) throw new WorldError("image_failed");
    await setPrompt(payload.prompt);
  };
  return defineAdapter({
    caps: CAPABILITIES["lingbot-world-2"],
    on: bus.on,
    seed,
    setPrompt,
    async connect(token) {
      active();
      await model.connect(token);
      active();
      connected = true;
    },
    async start() {
      active();
      await model.start();
      active();
    },
    async reseed(payload, signal) {
      active();
      if (!(await model.reset())) throw new WorldError("connection_failed");
      active();
      previous = { ...IDLE };
      await seed(payload, signal);
      active();
      await model.start();
      active();
    },
    async applyControls(next) {
      if (disposed) return;
      if (next.forward !== previous.forward)
        await model.setMoveLongitudinal({
          move_longitudinal: next.forward > 0 ? "forward" : next.forward < 0 ? "back" : "idle",
        });
      if (disposed) return;
      if (next.right !== previous.right)
        await model.setMoveLateral({
          move_lateral: next.right > 0 ? "strafe_right" : next.right < 0 ? "strafe_left" : "idle",
        });
      if (disposed) return;
      if (next.lookX !== previous.lookX)
        await model.setLookHorizontal({
          look_horizontal: next.lookX > 0 ? "right" : next.lookX < 0 ? "left" : "idle",
        });
      if (disposed) return;
      if (next.lookY !== previous.lookY)
        await model.setLookVertical({
          look_vertical: next.lookY > 0 ? "up" : next.lookY < 0 ? "down" : "idle",
        });
      previous = { ...next };
    },
    dispose() {
      if (cleanup) return cleanup;
      disposed = true;
      unlisten.forEach((off) => off());
      bus.clear();
      model.off("error", onError);
      model.off("statusChanged", onStatus);
      model.off("trackReceived", onTrack);
      cleanup = model.disconnect();
      return cleanup;
    },
  });
};
