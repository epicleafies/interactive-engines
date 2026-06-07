/**
 * Constants registry (engine spec §12).
 *
 * This module is the engine's record of WHICH constants exist, what CLASS each
 * is, how each is DENOMINATED, and — for the ones the decisions register already
 * proposes — their proposed value. It is documentation and a guard, not a source
 * of live values: the engine reads constants from `Config.constants`, never from
 * here, so that every run is reproducible from {config, seed} and no tuned value
 * is baked into engine logic.
 *
 * The bounds discipline (criteria H6) is the reason this is explicit:
 *   - tuned constants are filled by a campaign with a logged sweep/sensitivity
 *     artifact; their proposed values here are PROPOSALS to be ratified, not
 *     measurements to be trusted.
 *   - structural constants are filled with a logged rationale.
 *   - a constant still marked `tbd` must be filled by a register entry BEFORE
 *     the campaign that tests it. The harness can therefore refuse to run a
 *     campaign whose config still contains placeholder values.
 *
 * The `denomination` field exists so the one-time-base audit (criteria B10) is
 * machine-checkable: every rolling statistic, window, and detector threshold is
 * denominated in rounds, shares, or per-capita rates — NEVER in raw event
 * counts. The forbidden value `eventCount` is listed in the type precisely so an
 * accidental future regression to raw counts is a FAIL, not a silent drift.
 *
 * No tuned TBD value is invented in this repository. Teaching, synthesis, and
 * scaled configurations get their values from the C0+ campaigns; structural
 * test fixtures that exercise mechanics document their own values at point of
 * use as fixtures, never as the teaching parameters.
 */

export type ConstantClass = "tuned" | "structural";
export type ConstantStatus = "proposed" | "tbd" | "fixed";

/**
 * How a constant is measured. The first three are the only denominations the
 * one-time-base discipline permits for a rolling statistic / window / detector
 * threshold. `factor`, `weight`, `distance`, and `regionCount` are non-threshold
 * denominations (a decay multiplier, an evidence weight, a ring distance, a
 * structural partition count). `eventCount` is the forbidden denomination: a
 * threshold expressed in raw event counts is exactly what B10 forbids.
 */
export type Denomination =
  | "rounds"
  | "share"
  | "perCapita"
  | "factor"
  | "weight"
  | "distance"
  | "regionCount"
  | "eventCount";

/** Denominations a detection/statistic threshold may legitimately use. */
export const ALLOWED_THRESHOLD_DENOMINATIONS: readonly Denomination[] = [
  "rounds",
  "share",
  "perCapita",
];

export interface ConstantSpec {
  readonly name: string;
  readonly class: ConstantClass;
  readonly status: ConstantStatus;
  readonly denomination: Denomination;
  /** Whether this constant acts as a rolling-statistic / window / detector threshold. */
  readonly isThreshold: boolean;
  /** A register-recorded proposed/fixed value, or null when still TBD. */
  readonly proposed: number | null;
  /** Standalone note on what it controls. */
  readonly note: string;
}

/**
 * The registry. Proposed values are exactly those carried in the spec's §12
 * table; everything else is TBD and filled per H6 before its campaign. Tuned
 * "proposed" values (K, epsilon, DOM_THRESHOLD) are proposals awaiting a sweep —
 * not yet validated teaching values.
 */
export const CONSTANTS: readonly ConstantSpec[] = [
  { name: "SEED_STRENGTH", class: "tuned", status: "proposed", denomination: "weight", isThreshold: false, proposed: 3,
    note: "K: weight of the permanent seeded prior in the score; swept in tuning." },
  { name: "SEED_CAP", class: "tuned", status: "tbd", denomination: "share", isThreshold: true, proposed: null,
    note: "cap on the seeded prior fraction; registered <= DOM_THRESHOLD minus the D5 margin; asserted at setup." },
  { name: "ACCEPT_MARGIN", class: "tuned", status: "proposed", denomination: "share", isThreshold: true, proposed: 0.05,
    note: "epsilon: the engine's single comparison constant in the value test." },
  { name: "DECAY_FACTOR", class: "tuned", status: "tbd", denomination: "factor", isThreshold: false, proposed: null,
    note: "per-round multiplicative recency factor (never exp(-lambda*age))." },
  { name: "WINDOW_ROUNDS", class: "tuned", status: "tbd", denomination: "rounds", isThreshold: true, proposed: null,
    note: "rolling-window length in rounds; also bounds the refusal-exclusion memory." },
  { name: "WITNESS_RADIUS", class: "tuned", status: "tbd", denomination: "distance", isThreshold: false, proposed: null,
    note: "W_r: radius for event witnessing and for setup want-visibility (one information radius)." },
  { name: "BURN_WEIGHT", class: "structural", status: "proposed", denomination: "weight", isThreshold: false, proposed: 4.0,
    note: "weight of a trade-acquired loss to its victim; applies only when acquiredByTrade." },
  { name: "PROD_DELAY", class: "structural", status: "proposed", denomination: "rounds", isThreshold: true, proposed: 0,
    note: "completed empty rounds before re-endowment; 0 = refill at the first production step after emptying." },
  { name: "FILLER_MIN_SHARE", class: "structural", status: "tbd", denomination: "share", isThreshold: true, proposed: null,
    note: "config-validity floor: focal want-share sum must be <= 1 - this." },
  { name: "DOM_THRESHOLD", class: "tuned", status: "proposed", denomination: "share", isThreshold: true, proposed: 0.70,
    note: "dominance: acceptance-share floor A(g) must reach and sustain." },
  { name: "DOM_GAP", class: "tuned", status: "tbd", denomination: "share", isThreshold: true, proposed: null,
    note: "dominance: required A(g) - A(runner-up) separation." },
  { name: "DOM_SUSTAIN", class: "tuned", status: "tbd", denomination: "rounds", isThreshold: true, proposed: null,
    note: "dominance: consecutive rounds the predicate must hold." },
  { name: "DOM_MIN_TRADE_SHARE", class: "tuned", status: "tbd", denomination: "perCapita", isThreshold: true, proposed: null,
    note: "dominance: per-capita in-window TRADE-event floor (x N)." },
  { name: "DOM_RISE_MIN", class: "tuned", status: "tbd", denomination: "share", isThreshold: true, proposed: null,
    note: "dominance: required rise of A(g) above its first defined value of the run." },
  { name: "REGION_COUNT", class: "structural", status: "tbd", denomination: "regionCount", isThreshold: false, proposed: null,
    note: "scaled mode: number of equal contiguous ring arcs." },
  { name: "ROUND_CAP", class: "tuned", status: "tbd", denomination: "rounds", isThreshold: true, proposed: null,
    note: "hard round limit; validated for non-convergence bound at control extremes (G4)." },
];

const BY_NAME: ReadonlyMap<string, ConstantSpec> = new Map(
  CONSTANTS.map((c) => [c.name, c]),
);

export function constantSpec(name: string): ConstantSpec {
  const spec = BY_NAME.get(name);
  if (!spec) throw new Error(`unknown constant: ${name}`);
  return spec;
}

/** Names of constants still TBD — i.e. that must be filled by a register entry before use. */
export function unfilledConstants(): readonly string[] {
  return CONSTANTS.filter((c) => c.status === "tbd").map((c) => c.name);
}
