import type { ModelId } from "../../frontend-types";
import type { AdapterFactory } from "./adapter";

const models: Record<ModelId, () => Promise<AdapterFactory>> = {
  "lingbot-world-2": async () => (await import("./lingbot")).createLingbot,
  "happy-oyster-adventure": async () => (await import("./happy-oyster")).createHappyOyster,
};

export async function getAdapterFactory(id: ModelId, preview: boolean): Promise<AdapterFactory> {
  if (preview) return (await import("./mock")).mockFactory(id);
  return models[id]();
}
