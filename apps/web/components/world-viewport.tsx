"use client";

import { useCallback, useRef, useState, type RefObject } from "react";
import Image from "next/image";
import type { WorldPayload, WorldPhase } from "../lib/frontend-types";
import type { Controls } from "../lib/reactor/client/controls";
import { useWorldControls } from "../hooks/use-world-controls";
import { WorldHud } from "./world-hud";

export function WorldViewport({
  videoRef,
  phase,
  payload,
  decade,
  preview,
  onExit,
  send,
  onVideo,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  phase: WorldPhase;
  payload?: WorldPayload;
  decade?: number;
  preview: boolean;
  onExit: () => void;
  send: (controls: Controls) => void;
  onVideo?: (video: HTMLVideoElement | null) => void;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const [playbackMessage, setPlaybackMessage] = useState("");
  const playing = phase === "walking";
  const { focused, pressed, lock, locked, pointerNotice } = useWorldControls(
    viewport,
    playing,
    send,
  );
  const attachVideo = useCallback(
    (video: HTMLVideoElement | null) => {
      videoRef.current = video;
      onVideo?.(video);
    },
    [videoRef, onVideo],
  );
  const enter = async () => {
    void lock();
    if (!preview && videoRef.current) {
      try {
        await videoRef.current.play();
        setPlaybackMessage("");
      } catch {
        setPlaybackMessage("Playback is still waiting. Try again once the stream is ready.");
      }
    }
    viewport.current?.focus();
  };
  const image = payload?.seed.thumbUrl ?? payload?.seed.url ?? "/preview-city.svg";
  return (
    <section className={`world-shell ${playing ? "is-playing" : ""}`} aria-label="World viewport">
      <div className="world-media">
        {(!playing || preview) && (
          <Image
            className="scene-poster"
            src={image}
            alt={payload ? payload.seed.title : "Stylized illustration of a canal street"}
            fill
            unoptimized
            priority
            sizes="(max-width: 900px) 100vw, 65vw"
          />
        )}
        <video
          ref={attachVideo}
          className="world-video"
          autoPlay
          playsInline
          muted
          aria-label="Live generated world"
        />
        <div className="scene-shade" />
      </div>
      <div
        ref={viewport}
        className="control-surface"
        tabIndex={playing ? 0 : -1}
        aria-label="World controls. W A S D to walk, arrow keys to look, Escape to release."
        onClick={() => {
          if (playing) void lock();
        }}
      />
      {playing && payload && decade !== undefined ? (
        <>
          <WorldHud payload={payload} decade={decade} preview={preview} onExit={onExit} />
          {!focused && (
            <div className="enter-overlay">
              <button className="button primary" onClick={() => void enter()}>
                {preview ? "Try keyboard controls" : "Enter world"}{" "}
                <span aria-hidden="true">→</span>
              </button>
              <p>
                {preview
                  ? "Static UI preview. No live generation or camera movement."
                  : "Click to focus. Escape releases your keyboard."}
              </p>
            </div>
          )}
          <div className="controls-bar" aria-label="Keyboard hints">
            <div className="key-group">
              <kbd className={pressed.forward > 0 ? "down" : ""}>W</kbd>
              <kbd className={pressed.right < 0 ? "down" : ""}>A</kbd>
              <kbd className={pressed.forward < 0 ? "down" : ""}>S</kbd>
              <kbd className={pressed.right > 0 ? "down" : ""}>D</kbd>
              <span>Walk</span>
            </div>
            <div className="key-group">
              <kbd className={pressed.lookY > 0 ? "down" : ""}>↑</kbd>
              <kbd className={pressed.lookX < 0 ? "down" : ""}>←</kbd>
              <kbd className={pressed.lookY < 0 ? "down" : ""}>↓</kbd>
              <kbd className={pressed.lookX > 0 ? "down" : ""}>→</kbd>
              <span>Look · mouse or arrows</span>
            </div>
            <span className="focus-state">
              {locked
                ? "Mouse captured · Esc to release"
                : focused
                  ? "Keyboard active"
                  : "Click to explore"}
            </span>
          </div>
        </>
      ) : payload ? (
        <div className="poster-caption">
          <span className="eyebrow">
            {preview ? "Preview illustration" : "The photograph that starts your journey"}
          </span>
          <h2>{payload.seed.title}</h2>
          <p>
            {payload.seed.author} · {payload.seed.license}
          </p>
          {phase === "ready" && (
            <button className="button secondary" onClick={() => void enter()}>
              Enable playback
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="scene-topline">
            <span>THE CITY, REIMAGINED</span>
            <span>01 / 03</span>
          </div>
          <div className="poster-caption">
            <span className="eyebrow">A different time. A familiar place.</span>
            <h2>
              The past is closer
              <br />
              than you think.
            </h2>
            <p>Choose your city. Find your moment. Step inside.</p>
          </div>
          <span className="illustration-label">Concept illustration · not historical imagery</span>
        </>
      )}
      {(playbackMessage || pointerNotice) && (
        <p className="playback-note" role="status">
          {playbackMessage || pointerNotice}
        </p>
      )}
    </section>
  );
}
