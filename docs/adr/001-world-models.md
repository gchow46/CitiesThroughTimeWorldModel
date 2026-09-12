# ADR 001 — World model calibration: LingBot World 2 vs Happy Oyster Adventure

- **Status**: pending spike (ticket I3 — timeboxed 3h, paired)
- **Context**: MVP1 keeps both Reactor models as first-class adapters behind
  `WorldModelAdapter` (see IMPLEMENTATION_PLAN.md). This spike picks the
  `WORLD_MODEL` default and records per-model tuning. **It does not eliminate a
  model** — both stay in `ENABLED_MODELS`.

## Method

Same Amsterdam 1960s seed photo + same prompt on both models. Score each on:

| #   | Criterion                                                         | LingBot World 2 | Happy Oyster |
| --- | ----------------------------------------------------------------- | --------------- | ------------ |
| a   | Seed fidelity at t=0                                              | _TBD_           | _TBD_        |
| b   | Fidelity after 60s WASD walk                                      | _TBD_           | _TBD_        |
| c   | Latency to first frame                                            | _TBD_           | _TBD_        |
| d   | Drift recovery (`triggerKvCacheReset` vs `attachWorld` re-attach) | _TBD_           | _TBD_        |
| e   | Session cost                                                      | _TBD_           | _TBD_        |

Record clips for each cell; link recordings here.

## Per-model notes

_Fill during the spike: command latency (~1.4s chunk cadence on LingBot?), seed
constraints, reattach behaviour, prompt length limits, quirks._

## Decision

- **`WORLD_MODEL` default**: _TBD_
- **Rationale**: _TBD_

## Follow-ups for B8 (prompt composer)

Per-model prompt suffixes / limits discovered here:

- `lingbot-world-2`: _TBD_
- `happy-oyster-adventure`: _TBD_ (known: prompt limit ~2000 chars)
