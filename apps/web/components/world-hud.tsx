import { safeUrl, type WorldPayload } from "../lib/frontend-types";

export function WorldHud({
  payload,
  decade,
  preview,
  onExit,
  onReseed,
}: {
  payload: WorldPayload;
  decade: number;
  preview: boolean;
  onExit: () => void;
  onReseed?: () => void;
}) {
  const sourceUrl = safeUrl(payload.seed.sourceUrl);
  return (
    <>
      <div className="hud-top">
        <div className="location-label">
          <span className="eyebrow">{preview ? "Local preview" : "Your destination"}</span>
          <h2>
            {payload.meta.canonicalCity} <span>/ {decade}s</span>
          </h2>
        </div>
        <div className="hud-actions">
          {onReseed && (payload.alternates?.length ?? 0) > 0 && (
            <button
              className="button secondary"
              onClick={onReseed}
              title="Restart this world from the next archival photograph"
            >
              Try another photograph <span aria-hidden="true">↻</span>
            </button>
          )}
          <button className="button secondary" onClick={onExit}>
            New search <span aria-hidden="true">↗</span>
          </button>
        </div>
      </div>
      <div className="hud-bottom">
        <div className="seed-credit">
          <span className="eyebrow">
            {preview ? "UI illustration · not an archival photo" : "Anchored in a real photograph"}
          </span>
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
        <span className="engine-label">
          {payload.model.id === "lingbot-world-2" ? "LingBot World 2" : "Happy Oyster Adventure"}
          {preview ? " · simulated" : ""}
        </span>
      </div>
    </>
  );
}
