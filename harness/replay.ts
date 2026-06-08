/**
 * Run records and replay.
 *
 * Every run — QA, teaching, and sandbox alike — records what is needed to
 * reproduce and adjudicate it after the fact: its seed, its FULL configuration,
 * the engine version that produced it, and the criteria version it is judged
 * against (criteria H1, H3, H4). The prior build's sandbox ran on unseeded
 * randomness, so no run any verdict ever graded could be examined again; this
 * record is what makes "replay it and check" possible.
 *
 * The record carries the full configuration, not a hash of it (criteria H4 /
 * D-042): record-self-sufficiency is the test — a stored run replays from its
 * record ALONE, with no external config object supplied. A hash can only verify
 * a configuration you already hold; it cannot reconstruct one for a run pulled
 * from storage. The config hash is retained as an integrity field (it lets a
 * held config be checked against the record, and backs the canonical-hash
 * audit), never as the source of the configuration. Criteria > spec: the §11
 * "config hash" record schema is conformed down to the criterion (D-042).
 *
 * This module defines the record and the determinism check that compares two
 * runs of the same {config, seed}.
 */

import type { Config } from "../engines/emergence/types.ts";
import { hashConfig } from "./hash.ts";
import { ENGINE_VERSION, CRITERIA_VERSION } from "./version.ts";

/** The identity stamp carried by every run. Self-sufficient for replay (H4/D-042). */
export interface RunRecord {
  readonly seed: number;
  /**
   * The full configuration that produced the run. The run replays from this
   * alone — the record is self-sufficient (criteria H4 / D-042). Never a hash.
   */
  readonly config: Config;
  /**
   * Integrity field ONLY (D-042): a stable, canonical digest of `config` so a
   * separately-held configuration can be checked against the record. It is never
   * the source of the configuration — `config` above is.
   */
  readonly configHash: string;
  readonly engineVersion: string;
  readonly criteriaVersion: string;
}

/** Build the run record for a {config, seed} pair. Stores the full config (D-042). */
export function makeRunRecord(config: Config, seed: number): RunRecord {
  return {
    seed,
    config,
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
