"use client";

import { Suspense, useRef } from "react";
import Link from "next/link";
import { CityDecadeForm } from "./city-decade-form";
import { WorldViewport } from "./world-viewport";
import { WorldComparison } from "./world-comparison";
import { WorldStatus } from "./world-status";
import { WorldDevPanel } from "./world-dev-panel";
import { useWorldStore } from "./world-provider";

export function JourneyExperience({ isWorld }: { isWorld: boolean }) {
  const localVideo = useRef<HTMLVideoElement>(null);
  const { state, begin, exit, newSearch, videoRef, registerVideo, setControls, reconnect, reseed } =
    useWorldStore();
  const searching = ["idle", "error", "ended"].includes(state.phase);
  const walking = state.phase === "walking";
  const previewEnabled =
    process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_ENABLE_PREVIEW === "true";
  return (
    <div className={`app-frame ${walking ? "exploring" : ""}`}>
      <header className="site-header">
        <Link className="brand" href="/" onClick={exit} aria-label="Cities Through Time home">
          <svg width="24" height="24" viewBox="0 0 32 32" fill="none" aria-hidden="true">
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
      </header>
      <main>
        <div className="experience-layout">
          {!walking && (
            <aside className="journey-panel">
              {searching ? (
                <>
                  <h1>
                    Walk into
                    <br />
                    another <em>decade.</em>
                  </h1>
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
          {isWorld ? (
            <WorldComparison
              videoRef={videoRef}
              onVideo={registerVideo}
              phase={state.phase}
              payload={state.payload}
              decade={state.request?.decade}
              preview={state.preview}
              onExit={newSearch}
              onReseed={reseed}
              send={setControls}
            />
          ) : (
            <WorldViewport
              videoRef={localVideo}
              phase="idle"
              decade={state.request?.decade}
              preview={state.preview}
              onExit={newSearch}
              send={setControls}
            />
          )}
        </div>
        {state.notice && (
          <p className="integration-notice" role="status">
            {state.notice}
          </p>
        )}
        <Suspense fallback={null}>
          <WorldDevPanel />
        </Suspense>
      </main>
      <footer className="site-footer">
        <span>
          {state.backendMock
            ? "Backend mock · no live world"
            : state.preview
              ? "No API calls · no live world"
              : "Worlds powered by Reactor"}
        </span>
        <span className="footer-links">
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </span>
        <span>AI-generated interpretations, not exact historical reconstructions.</span>
      </footer>
    </div>
  );
}
