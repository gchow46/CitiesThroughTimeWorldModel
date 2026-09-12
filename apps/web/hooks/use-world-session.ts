"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import {
  asFailure,
  refreshToken,
  requestWorld,
  saveModelState,
  sdkError,
  validateRequest,
  WorldError,
} from "../lib/world-client";
import {
  isModelId,
  type ModelId,
  type WorldFailure,
  type WorldPayload,
  type WorldPhase,
  type WorldProgress,
  type WorldRequest,
} from "../lib/frontend-types";
import { getAdapterFactory } from "../lib/reactor/client/registry";
import type { WorldModelAdapter } from "../lib/reactor/client/adapter";
import { ControlQueue, type Controls } from "../lib/reactor/client/controls";
import { mockPayload } from "../lib/reactor/client/mock";
import { SessionRun } from "../lib/session-run";

export type WorldSessionState = {
  phase: WorldPhase;
  payload?: WorldPayload;
  failure?: WorldFailure;
  request?: WorldRequest;
  preview: boolean;
  progress?: WorldProgress;
  engineStatus?: string;
  chunk?: number;
  notice?: string;
  promptBusy?: boolean;
  backendMock?: boolean;
};
const INITIAL: WorldSessionState = { phase: "idle", preview: false };

export function useWorldSession(
  videoRef: RefObject<HTMLVideoElement | null>,
  getVideo: (signal: AbortSignal) => Promise<HTMLVideoElement>,
  onPrepared: () => void,
) {
  const [state, setState] = useState<WorldSessionState>(INITIAL);
  const runRef = useRef<SessionRun | null>(null);
  const adapterRef = useRef<WorldModelAdapter | null>(null);
  const controlsRef = useRef<ControlQueue | null>(null);
  const cleanupRef = useRef<Promise<void>>(Promise.resolve());
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mutationRef = useRef(false);

  const teardown = useCallback(() => {
    clearTimeout(timeoutRef.current);
    controlsRef.current?.close();
    controlsRef.current = null;
    adapterRef.current = null;
    mutationRef.current = false;
    const run = runRef.current;
    runRef.current = null;
    if (run) cleanupRef.current = run.stop();
    void cleanupRef.current.catch(() => undefined);
    if (typeof document !== "undefined" && document.pointerLockElement) document.exitPointerLock();
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.srcObject = null;
      video.removeAttribute("src");
      video.load();
    }
  }, [videoRef]);
  const exit = useCallback(() => {
    teardown();
    setState(INITIAL);
  }, [teardown]);
  useEffect(() => teardown, [teardown]);

  const failRun = useCallback(
    (run: SessionRun, error: unknown, ended = false) => {
      if (runRef.current !== run || run.abort.signal.aborted) return;
      teardown();
      setState((s) => ({ ...s, phase: ended ? "ended" : "error", failure: asFailure(error) }));
    },
    [teardown],
  );

  const armPlayback = useCallback(
    (run: SessionRun, adapter: WorldModelAdapter, video: HTMLVideoElement, preview: boolean) => {
      let started = false;
      let activated = false;
      const playable = () => {
        if (!started || activated || runRef.current !== run || run.abort.signal.aborted) return;
        activated = true;
        clearTimeout(timeoutRef.current);
        controlsRef.current = new ControlQueue(
          (controls) => adapter.applyControls(controls),
          () => failRun(run, new WorldError("connection_failed")),
        );
        setState((s) => ({ ...s, phase: "walking", failure: undefined }));
        video.removeEventListener("playing", playable);
      };
      video.addEventListener("playing", playable, { signal: run.abort.signal });
      return () => {
        started = true;
        if (preview || (!video.paused && video.readyState >= 2)) playable();
      };
    },
    [failRun],
  );

  const begin = useCallback(
    async (input: WorldRequest, preview = false, existing?: WorldPayload) => {
      teardown();
      const run = new SessionRun();
      runRef.current = run;
      const current = () => runRef.current === run && !run.abort.signal.aborted;
      setState({ phase: existing ? "refreshing" : "requesting", request: input, preview });
      timeoutRef.current = setTimeout(() => failRun(run, new WorldError("timeout")), 120_000);
      try {
        await cleanupRef.current;
        run.check();
        const query = new URLSearchParams(window.location.search).get("model");
        const cookie = document.cookie
          .split("; ")
          .find((part) => part.startsWith("ctt_model="))
          ?.slice("ctt_model=".length);
        const chosen = input.model ?? query ?? cookie;
        if (chosen && !isModelId(chosen)) throw new WorldError("unsupported_model");
        const request = { ...input, model: chosen ? (chosen as ModelId) : undefined };
        validateRequest(request);
        const payload = existing
          ? {
              ...existing,
              sessionToken: preview
                ? existing.sessionToken
                : await refreshToken(existing.model.id, run.abort.signal),
            }
          : preview
            ? mockPayload(request)
            : await requestWorld(request, run.abort.signal, (progress) => {
                if (current()) setState((s) => ({ ...s, phase: "sourcing", progress }));
              });
        run.check();
        const backendMock = payload.sessionToken === `mock-jwt.${payload.model.id}.dev`;
        const previewAllowed =
          process.env.NODE_ENV === "development" ||
          process.env.NEXT_PUBLIC_ENABLE_PREVIEW === "true";
        if (backendMock && !previewAllowed) throw new WorldError("mock_backend");
        const sessionPreview = preview || backendMock;
        setState((s) => ({
          ...s,
          phase: "connecting",
          request,
          payload,
          preview: sessionPreview,
          backendMock,
        }));
        onPrepared();
        const factory = await getAdapterFactory(payload.model.id, sessionPreview);
        run.check();
        const video = await getVideo(run.abort.signal);
        run.check();
        const adapter = factory(video);
        adapterRef.current = adapter;
        const off = [
          adapter.on("error", (error) => failRun(run, error)),
          adapter.on("ended", () => failRun(run, new WorldError("session_ended"), true)),
          adapter.on("status", (engineStatus) => {
            if (current()) setState((s) => ({ ...s, engineStatus }));
          }),
          adapter.on("chunk", (chunk) => {
            if (current()) setState((s) => ({ ...s, chunk }));
          }),
          adapter.on("modelState", (modelState) => {
            if (!current()) return;
            setState((s) => ({
              ...s,
              payload: s.payload ? { ...s.payload, modelState } : undefined,
            }));
            if (!sessionPreview)
              void saveModelState(request, payload.model.id, modelState, run.abort.signal).catch(
                () => {
                  if (current())
                    setState((s) => ({
                      ...s,
                      notice:
                        "World is running, but the backend could not save its reattach state.",
                    }));
                },
              );
          }),
        ];
        run.abort.signal.addEventListener(
          "abort",
          () => off.forEach((unsubscribe) => unsubscribe()),
          { once: true },
        );
        await run.attach(adapter);
        run.check();
        await adapter.connect(payload.sessionToken);
        run.check();
        setState((s) => ({ ...s, phase: "seeding" }));
        await adapter.seed(payload, run.abort.signal);
        run.check();
        setState((s) => ({ ...s, phase: "ready" }));
        const finish = armPlayback(run, adapter, video, sessionPreview);
        await adapter.start();
        run.check();
        finish();
      } catch (error) {
        failRun(run, error instanceof WorldError ? error : sdkError(error));
      }
    },
    [armPlayback, failRun, getVideo, onPrepared, teardown],
  );

  const reseed = useCallback(async () => {
    const run = runRef.current;
    const adapter = adapterRef.current;
    const payload = state.payload;
    if (
      !run ||
      !adapter ||
      !payload ||
      !payload.alternates?.length ||
      state.phase !== "walking" ||
      mutationRef.current
    )
      return;
    mutationRef.current = true;
    const next = {
      ...payload,
      seed: payload.alternates[0],
      alternates: [...payload.alternates.slice(1), payload.seed],
      modelState: undefined,
    };
    setState((s) => ({ ...s, phase: "reseeding", payload: next, notice: undefined }));
    timeoutRef.current = setTimeout(() => failRun(run, new WorldError("timeout")), 120_000);
    try {
      await controlsRef.current?.closeAndStop();
      run.check();
      controlsRef.current = null;
      if (document.pointerLockElement) document.exitPointerLock();
      const video = await getVideo(run.abort.signal);
      video.pause();
      const finish = armPlayback(run, adapter, video, state.preview);
      await adapter.reseed(next, run.abort.signal);
      run.check();
      setState((s) => ({ ...s, phase: "ready" }));
      void video.play().catch(() => undefined);
      finish();
    } catch (error) {
      failRun(run, error);
    } finally {
      if (runRef.current === run) mutationRef.current = false;
    }
  }, [state, getVideo, armPlayback, failRun]);

  const setAtmosphere = useCallback(
    async (suffix: string) => {
      const run = runRef.current;
      const adapter = adapterRef.current;
      if (
        !run ||
        !adapter?.caps.supportsHotPrompt ||
        !state.payload ||
        state.phase !== "walking" ||
        mutationRef.current
      )
        return;
      mutationRef.current = true;
      setState((s) => ({ ...s, promptBusy: true, notice: undefined }));
      try {
        await adapter.setPrompt(`${state.payload.prompt}${suffix ? `\n${suffix}` : ""}`);
        run.check();
      } catch {
        if (!run.abort.signal.aborted)
          setState((s) => ({
            ...s,
            notice: "The atmosphere change was not accepted. Your session is still open.",
          }));
      } finally {
        if (runRef.current === run) {
          mutationRef.current = false;
          setState((s) => ({ ...s, promptBusy: false }));
        }
      }
    },
    [state],
  );

  const reconnect = useCallback(() => {
    if (state.request && state.payload)
      void begin(
        { ...state.request, model: state.payload.model.id },
        state.preview && !state.backendMock,
        state.payload,
      );
  }, [begin, state]);
  const switchModel = useCallback(
    (model: ModelId) => {
      if (
        !state.request ||
        (state.payload?.enabledModels && !state.payload.enabledModels.includes(model))
      )
        return;
      document.cookie = `ctt_model=${model}; Path=/; SameSite=Lax; Max-Age=86400${location.protocol === "https:" ? "; Secure" : ""}`;
      const url = new URL(location.href);
      url.searchParams.set("model", model);
      window.history.replaceState(null, "", url);
      void begin({ ...state.request, model }, state.preview && !state.backendMock);
    },
    [begin, state],
  );
  const setControls = useCallback((controls: Controls) => {
    controlsRef.current?.set(controls);
  }, []);
  return { state, begin, exit, setControls, reseed, setAtmosphere, reconnect, switchModel };
}
