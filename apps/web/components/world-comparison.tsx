"use client";

// Then & Now comparison shell. Keeps WorldViewport mounted at a stable path —
// toggling the comparison, resizing the split, or switching mobile tabs never
// remounts the video element or recreates the Reactor session.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import type { WorldPayload, WorldPhase } from "../lib/frontend-types";
import { IDLE, type Controls } from "../lib/reactor/client/controls";
import { useWorldComparison } from "../hooks/use-world-comparison";
import { WorldViewport } from "./world-viewport";
import { PresentDayPane } from "./present-day-pane";

const FLAG = process.env.NEXT_PUBLIC_ENABLE_THEN_NOW === "true";
const MIN_PANE_PX = 360;
const NARROW_QUERY = "(max-width: 800px)";

export interface WorldComparisonProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  phase: WorldPhase;
  payload?: WorldPayload;
  decade?: number;
  preview: boolean;
  onExit: () => void;
  onReseed?: () => void;
  send: (controls: Controls) => void;
  onVideo?: (video: HTMLVideoElement | null) => void;
}

export function WorldComparison(props: WorldComparisonProps) {
  // NEXT_PUBLIC_* is inlined at build time — the flag cannot change at
  // runtime, so rendering the bare viewport when off is mount-stable.
  if (!FLAG) return <WorldViewport {...props} />;
  return <ComparisonShell {...props} />;
}

function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(NARROW_QUERY);
    const update = () => setNarrow(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return narrow;
}

