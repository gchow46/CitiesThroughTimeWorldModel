# Adding a Reactor model

Everything flows through the `WorldModelAdapter` registry — a new model is one
adapter file + one registry entry + one token scope. No UI or API changes.

## 1. Describe its capabilities

In `apps/web/lib/types.ts`, add the id to `MODEL_IDS`:

```ts
export const MODEL_IDS = ["lingbot-world-2", "happy-oyster-adventure", "my-model"] as const;
```

## 2. Write the adapter (client side)

Add `apps/web/lib/reactor/client/my-model.ts` implementing the client adapter
interface (`connect`, `seed`, `start`, `setMove`, `setLook`, `reseed`,
`dispose`, `on`) and register it in `lib/reactor/client/registry.ts`.

## 3. Register capabilities server side

Add the model's `ModelCapabilities` in `lib/reactor/registry.ts` (the `MODELS`
map) with its `reactorModelName` token scope (e.g. `reactor/my-model`):

- `seedInput`: `"public-url"` (model fetches the URL itself) or `"upload"`
  (browser uploads the blob)
- `seedAspect`: if constrained — normalization outputs 16:9, so any new model
  must accept ≈1.78 or the constraint fails fast at normalize time
- `supportsHotPrompt` / `supportsReattach` / `driftReset` — the UI renders
  re-seed and hot-prompt controls from these
- `perspective`

Add its prompt limit + optional suffix in `lib/prompts/modelSuffix.ts`.

## 4. Enable it

```
ENABLED_MODELS=lingbot-world-2,happy-oyster-adventure,my-model
WORLD_MODEL=my-model   # optional default
```

That's it — `/api/reactor/token` mints scoped JWTs for it, `/api/world`
returns it in `model`, the dev-panel switcher picks it up, and seed artifacts
already satisfy the strictest registered constraint.

## 5. Tests

- Run the adapter contract suite against it (`tests/`).
- `pnpm seed:dry --city Amsterdam --decade 1960 --model my-model`
- Demo matrix: `pnpm demo:matrix --models my-model`
