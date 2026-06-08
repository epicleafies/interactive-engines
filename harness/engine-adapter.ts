/**
 * Adapter binding the reference engine into the acceptance harness.
 *
 * The criteria battery (harness/criteria.ts) asserts against this surface, so the
 * engine-dependent criteria become live PASS/FAIL once the engine exists. It
 * exposes the public `run`, the documented structural fixtures the audit
 * criteria exercise (D-023: coverage configs, never teaching parameters), and a
 * canonical run serialization for the determinism / replay checks.
 */

import { run } from "../engines/emergence/index.ts";
import { createState, type EngineStateInternal, type GoodStatState } from "../engines/emergence/state.ts";
import { runSetup, validateConfig } from "../engines/emergence/setup.ts";
import { runRound } from "../engines/emergence/round.ts";
import { selectPartner } from "../engines/emergence/decide.ts";
import { tallyUpdate } from "../engines/emergence/score.ts";
import { stepStatistics } from "../engines/emergence/statistic.ts";
import {
  smallContrastFixture,
  tradingPairFixture,
  scaledFixture,
  singleGoodPerishableFixture,
} from "../engines/emergence/fixtures.ts";
import type { Config, RunResult } from "../engines/emergence/types.ts";

export { run };
export { smallContrastFixture, tradingPairFixture, scaledFixture, singleGoodPerishableFixture };

// Internal run primitives, for audits that must inspect engine state the public
// RunResult does not surface (the seeded priors, the live conservation counts),
// drive the round step-by-step (B2.staleTrade), exercise the dominance detector
// directly (D7), confirm witness-radius locality (A3), or check load validation
// (G7).
export { createState, runSetup, runRound, selectPartner, validateConfig, tallyUpdate, stepStatistics };
export type { EngineStateInternal, GoodStatState };

/** Run a config to its cap and return the full internal state (for internal audits). */
export function runToInternalState(config: Config, seed: number): EngineStateInternal {
  const state = createState(config, seed);
  runSetup(state);
  for (let r = 1; r <= config.constants.ROUND_CAP; r++) runRound(state);
  return state;
}

export interface NamedFixture {
  readonly name: string;
  readonly config: Config;
}

/** The structural fixtures the engine-backed criteria run over. */
export function structuralFixtures(): NamedFixture[] {
  return [
    { name: "smallContrast (small two-focal market)", config: smallContrastFixture() },
    { name: "tradingPair (live market)", config: tradingPairFixture() },
    { name: "scaled (regional)", config: scaledFixture() },
    { name: "singleGoodPerishable (degenerate)", config: singleGoodPerishableFixture() },
  ];
}

/**
 * Canonical serialization of a run's behavioral output (the event stream, the
 * telemetry, the final agents, and the outcome) — what two replays of the same
 * {config, seed} must match bit-for-bit. The run record is excluded: it is
 * provenance metadata, not behavior.
 *
 * The outcome is reported by `reachedCap` plus the DOMINANCE events in the
 * stream; there is no scalar `dominantGood` field (D-040 — removed from the
 * hashed surface, forcing the single re-pin to a new digest).
 */
export function serializeRun(result: RunResult): string {
  return JSON.stringify({
    events: result.events,
    telemetry: result.telemetry,
    finalAgents: result.finalAgents,
    reachedCap: result.reachedCap,
  });
}
