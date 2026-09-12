"use client";

import { Suspense, useRef } from "react";
import Link from "next/link";
import { CityDecadeForm } from "./city-decade-form";
import { WorldViewport } from "./world-viewport";
import { WorldStatus } from "./world-status";
import { WorldDevPanel } from "./world-dev-panel";
import { useWorldStore } from "./world-provider";

export function JourneyExperience({ isWorld }: { isWorld: boolean }) {
  const localVideo = useRef<HTMLVideoElement>(null);
  const { state, begin, exit, newSearch, videoRef, registerVideo, setControls, reconnect } =
    useWorldStore();
  const searching = ["idle", "error", "ended"].includes(state.phase);
  const walking = state.phase === "walking";
  const previewEnabled =
    process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_ENABLE_PREVIEW === "true";
  return (
    <div className={`app-frame ${walking ? "exploring" : ""}`}>
      <header className="site-header">
        <Link className="brand" href="/" onClick={exit} aria-label="Cities Through Time home">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <circle cx="16" cy="16" r="14" stroke="currentColor" />
            <path
              d="M8 23V13l5-4v14M13 23V6l5 4v13M18 23V14l6-4v13M5 23h22"
              stroke="currentColor"
              strokeWidth="1.3"
            />
          </svg>
          <span>
            CITIES
            <br />
            <b>THROUGH TIME</b>
          </span>
        </Link>
        <span className="header-note">A new way to explore the past</span>
        <span className="header-tag">{state.preview ? "Local preview" : "MVP / 01"}</span>
      </header>
      <main>
        <div className="experience-layout">
          {!walking && (
            <aside className="journey-panel">
              {searching ? (
                <>
                  <p className="eyebrow accent">History, from street level</p>
                  <h1>
                    Walk into
                    <br />
                    another <em>decade.</em>
                  </h1>
                  <p className="intro">
                    Some places you can only imagine.
                    <br />
                    Now, you can explore them.
                  </p>
                  {isWorld && !state.payload && (
                    <p className="muted">
                      Start a journey below. Session tokens are never saved in the URL or browser
                      storage.
                    </p>
                  )}
                  {state.failure && (
                    <div className="error-card" role="alert">
                      <strong>
                        {state.phase === "ended"
                          ? "Journey complete."
                          : "We couldn’t open this journey."}
                      </strong>
                      <p>{state.failure.message}</p>
                      {state.failure.closestDecade !== undefined && (
                        <p>Try the {state.failure.closestDecade}s instead.</p>
                      )}
                      {state.payload && (
                        <button className="button secondary" onClick={reconnect}>
                          Reconnect with a fresh token
                        </button>
                      )}
                    </div>
                  )}
                  <CityDecadeForm
                    initial={state.request}
                    previewEnabled={previewEnabled}
                    onSubmit={(request, preview) => void begin(request, preview)}
                  />
                </>
              ) : (
                <WorldStatus
                  phase={state.phase}
                  progress={state.progress}
                  onCancel={isWorld ? newSearch : exit}
                />
              )}
            </aside>
          )}
          <WorldViewport
            videoRef={isWorld ? videoRef : localVideo}
            onVideo={isWorld ? registerVideo : undefined}
            phase={isWorld ? state.phase : "idle"}
            payload={isWorld ? state.payload : undefined}
            decade={state.request?.decade}
            preview={state.preview}
            onExit={newSearch}
            send={setControls}
          />
        </div>
        {state.notice && (
          <p className="integration-notice" role="status">
            {state.notice}
          </p>
        )}
        <Suspense fallback={null}>
          <WorldDevPanel />
        </Suspense>
        {!walking && (
          <div className="experience-notes">
            <div>
              <span>01</span>
              <p>
                <strong>Rooted in real photographs</strong>Historical imagery sets the scene.
              </p>
            </div>
            <div>
              <span>02</span>
              <p>
                <strong>Made to be explored</strong>A live world, not a prerecorded film.
              </p>
            </div>
            <div>
              <span>03</span>
              <p>
                <strong>Your own point of view</strong>WASD to walk. Mouse or arrows to look.
              </p>
            </div>
          </div>
        )}
        <p className="mobile-notice">For the walkthrough, use a desktop browser with a keyboard.</p>
      </main>
      <footer className="site-footer">
        <span>AI-generated interpretations, not exact historical reconstructions.</span>
        <span>
          {state.preview
            ? state.backendMock
              ? "Backend mock · no live world"
              : "No API calls · no live world"
            : "Worlds powered by Reactor"}
        </span>
      </footer>
    </div>
  );
}
