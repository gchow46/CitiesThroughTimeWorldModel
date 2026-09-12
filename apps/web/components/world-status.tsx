import type { WorldPhase, WorldProgress } from "../lib/frontend-types";

const STEPS = ["Find a photograph", "Connect to Reactor", "Build your world", "Step inside"];
const LABELS: Partial<Record<WorldPhase, string>> = {
  requesting: "Finding a window into the past.",
  sourcing: "Finding a window into the past.",
  connecting: "Connecting your world.",
  seeding: "Bringing the photograph to life.",
  ready: "Your journey is about to begin.",
  reseeding: "Starting from another photograph.",
  refreshing: "Requesting a fresh world token.",
};
const STEP: Partial<Record<WorldPhase, number>> = {
  requesting: 0,
  sourcing: 0,
  connecting: 1,
  seeding: 2,
  ready: 3,
  reseeding: 2,
  refreshing: 1,
};

export function WorldStatus({
  phase,
  progress,
  onCancel,
}: {
  phase: WorldPhase;
  progress?: WorldProgress;
  onCancel: () => void;
}) {
  const current = STEP[phase] ?? 0;
  return (
    <section className="loading-panel" aria-live="polite" aria-atomic="true">
      <p className="eyebrow">A journey in the making</p>
      <h2>{LABELS[phase]}</h2>
      <p className="muted">
        Keep this tab open while we prepare your scene. You can cancel at any point.
      </p>
      {progress && (
        <p className="progress-detail">
          <strong>{progress.stage.replaceAll("_", " ")}</strong>
          {progress.detail && ` · ${progress.detail}`}
        </p>
      )}
      <ol className="stage-list">
        {STEPS.map((step, index) => (
          <li
            key={step}
            className={index === current ? "current" : index < current ? "complete" : ""}
          >
            <span>{String(index + 1).padStart(2, "0")}</span>
            {step}
            {index === current && <i className="stage-pulse" aria-hidden="true" />}
          </li>
        ))}
      </ol>
      <button className="button secondary" onClick={onCancel}>
        Cancel journey
      </button>
    </section>
  );
}
