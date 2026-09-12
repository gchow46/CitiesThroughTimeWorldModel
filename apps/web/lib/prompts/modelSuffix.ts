import type { ModelId } from "@/lib/types";

export interface ModelPromptSpec {
  /** Hard character limit for the prompt. */
  maxChars: number;
  /** Optional per-model suffix populated from I3 calibration findings. */
  suffix: string;
}

export const MODEL_PROMPT_SPEC: Record<ModelId, ModelPromptSpec> = {
  "lingbot-world-2": {
    maxChars: 4000,
    suffix: "", // TBD by I3 spike
  },
  "happy-oyster-adventure": {
    maxChars: 2000,
    suffix: "", // TBD by I3 spike
  },
};
