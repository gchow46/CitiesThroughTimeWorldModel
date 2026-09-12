import { safeUrl, type WorldPayload } from "../lib/frontend-types";

export function WorldHud({
  payload,
  decade,
  preview: _preview,
  onExit,
  onReseed,
  comparisonOpen,
  onToggleComparison,
}: {
  payload: WorldPayload;
  decade: number;
  preview: boolean;
  onExit: () => void;
  onReseed?: () => void;
  comparisonOpen?: boolean;
  onToggleComparison?: () => void;
}) {
  const sourceUrl = safeUrl(payload.seed.sourceUrl);
  return (
    <>
      <div className="hud-top">
        <div className="location-label">
          <h2>
            {payload.meta.canonicalCity} <span>/ {decade}s</span>
          </h2>
        </div>
        <div className="hud-actions">
          {onToggleComparison && (
            <button
              className="button secondary"
              onClick={onToggleComparison}
              aria-pressed={comparisonOpen === true}
              aria-label="Then &amp; Now"
              title="Show or hide the present-day Street View comparison"
            >
              <span aria-hidden="true">◧</span>
            </button>
          )}
          {onReseed && (payload.alternates?.length ?? 0) > 0 && (
            <button
              className="button secondary"
              onClick={onReseed}
              aria-label="Try another photograph"
              title="Restart this world from the next archival photograph"
            >
              <span aria-hidden="true">↻</span>
            </button>
          )}
          <button
            className="button secondary"
            onClick={onExit}
            aria-label="New search"
            title="Back to search"
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>
      </div>
      <div className="hud-bottom">
        <div className="seed-credit">
          <p>
            {sourceUrl ? (
              <a href={sourceUrl} target="_blank" rel="noopener noreferrer">
                {payload.seed.title}
              </a>
            ) : (
              payload.seed.title
            )}
          </p>
          <small>
            {payload.seed.author} · {payload.seed.license}
            {payload.seed.year ? ` · ${payload.seed.year}` : ""}
          </small>
        </div>
      </div>
    </>
  );
}
