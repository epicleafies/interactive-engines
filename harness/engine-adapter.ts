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
import {
  smallContrastFixture,
  tradingPairFixture,
  scaledFixture,
  singleGoodPerishableFixture,
} from "../engines/emergence/fixtures.ts";
import type { Config, RunResult } from "../engines/emergence/types.ts";

export { run };
export { smallContrastFixture, tradingPairFixture, scaledFixture, singleGoodPerishableFixture };

export interface NamedFixture {
  readonly name: string;
  readonly config: Config;
}

/** The structural fixtures the engine-backed criteria run over. */
export function structuralFixtures(): NamedFixture[] {
  return [
    { name: "smallContrast (frozen market)", config: smallContrastFixture() },
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
 */
export function serializeRun(result: RunResult): string {
  return JSON.stringify({
    events: result.events,
    telemetry: result.telemetry,
    finalAgents: result.finalAgents,
    reachedCap: result.reachedCap,
    dominantGood: result.dominantGood,
  });
}