function ComparisonShell({
  videoRef,
  phase,
  payload,
  decade,
  preview,
  onExit,
  onReseed,
  send,
  onVideo,
}: WorldComparisonProps) {
  const available = Boolean(payload);
  const walking = phase === "walking";
  const [open, setOpen] = useState(true);
  const [armed, setArmed] = useState(false);
  const [pct, setPct] = useState(50);
  const [tab, setTab] = useState<"then" | "now">("then");
  const [panoEl, setPanoEl] = useState<HTMLElement | null>(null);
  const [mapEl, setMapEl] = useState<HTMLElement | null>(null);
  const [width, setWidth] = useState(0);
  const narrow = useNarrow();
  const splitRef = useRef<HTMLDivElement>(null);
  const releaseRef = useRef<() => void>(() => {});

  const showSplit = available && open && walking;
  const nowVisible = Boolean(showSplit && (!narrow || tab === "now"));

  // The driver is created lazily on first actual visibility, then kept alive
  // across collapse/tab switches (setVisible toggles instead of disposing).
  useEffect(() => {
    if (!available) {
      setArmed(false);
    } else if (nowVisible) {
      setArmed(true);
    }
  }, [available, nowVisible]);

  const paneMounted = available && (nowVisible || armed);

  const comparison = useWorldComparison({
    enabled: available && armed,
    preview,
    seed: payload?.seed,
    cityLocation: payload?.meta.cityLocation,
    panoramaElement: panoEl,
    mapElement: mapEl,
    visible: nowVisible,
    mapExpanded: false,
  });
  const {
    state: comparisonState,
    target,
    synthetic,
    acceptNearby,
    returnToReference,
    resize,
    retry,
    selectCityCenter,
  } = comparison;

  // Input isolation: leaving the historical control surface for the present
  // pane, divider, or any comparison UI releases held keys/pointer lock
  // and publishes normalized IDLE before the transfer completes.
  const yieldControls = useCallback(() => {
    releaseRef.current();
    send(IDLE);
  }, [send]);
  const registerRelease = useCallback((release: () => void) => {
    releaseRef.current = release;
  }, []);

  // Coalesced driver.resize on container size changes (including split drags,
  // tab switches, and window resizes).
  useEffect(() => {
    const element = splitRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    let raf = 0;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box) setWidth(box.width);
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => resize());
    });
    observer.observe(element);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [resize]);

  // Divider moves and tab switches change pane/host sizes without resizing the container.
  useEffect(() => {
    const raf = requestAnimationFrame(() => resize());
    return () => cancelAnimationFrame(raf);
  }, [resize, pct, tab, nowVisible]);

  const minPct = width > 0 ? Math.min(45, Math.max(15, (MIN_PANE_PX / width) * 100)) : 25;
  const clamp = useCallback(
    (value: number) => Math.min(100 - minPct, Math.max(minPct, value)),
    [minPct],
  );

  const onDividerPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    yieldControls();
    event.preventDefault();
    const divider = event.currentTarget;
    divider.setPointerCapture(event.pointerId);
    const move = (ev: PointerEvent) => {
      const box = splitRef.current?.getBoundingClientRect();
      if (!box || box.width < 2) return;
      setPct(clamp(((ev.clientX - box.left) / box.width) * 100));
    };
    const end = () => {
      divider.removeEventListener("pointermove", move);
      divider.removeEventListener("pointerup", end);
      divider.removeEventListener("pointercancel", end);
    };
    divider.addEventListener("pointermove", move);
    divider.addEventListener("pointerup", end);
    divider.addEventListener("pointercancel", end);
  };

  const onDividerKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = 5;
    if (event.key === "ArrowLeft") setPct((p) => clamp(p - step));
    else if (event.key === "ArrowRight") setPct((p) => clamp(p + step));
    else if (event.key === "Home") setPct(minPct);
    else if (event.key === "End") setPct(100 - minPct);
    else if (event.key === "Enter" || event.key === " ") setPct(50);
    else return;
    event.preventDefault();
  };

  return (
    <div className={`comparison${showSplit ? " open" : ""}`}>
      {narrow && showSplit && (
        <div className="comparison-tabs" role="tablist" aria-label="Then and now views">
          <button
            type="button"
            role="tab"
            id="tab-then"
            aria-controls="pane-then"
            aria-selected={tab === "then"}
            className={`tab${tab === "then" ? " active" : ""}`}
            onClick={() => {
              yieldControls();
              setTab("then");
            }}
          >
            Then{decade !== undefined ? ` · ${decade}s` : ""}
          </button>
          <button
            type="button"
            role="tab"
            id="tab-now"
            aria-controls="pane-now"
            aria-selected={tab === "now"}
            className={`tab${tab === "now" ? " active" : ""}`}
            onClick={() => {
              yieldControls();
              setTab("now");
            }}
          >
            Present-day
          </button>
        </div>
      )}
      <div className="comparison-split" ref={splitRef}>
        <div
          className="pane pane-then"
          id="pane-then"
          role={narrow && showSplit ? "tabpanel" : undefined}
          aria-labelledby={narrow && showSplit ? "tab-then" : undefined}
          style={showSplit && !narrow ? { flexBasis: `${pct}%` } : undefined}
          hidden={narrow && showSplit && tab !== "then"}
        >
          <WorldViewport
            videoRef={videoRef}
            phase={phase}
            payload={payload}
            decade={decade}
            preview={preview}
            onExit={onExit}
            onReseed={onReseed}
            send={send}
            onVideo={onVideo}
            comparisonOpen={showSplit}
            onToggleComparison={
              available
                ? () => {
                    yieldControls();
                    setOpen((o) => !o);
                  }
                : undefined
            }
            registerRelease={registerRelease}
          />
        </div>
        {showSplit && !narrow && (
          <div
            className="comparison-divider"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize then and now panes"
            aria-valuemin={Math.round(minPct)}
            aria-valuemax={Math.round(100 - minPct)}
            aria-valuenow={Math.round(pct)}
            aria-valuetext={`Historical pane ${Math.round(pct)} percent`}
            aria-keyshortcuts="ArrowLeft ArrowRight Home End Enter"
            tabIndex={0}
            title="Drag or use arrow keys to resize · Enter resets to an equal split"
            onPointerDown={onDividerPointerDown}
            onDoubleClick={() => setPct(50)}
            onKeyDown={onDividerKeyDown}
          />
        )}
        {paneMounted && payload && (
          <div
            className="pane pane-now"
            id="pane-now"
            role={narrow && showSplit ? "tabpanel" : undefined}
            aria-labelledby={narrow && showSplit ? "tab-now" : undefined}
            hidden={!nowVisible}
            onPointerDownCapture={yieldControls}
            onFocusCapture={yieldControls}
          >
            <PresentDayPane
              state={comparisonState}
              target={target}
              seed={payload.seed}
              cityLocation={payload.meta.cityLocation}
              cityName={payload.meta.canonicalCity}
              synthetic={synthetic}
              onAcceptNearby={acceptNearby}
              onReturnToReference={returnToReference}
              onSelectCityCenter={selectCityCenter}
              onRetry={retry}
              onCollapse={() => setOpen(false)}
              panoRef={setPanoEl}
              mapRef={setMapEl}
            />
          </div>
        )}
      </div>
    </div>
  );
}
