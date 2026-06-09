/**
 * C5 scaled calibration (D-073) — fills the E1/E2/E3 bars the C5 scaled-grading
 * module (c5-scaled.ts) left TBD, from a calibration sweep over the registered C5
 * geometry, and demonstrates each bar is failable. This is the calibration run
 * (it SETS the bars), distinct from the c5-feasibility diagnostic (which shows the
 * statistics are reachable but commits no bar). Harness-side only: no engine
 * change, no spec change, no re-pin.
 *
 * What is graded (D-072): the merge-winner / E2 / E3 emergence determinations run
 * through c5-scaled's `classifyEmergence` / `convergence` / `convergenceWinner` —
 * D-069's robust born-dominance over the GLOBAL A(g) telemetry — NEVER the engine's
 * §9.2 DOMINANT(g) / DOMINANCE event. The weak regional-leader notion (E1 formation,
 * E3 lead-config) reads telemetry.regionLeaders directly (no rise clause, unaffected).
 *
 * Teaching cell (D-073, ratified at the C5 close): N=16 round-robin, REGION_COUNT 4
 * — the merge-reachable regime. The bars are 20% relative below the teaching cell's
 * observed rate (the H6 headroom rule, D-057(a)), in the failable direction (down),
 * rounded to 0.05. They are NOT lifted from the feasibility diagnostic (D-073): the
 * numbers come from this run, derived by the registered rule.
 *
 * Per-bar failability (the C4 lesson — a bar met everywhere proves nothing; each
 * bar needs a cited regime where it FAILS):
 *   - E1 (regional moneys form): fails in the SINGLE-REGION ablation (REGION_COUNT 1,
 *     same geometry otherwise). With one region the engine tracks no regional leaders
 *     at all (statistic.ts runs the regional block only when regionCount > 1), so the
 *     "≥2 distinct regional leaders" predicate collapses to 0 — the mechanic (regional
 *     partition) is disabled and the bar collapses, the C5 analogue of C4's A2:divisibility
 *     ablation.
 *   - E2 (regions merge): fails at regional-clustered placement — the reach geometry
 *     fragments into regional moneys that never merge (D-073 finding, recorded not tuned).
 *   - E3 (portability decides the merge): fails at N=12 round-robin (the merge is too
 *     weak at the lower population) and at clustered (no merge to decide). The bar also
 *     sits above the ~1/3 three-good chance baseline, so clearing it is non-trivial.
 */

import type { RunResult } from "../engines/emergence/types.ts";
import { run } from "../engines/emergence/index.ts";
import { deriveSeeds, DEFAULT_BATCH_SIZE } from "./batch.ts";
import { scaledOutcome, type ScaledOutcome } from "./c5-scaled.ts";
import { buildC5, LOW_PORT, HIGH_PORT, type Placement } from "./c5-config.ts";
import { h6FloorBar, H6_HEADROOM, type DerivedBar } from "./c0.ts";

/** Functional sweep base (D-010); not outcome-shopped. Same base as the feasibility diagnostic. */
export const C5_CAL_BASE_SEED = 20260608;

/** The teaching population (D-073: N=16 at the interim ≤16 ceiling). */
export const C5_TEACHING_N = 16;
/** The E3 failability population (D-073: N=12 round-robin is too weak on E3). */
export const C5_FAIL_E3_N = 12;

/** The three-good chance baseline the E3 directional claim must beat (D-073). */
export const E3_CHANCE_BASELINE = 1 / 3;

// --- Ratified bars (H6, D-057(a)) ---------------------------------------------
// Filled from THIS calibration run's teaching cell (N=16 round-robin) and ratified
// as literals so the criteria battery grades a FIXED bar (a real regression guard,
// not a tautology that re-derives the bar each run). `runC5Calibration()` re-derives
// them live and asserts these literals still match — an engine-drift guard.
//   E1 form   observed 0.760 -> floor(0.760·0.80 / 0.05)·0.05 = 0.60
//   E2 merge  observed 0.840 -> floor(0.840·0.80 / 0.05)·0.05 = 0.65
//   E3 decides observed 0.586 -> floor(0.586·0.80 / 0.05)·0.05 = 0.45  (> 0.333 chance)
export const E1_BAR = 0.6;
export const E2_BAR = 0.65;
export const E3_BAR = 0.45;

/** Pass-rate bar rounding granularity (matches the c0 village pass-rate bars). */
const BAR_STEP = 0.05;

// --- Cell configs (the teaching cell + one cited failability cell per bar) -----

/** Teaching cell: N=16 round-robin, REGION_COUNT 4 (D-073-ratified merge-reachable regime). */
export function c5TeachingConfig() {
  return buildC5(C5_TEACHING_N, "round-robin", 4);
}
/** E1 failability cell: the single-region ablation — REGION_COUNT 1, no regional leaders form. */
export function c5FailE1Config() {
  return buildC5(C5_TEACHING_N, "round-robin", 1);
}
/** E2 failability cell: regional-clustered placement — fragments, never merges (D-073 finding). */
export function c5FailE2Config() {
  return buildC5(C5_TEACHING_N, "regional-clustered", 4);
}
/** E3 failability cell: N=12 round-robin — the merge is too weak to be portability-decided. */
export function c5FailE3Config() {
  return buildC5(C5_FAIL_E3_N, "round-robin", 4);
}

