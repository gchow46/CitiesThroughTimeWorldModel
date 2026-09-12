"use client";

import { useSearchParams } from "next/navigation";
import { isModelId, MODEL_IDS } from "../lib/frontend-types";
import { CAPABILITIES, MODEL_LABELS } from "../lib/reactor/client/capabilities";
import { useWorldStore } from "./world-provider";

export function WorldDevPanel() {
  const query = useSearchParams();
  const { state, switchModel } = useWorldStore();
  if (query.get("dev") !== "1") return null;
  const id = state.payload?.model.id;
  const caps = id ? CAPABILITIES[id] : undefined;
  const enabled = state.payload?.enabledModels ?? MODEL_IDS;
  const busy = !["walking", "error", "ended", "idle"].includes(state.phase);
  return (
    <section className="dev-panel" aria-label="Developer panel">
      <div>
        <p className="eyebrow">Developer panel{state.preview ? " · simulated session" : ""}</p>
        <p>
          Session: <strong>{state.phase}</strong> · Engine: {state.engineStatus ?? "not connected"}{" "}
          · Chunk: {state.chunk ?? "not reported"}
        </p>
      </div>
      <label>
        World engine{" "}
        <select
          aria-label="World engine"
          value={id ?? ""}
          disabled={!state.request || busy}
          onChange={(event) => {
            if (isModelId(event.target.value)) switchModel(event.target.value);
          }}
        >
          <option value="" disabled>
            Server default
          </option>
          {enabled.map((model) => (
            <option key={model} value={model}>
              {MODEL_LABELS[model]}
            </option>
          ))}
        </select>
      </label>
      {caps && (
        <dl>
          <dt>Seed input</dt>
          <dd>{caps.seedInput}</dd>
          <dt>Hot prompts</dt>
          <dd>{caps.supportsHotPrompt ? "Supported" : "Unavailable"}</dd>
          <dt>Reattach</dt>
          <dd>{caps.supportsReattach ? "Supported" : "Unavailable"}</dd>
          <dt>Context recovery</dt>
          <dd>{caps.driftReset}</dd>
        </dl>
      )}
      {!state.payload?.enabledModels && (
        <small>
          Model availability is authorized by the backend. No keys or session tokens are displayed
          here.
        </small>
      )}
    </section>
  );
}
