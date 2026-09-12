import type { ModelCapabilities, ModelId } from "../../frontend-types";

export const CAPABILITIES: Record<ModelId, ModelCapabilities> = {
  "lingbot-world-2": {
    id: "lingbot-world-2",
    reactorModelName: "reactor/lingbot-world-2",
    seedInput: "upload",
    supportsHotPrompt: true,
    supportsReattach: false,
    driftReset: "kv-cache",
  },
  "happy-oyster-adventure": {
    id: "happy-oyster-adventure",
    reactorModelName: "reactor/happy-oyster-adventure",
    seedInput: "public-url",
    supportsHotPrompt: false,
    supportsReattach: true,
    driftReset: "reattach",
  },
};

export const MODEL_LABELS: Record<ModelId, string> = {
  "lingbot-world-2": "LingBot World 2",
  "happy-oyster-adventure": "Happy Oyster Adventure",
};
