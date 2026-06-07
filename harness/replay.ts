/**
 * Run records and replay.
 *
 * Every run — QA, teaching, and sandbox alike — records the four things needed
 * to reproduce and adjudicate it after the fact: its seed, a hash of its full
 * configuration, the engine version that produced it, and the criteria version
 * it is judged against (criteria H1, H3, H4). The prior build's sandbox ran on
 * unseeded randomness, so no run any verdict ever graded could be examined
 * again; this record is what makes "replay it and check" possible.
 *
 * This module defines the record and the determinism check that compares two
 * runs of the same {config, seed}. The engine's run-output type is injected, so
 * the record machinery does not depend on the engine's internals.
 */

import { hashConfig } from "./hash.ts";
import { ENGINE_VERSION, CRITERIA_VERSION } from "./version.ts";

/** The identity stamp carried by every run. */
export interface RunRecord {
  readonly seed: number;
  readonly configHash: string;
  readonly engineVersion: string;
  readonly criteriaVersion: string;
}

/** Build the run record for a {config, seed} pair. */
export function makeRunRecord(config: unknown, seed: number): RunRecord {
  return {
    seed,
    configHash: hashConfig(config),
    engineVersion: ENGINE_VERSION,
    criteriaVersion: CRITERIA_VERSION,
  };
}

/**
 * Deterministic-replay check (criteria H1): running the same {config, seed}
 * twice must produce bit-identical output. `serialize` reduces a run's output to
 * a canonical string (typically the full ordered event stream plus final state);
 * the check passes iff the two serializations are exactly equal.
 *
 * Returns the first differing character index when they differ, so a determinism
 * regression is localized rather than just flagged.
 */
export interface DeterminismCheck {
  readonly identical: boolean;
  /** Index of the first differing character, or -1 when identical. */
  readonly firstDivergence: number;
}

export function checkDeterminism(a: string, b: string): DeterminismCheck {
  if (a === b) return { identical: true, firstDivergence: -1 };
  const len = Math.min(a.length, b.length);
  let i = 0;
  while (i < len && a.charCodeAt(i) === b.charCodeAt(i)) i++;
  return { identical: false, firstDivergence: i };
}
