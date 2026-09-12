"use client";

// Circular location widget: an instrument housing (a ring carrying the north
// label, legend, heading needle and expand control) around an UNCLIPPED
// rectangular native map host. The map is never cropped into a circle so the
// provider's logo/legal/attribution corners stay visible. Expanding reuses the
// same map host — only layout changes — so no second map instance is created.

import { useCallback, useEffect, useRef } from "react";

export function LocationWidget({
  mapRef,
  headingDeg,
  expanded,
  onExpandedChange,
  synthetic,
  narrow,
  selecting,
}: {
  mapRef: (element: HTMLElement | null) => void;
  /** Street View camera heading; rotates only the needle, never the map. */
  headingDeg?: number;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  /** Preview/fake mode: show an obviously synthetic surface behind the host. */
  synthetic: boolean;
  /** Narrow layout: collapse to a 56px launcher instead of the full housing. */
  narrow: boolean;
  /** True while the pane needs the user to pick a reference point. */
  selecting: boolean;
}) {
  const housingRef = useRef<HTMLDivElement>(null);
  const expandRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const changeRef = useRef(onExpandedChange);
  changeRef.current = onExpandedChange;

  // Expanded map = focus-contained dialog: Escape closes, Tab cycles inside,
  // focus returns to the launcher. Never traps focus in the historical pane.
  useEffect(() => {
    if (!expanded) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        event.preventDefault();
        changeRef.current(false);
        return;
      }
      if (event.key !== "Tab") return;
      const housing = housingRef.current;
      if (!housing) return;
      const focusables = housing.querySelectorAll<HTMLElement>(
        'button, a[href], input, select, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        last.focus();
        event.preventDefault();
      } else if (!event.shiftKey && document.activeElement === last) {
        first.focus();
        event.preventDefault();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      if (previous && document.contains(previous)) previous.focus();
    };
  }, [expanded]);

  const showHousing = expanded || !narrow;
  const toggle = useCallback(() => onExpandedChange(!expanded), [expanded, onExpandedChange]);

  return (
    <div className={`loc-widget${expanded ? " expanded" : ""}`}>
      {!showHousing && (
        <button
          type="button"
          className="loc-fab"
          onClick={() => onExpandedChange(true)}
          aria-label="Show location map"
          title="Show location map"
        >
          <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true" fill="none">
            <path
              d="M11 20s6-5.4 6-10a6 6 0 1 0-12 0c0 4.6 6 10 6 10Z"
              stroke="currentColor"
              strokeWidth="1.4"
            />
            <circle cx="11" cy="10" r="2.2" stroke="currentColor" strokeWidth="1.4" />
          </svg>
        </button>
      )}
      <div
        ref={housingRef}
        className="loc-housing"
        role={expanded ? "dialog" : undefined}
        aria-modal={expanded || undefined}
        aria-label={
          expanded
            ? "Location map — click the map to choose a reference point"
            : "Location map overview"
        }
        hidden={!showHousing}
      >
        <span className="loc-north" aria-hidden="true">
          N
        </span>
        <div className="loc-map-wrap">
          {synthetic && (
            <div className="loc-map-fallback" aria-hidden="true">
              Simulated
              <br />
              map
            </div>
          )}
          <div className="loc-map" ref={mapRef} />
        </div>
        {typeof headingDeg === "number" && (
          <span
            className="loc-needle"
            style={{ transform: `rotate(${Math.round(headingDeg)}deg)` }}
            aria-hidden="true"
          />
        )}
        <ul className="loc-legend">
          <li>
            <i className="dot ref" aria-hidden="true" />
            Photo reference
          </li>
          <li>
            <i className="dot cam" aria-hidden="true" />
            Street View camera
          </li>
        </ul>
        {selecting && expanded && (
          <p className="loc-hint">Click the map to choose a reference point</p>
        )}
        <button
          type="button"
          ref={expanded ? closeRef : expandRef}
          className="loc-expand"
          onClick={toggle}
          aria-expanded={expanded}
          aria-label={expanded ? "Close expanded map" : "Expand location map"}
          title={expanded ? "Close map" : "Expand map to choose a reference point"}
        >
          {expanded ? (
            "Close map"
          ) : (
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" fill="none">
              <path
                d="M8 1h5v5M6 13H1V8M13 1 8.5 5.5M1 13l4.5-4.5"
                stroke="currentColor"
                strokeWidth="1.4"
              />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