/** Run a cell's 50-seed batch and aggregate the E1/E2/E3 statistics (robust measure, no DOMINANCE). */
export function runScaledCell(config: ReturnType<typeof buildC5>): ScaledOutcome {
  const seeds = deriveSeeds(C5_CAL_BASE_SEED, DEFAULT_BATCH_SIZE);
  const runs: RunResult[] = seeds.map((s) => run(config, s));
  return scaledOutcome(runs, LOW_PORT, HIGH_PORT);
}

// --- The calibration report ----------------------------------------------------

export interface C5Cell {
  readonly label: string;
  readonly n: number;
  readonly placement: Placement;
  readonly regionCount: number;
  /** "teaching" or the bar this cell is the cited failability demonstration for. */
  readonly role: "teaching" | "E1-fail" | "E2-fail" | "E3-fail" | "context";
  readonly outcome: ScaledOutcome;
}

export interface C5CalibrationReport {
  readonly id: "C5";
  readonly focal: "portability";
  readonly teachingCell: string;
  /** The three C0-filled bars (E1 form / E2 merge / E3 decides), per H6. */
  readonly bars: readonly DerivedBar[];
  /** The E3 chance baseline the directional bar must beat (reported alongside). */
  readonly e3ChanceBaseline: number;
  readonly cells: readonly C5Cell[];
  /** Whether the teaching cell meets all three bars (the C0 "demonstrated reachable" condition). */
  readonly feasible: boolean;
}

/**
 * Build a pass-rate DerivedBar from a teaching-cell observed rate: 20% relative below
 * (D-057(a)), rounded down to BAR_STEP. `failObserved` is the cited failability cell's
 * rate; the bar is non-trivially failable iff that cell falls below it.
 */
function passRateBar(
  name: string,
  observed: number,
  failBasisCell: string,
  failObserved: number,
  fixed: number,
): DerivedBar {
  const derived = h6FloorBar(observed, BAR_STEP);
  if (Math.abs(derived - fixed) > 1e-9) {
    throw new Error(
      `C5 bar drift: ${name} ratified at ${fixed} but this run derives ${derived} (H6 ${Math.round(H6_HEADROOM * 100)}% below observed ${observed.toFixed(3)}). ` +
        `The ratified literal no longer matches the calibration — re-ratify via the register, do not silently move the bar.`,
    );
  }
  return {
    name,
    role: "primary",
    value: fixed,
    observedBase: observed,
    basis: `teaching cell N=${C5_TEACHING_N} round-robin (D-073); fails at ${failBasisCell} (rate ${failObserved.toFixed(3)} < ${fixed})`,
    failableDirection: "down",
    nonTriviallyFailable: failObserved < fixed,
  };
}

/**
 * Run the C5 calibration: the teaching cell sets the bars (H6, D-057(a)); the
 * failability cells demonstrate each bar collapses where its mechanic is disabled.
 */
export function runC5Calibration(): C5CalibrationReport {
  const teaching = runScaledCell(c5TeachingConfig());
  const failE1 = runScaledCell(c5FailE1Config());
  const failE2 = runScaledCell(c5FailE2Config());
  const failE3 = runScaledCell(c5FailE3Config());
  const contextClustered12 = runScaledCell(buildC5(C5_FAIL_E3_N, "regional-clustered", 4));

  const bars: DerivedBar[] = [
    passRateBar("E1 regional-moneys-form rate (≥2 distinct regional leaders before convergence)", teaching.e1FormRate, "single-region ablation (REGION_COUNT 1)", failE1.e1FormRate, E1_BAR),
    passRateBar("E2 regions-merge rate (converged via an emerged winner, robust)", teaching.e2MergeRate, "regional-clustered placement", failE2.e2MergeRate, E2_BAR),
    passRateBar("E3 portability-decides-merge rate (high-port good wins+emerges, directional)", teaching.e3DecidesRate, `N=${C5_FAIL_E3_N} round-robin`, failE3.e3DecidesRate, E3_BAR),
  ];

  const cells: C5Cell[] = [
    { label: `N=${C5_TEACHING_N} round-robin (RC=4)`, n: C5_TEACHING_N, placement: "round-robin", regionCount: 4, role: "teaching", outcome: teaching },
    { label: `N=${C5_FAIL_E3_N} round-robin (RC=4)`, n: C5_FAIL_E3_N, placement: "round-robin", regionCount: 4, role: "E3-fail", outcome: failE3 },
    { label: `N=${C5_TEACHING_N} regional-clustered (RC=4)`, n: C5_TEACHING_N, placement: "regional-clustered", regionCount: 4, role: "E2-fail", outcome: failE2 },
    { label: `N=${C5_TEACHING_N} round-robin (RC=1, single-region ablation)`, n: C5_TEACHING_N, placement: "round-robin", regionCount: 1, role: "E1-fail", outcome: failE1 },
    { label: `N=${C5_FAIL_E3_N} regional-clustered (RC=4)`, n: C5_FAIL_E3_N, placement: "regional-clustered", regionCount: 4, role: "context", outcome: contextClustered12 },
  ];

  const feasible = teaching.e1FormRate >= E1_BAR && teaching.e2MergeRate >= E2_BAR && teaching.e3DecidesRate >= E3_BAR;

  return {
    id: "C5",
    focal: "portability",
    teachingCell: `N=${C5_TEACHING_N} round-robin (RC=4)`,
    bars,
    e3ChanceBaseline: E3_CHANCE_BASELINE,
    cells,
    feasible,
  };
}
