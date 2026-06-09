/**
 * C1 want-share grid re-run (D-066) — close the desirability beat by WIDENING THE
 * LEVER, never lowering the bar (D-059; lowering 0.90 to the observed 0.80 is the
 * D-001 anti-pattern). At the registered want-share grid C1 reached A(g) 0.80
 * against the 0.90 focal-relative top-acceptance-share round bar (D-058, C1-scoped)
 * at the C1 teaching frame (N=16, filler=1, the liquid 4-good frame where C1 leads
 * highest). This sweeps the widened high ("most") want-share grid pinned by D-066,
 * holding the mid ("some") neutral fixed at 0.15 (D-024(b)) so D-065's just-ratified
 * C3/C4 teaching cells are UNPERTURBED, to find the lowest high weight that reaches
 * the unchanged 0.90 bar while the favored good still EMERGES.
 *
 * Born-dominance filter, re-measured per D-069: "first-defined A(g)=1.0" does NOT
 * measure born-dominance (A(g) on one event is {0,1}, so it just means the favored
 * good's first witnessed event was a successful trade — earning, not seeded). The
 * robust measure reads the windowed per-round A(g) TRAJECTORY (§9.3 telemetry): a
 * cell's favored good is BORN-DOMINANT iff its A(g) is sustained >= 1 - DOM_RISE_MIN
 * across the first WINDOW_ROUNDS from its first STABLY-defined value (n>=2 events,
 * past the n=1 artifact); otherwise EMERGED (an n=1 1.0 that resolves downward, or a
 * rise from a lower stable start). A born-dominant cell's top-share "pass" is fiat,
 * excluded; the answer is the lowest EMERGED high weight reaching 0.90 with the bar
 * failable. This re-classifies the committed D-066 run (deterministic; harness-side
 * filter, NOT the engine DOMINANT(g)) — no re-run, no engine change, no re-pin (D-069
 * preconditions confirmed at head). D-069 pre-commits to honor either outcome for the
 * lowest bar-reaching cell (high=0.40): emerged -> C1 candidate; born-dominant -> the
 * C1<->rise-clause coupling finding (no candidate this pass).
 *
 * H6: the grid is written to the input artifact BEFORE the run (pre-registered
 * input, pinned against the live register per D-066 — not derived from the output).
 * The chosen want-share value is set by the C1 closing entry via D-057(a) headroom
 * FROM this artifact, not off the 0.92 diagnostic (reachability evidence only).
 * Harness-only, no re-pin: a parameter sweep through the existing engine + harness.
 */

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Config, LevelMapping, RunResult } from "../engines/emergence/types.ts";
import { run } from "../engines/emergence/index.ts";
import { deriveSeeds, DEFAULT_BATCH_SIZE } from "./batch.ts";
import { passRate } from "./stats.ts";
import { buildVillage, VILLAGE_BEATS, C0_MAPPING_VILLAGE, C0_CONSTANTS_VILLAGE, roundFocalPassRun } from "./c0.ts";

const C1 = VILLAGE_BEATS.find((b) => b.id === "C1")!; // desirability; favored = id 2 (best/high want-share)
const FAVORED = 2;
const C1_BASE_SEED = 20260608; // the C0 functional base (D-010); same batch as the campaign
const SEEDS = deriveSeeds(C1_BASE_SEED, DEFAULT_BATCH_SIZE);

// C1 teaching frame (held fixed; only want-share moves): N=16, filler=1 — the frame at
// which the registered grid reached 0.80 (D-065).
const N = 16;
const FILLER = 1;

// D-058/D-057(e), C1-scoped, NOT lowered (D-059).
const BAR = 0.9; // focal-relative top-acceptance-share pass rate
// Mid ("some") neutral, held fixed (D-024(b)) — the desirability neutral the C3/C4 rounds use.
const MID_NEUTRAL = 0.15;
const FILLER_MIN_SHARE = C0_CONSTANTS_VILLAGE.FILLER_MIN_SHARE; // 0.25 (D-057(d)); focal sum must stay <= 1 - this.

/** A grid cell: the [low, mid, high] want-share weights to sweep. Pinned by D-066 — no live edits. */
interface GridCell {
  readonly label: string;
  readonly low: number;
  readonly mid: number;
  readonly high: number;
  /** A legibility variant (lowered "few") rather than a high-axis point. */
  readonly kind: "high-axis" | "legibility";
}

// PINNED GRID (D-066, operator-approved). Sweep EXACTLY this — a change is a new pin
// proposal, not a live edit. High ("most") axis, mid 0.15 / low 0.08 held; plus one
// legibility cell {high 0.50 / mid 0.15 / low 0.05}.
const HIGH_AXIS = [0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.52] as const;
const GRID: readonly GridCell[] = [
  ...HIGH_AXIS.map((high): GridCell => ({ label: `high=${high.toFixed(2)}`, low: 0.08, mid: MID_NEUTRAL, high, kind: "high-axis" })),
  { label: "legibility:high=0.50,low=0.05", low: 0.05, mid: MID_NEUTRAL, high: 0.5, kind: "legibility" },
];

function mappingFor(cell: GridCell): LevelMapping {
  return { ...C0_MAPPING_VILLAGE, wantShareWeight: [cell.low, cell.mid, cell.high] };
}
function configFor(cell: GridCell): Config {
  return buildVillage(C1, N, FILLER, mappingFor(cell), C0_CONSTANTS_VILLAGE);
}
const focalSum = (c: GridCell) => c.low + c.mid + c.high;

// --- D-069 born-dominance measure (re-classification of the committed run) ------
// "first-defined A(g)=1.0" does not measure born-dominance: A(g) on a single witnessed
// event is {0,1}, so first-defined=1.0 just means the good's first event was a successful
// trade — earning position, not seeded dominant. The robust measure reads the windowed
// per-round A(g) TRAJECTORY (§9.3 telemetry): a good is BORN-DOMINANT iff its A(g) is
// sustained ≥ 1 − DOM_RISE_MIN across the first WINDOW_ROUNDS from its first STABLY-defined
// value (n ≥ 2 in-window events, past the n=1 artifact); otherwise EMERGED (an n=1 1.0 that
// resolves downward, or a rise from a lower stable start). Harness-side over telemetry —
// NOT the engine's §9.2 DOMINANT(g) detector (which still uses the confounded first-defined
// rule; reconciling §9.2 is a flagged successor, D-069, engine change + re-pin if taken).
const WINDOW = C0_CONSTANTS_VILLAGE.WINDOW_ROUNDS; // 12
const CEIL_FLOOR = 1 - C0_CONSTANTS_VILLAGE.DOM_RISE_MIN; // 0.85

type Trajectory = "born-dominant" | "emerged" | "no-evidence";

/** Per-round in-window distinct event count involving the favored good (§9.1 event set). */
function favoredInWindowCount(r: RunResult): (round: number) => number {
  const maxRound = r.telemetry.length;
  const newEv = new Array<number>(maxRound + 2).fill(0);
  for (const e of r.events) {
    let involves = false;
    if (e.type === "TRADE") involves = e.goodFromProposer === FAVORED || e.goodFromPartner === FAVORED;
    else if (e.type === "REFUSAL") involves = e.offeredGood === FAVORED;
    else if (e.type === "FAKE_REVEAL" || e.type === "SPOIL_DESTROY") involves = e.good === FAVORED;
    if (involves && e.round >= 1 && e.round <= maxRound) newEv[e.round]! += 1;
  }
  return (round: number) => {
    let n = 0;
    for (let rr = Math.max(1, round - WINDOW + 1); rr <= round; rr++) n += newEv[rr] ?? 0;
    return n;
  };
}

/** Classify the favored good's emergence vs born-dominance for one run (D-069). */
function classifyTrajectory(r: RunResult): Trajectory {
  const tel = r.telemetry;
  const A = (round: number): number | null => {
    const t = tel[round - 1];
    if (!t) return null;
    const v = t.acceptanceShare[FAVORED];
    return v === null || v === undefined ? null : v;
  };
  const everDefined = tel.some((t) => { const v = t.acceptanceShare[FAVORED]; return v !== null && v !== undefined; });
  if (!everDefined) return "no-evidence";
  const nInWindow = favoredInWindowCount(r);
  // First STABLY-defined round: A defined and the §9.1 event set has ≥ 2 events (not the n=1 artifact).
  let rs = -1;
  for (let round = 1; round <= tel.length; round++) {
    if (A(round) !== null && nInWindow(round) >= 2) { rs = round; break; }
  }
  if (rs === -1) return "emerged"; // never resolves past n=1 (noisy/thin start), not born-dominant
  // Born-dominant iff A(g) is defined and ≥ CEIL_FLOOR in EVERY round of the first WINDOW from rs
  // (sustained near the ceiling — never dipped, never rose into position). Any dip/gap ⇒ emerged.
  for (let round = rs; round < rs + WINDOW && round <= tel.length; round++) {
    const a = A(round);
    if (a === null || a < CEIL_FLOOR) return "emerged";
  }
  return "born-dominant";
}

type Category = "reached-0.90" | "born-dominant-filtered" | "below-bar";

interface CellResult {
  readonly label: string;
  readonly kind: string;
  readonly low: number;
  readonly mid: number;
  readonly high: number;
  readonly focalSum: number;
  readonly fillerShare: number;
  readonly passRate: number;
  /** Fraction of runs the favored good is born-dominant under the D-069 trajectory measure. */
  readonly bornDominantRate: number;
  /** Legacy first-defined=1.0 rate, reported for contrast (the confounded measure D-069 replaces). */
  readonly firstDefinedCeilingRate: number;
  readonly favoredFinalShareMean: number;
  /** Cell verdict: born-dominant iff the favored is born-dominant in the majority of runs. */
  readonly verdict: "emerged" | "born-dominant";
  readonly category: Category;
}

function runCell(cell: GridCell): CellResult {
  const results = SEEDS.map((s) => run(configFor(cell), s));
  const pass = passRate(results.map(roundFocalPassRun)).rate;
  const traj = results.map(classifyTrajectory);
  const bornDom = traj.filter((t) => t === "born-dominant").length / results.length;
  const firstDefCeil = results.filter((r) => {
    for (const t of r.telemetry) { const v = t.acceptanceShare[FAVORED]; if (v !== null && v !== undefined) return v === 1; }
    return false;
  }).length / results.length;
  let favSum = 0;
  let favCnt = 0;
  for (const r of results) {
    const last = r.telemetry[r.telemetry.length - 1]!;
    const v = last.acceptanceShare[FAVORED];
    if (v !== null && v !== undefined) { favSum += v; favCnt++; }
  }
  // Cell verdict: born-dominant iff the favored is born-dominant in the MAJORITY of runs.
  const verdict: "emerged" | "born-dominant" = bornDom > 0.5 ? "born-dominant" : "emerged";
  // A born-dominant cell is filtered (its top-share "pass" is fiat); otherwise it reaches
  // the bar or not. (NO_EVIDENCE/noisy runs count toward emerged, never born-dominant.)
  const category: Category = verdict === "born-dominant" ? "born-dominant-filtered" : pass >= BAR ? "reached-0.90" : "below-bar";
  return {
    label: cell.label, kind: cell.kind, low: cell.low, mid: cell.mid, high: cell.high,
    focalSum: focalSum(cell), fillerShare: 1 - focalSum(cell),
    passRate: pass, bornDominantRate: bornDom, firstDefinedCeilingRate: firstDefCeil,
    favoredFinalShareMean: favCnt ? favSum / favCnt : NaN, verdict, category,
  };
}

// --- H6: write the recorded INPUT artifact BEFORE the run --------------------
const dir = fileURLToPath(new URL("./c0-artifacts", import.meta.url));
const inputArtifact = {
  beat: "C1",
  focal: "desirability",
  register: "D-066 (want-share sweep expansion; D-057 successor)",
  bar: { value: BAR, kind: "focal-relative top-acceptance-share pass rate", source: "D-058 (C1-scoped); NOT lowered (D-059)" },
  frame: { n: N, filler: FILLER, note: "C1 teaching frame — where the registered grid reached 0.80 (D-065)" },
  held: {
    midNeutral: MID_NEUTRAL, midNeutralSource: "D-024(b) — the desirability neutral the C3/C4 rounds use; held fixed so D-065's C3/C4 cells are unperturbed",
    constants: "C0_CONSTANTS_VILLAGE (D-057)",
  },
  constraints: {
    fillerMinShare: FILLER_MIN_SHARE,
    focalSumUpperBound: 1 - FILLER_MIN_SHARE,
    bornDominanceFilter: `D-069 (re-measured): a cell's favored good is BORN-DOMINANT iff its A(g) is sustained >= ${CEIL_FLOOR} (1 - DOM_RISE_MIN) across the first ${WINDOW} rounds (WINDOW_ROUNDS) from its first stably-defined value (n>=2 events); else EMERGED. Replaces the confounded first-defined A(g)=1.0 rise filter (D-066 c2). Harness-side; NOT the engine DOMINANT(g).`,
  },
  seeds: { base: C1_BASE_SEED, count: DEFAULT_BATCH_SIZE },
  grid: GRID.map((c) => ({ label: c.label, kind: c.kind, low: c.low, mid: c.mid, high: c.high, focalSum: Number(focalSum(c).toFixed(4)) })),
  note: "Pinned grid (D-066, operator-approved). Recorded pre-run (H6). Swept EXACTLY as listed. The result is re-classified under the D-069 born-dominance measure — the deterministic runs (config+seed) are byte-identical to the committed run; only the harness-side classifier changed (no re-run, no engine change, no re-pin).",
};
writeFileSync(`${dir}/C1_GRID_INPUT.json`, JSON.stringify(inputArtifact, null, 2) + "\n");

// --- Re-classify the committed run (deterministic; D-069 born-dominance) ------
const cells = GRID.map(runCell);

// Candidate (D-069 pre-commitment, focus high=0.40 — the lowest bar-reaching cell): the
// lowest high-axis weight that reaches 0.90 AND is EMERGED (not born-dominant). "Bar still
// failable" = some high-axis cell is below-bar (the bar is not trivially passed).
const highAxisCells = cells.filter((c) => c.kind === "high-axis").sort((a, b) => a.high - b.high);
const anyBelowBar = highAxisCells.some((c) => c.category === "below-bar");
const reachedValid = highAxisCells.filter((c) => c.category === "reached-0.90"); // emerged AND >= 0.90
const candidate = reachedValid.length > 0 ? reachedValid[0]! : null; // lowest high (ascending)
const lowestBarReaching = highAxisCells.find((c) => c.passRate >= BAR) ?? null; // regardless of verdict (the focus cell)
const reachableEmerged = candidate !== null;

const resultArtifact = {
  beat: "C1",
  register: "D-066 (grid) + D-069 (born-dominance re-measure)",
  bar: BAR,
  frame: { n: N, filler: FILLER },
  midNeutralHeld: MID_NEUTRAL,
  barFailable: anyBelowBar,
  bornDominanceMeasure: { floor: CEIL_FLOOR, window: WINDOW, basis: "sustained >= 1 - DOM_RISE_MIN across first WINDOW_ROUNDS from first stably-defined (n>=2) value (D-069)" },
  lowestBarReachingCell: lowestBarReaching ? { high: lowestBarReaching.high, passRate: lowestBarReaching.passRate, verdict: lowestBarReaching.verdict, bornDominantRate: lowestBarReaching.bornDominantRate } : null,
  outcome: reachableEmerged ? "C1-candidate" : "C1-rise-clause-coupling-finding",
  candidate: candidate
    ? { high: candidate.high, low: candidate.low, mid: candidate.mid, passRate: candidate.passRate, verdict: candidate.verdict, bornDominantRate: candidate.bornDominantRate,
        note: "Lowest EMERGED high weight reaching 0.90 with the bar failable — the value the C1 closing entry ratifies per D-057(a) headroom (this artifact). Reporting only; selection is the closing entry's (D-069)." }
    : null,
  couplingFinding: reachableEmerged ? null
    : "Per the D-069 pre-commitment: the lowest bar-reaching cell is BORN-DOMINANT, so 0.90 is unreachable at the held D-024(b) neutral without born-dominance — the C1<->rise-clause coupling finding stands. No candidate this pass; C1's resolution routes to a beat-design question (the C0 escape clause, partly content's), not a further want-share push.",
  cells: cells.map((c) => ({
    label: c.label, kind: c.kind, low: c.low, mid: c.mid, high: c.high,
    focalSum: Number(c.focalSum.toFixed(4)), fillerShare: Number(c.fillerShare.toFixed(4)),
    passRate: Number(c.passRate.toFixed(3)),
    bornDominantRate: Number(c.bornDominantRate.toFixed(3)),
    firstDefinedCeilingRate: Number(c.firstDefinedCeilingRate.toFixed(3)),
    favoredFinalShareMean: Number(c.favoredFinalShareMean.toFixed(3)),
    verdict: c.verdict, category: c.category,
  })),
};
writeFileSync(`${dir}/C1_GRID_RESULT.json`, JSON.stringify(resultArtifact, null, 2) + "\n");

// --- Report ------------------------------------------------------------------
const f = (x: number) => x.toFixed(3);
console.log("C1 want-share grid RE-CLASSIFICATION (D-069 born-dominance) over the committed D-066 run.");
console.log(`frame N=${N} filler=${FILLER}; mid neutral HELD at ${MID_NEUTRAL} (D-024(b)); ${DEFAULT_BATCH_SIZE}-seed batches; bar 0.90 (D-058, NOT lowered).`);
console.log(`born-dominant := A(g) sustained >= ${CEIL_FLOOR} across first ${WINDOW} rounds from first stably-defined (n>=2) value; else emerged.\n`);
console.log("  cell                          [low,mid,high]   pass    bornDom  (firstDef=1.0)  favFinal  verdict        category");
for (const c of cells) {
  console.log(
    `  ${c.label.padEnd(28)} [${f(c.low)},${f(c.mid)},${f(c.high)}]   ${f(c.passRate)}   ${f(c.bornDominantRate)}    (${f(c.firstDefinedCeilingRate)})        ${f(c.favoredFinalShareMean)}    ${c.verdict.padEnd(13)}  ${c.category}`,
  );
}
console.log("");
console.log(`bar failable (some high-axis cell below bar): ${anyBelowBar ? "YES" : "NO"}`);
if (lowestBarReaching) {
  console.log(`FOCUS — lowest bar-reaching cell: high=${lowestBarReaching.high.toFixed(2)} (pass=${f(lowestBarReaching.passRate)}) -> verdict: ${lowestBarReaching.verdict.toUpperCase()} (bornDom rate ${f(lowestBarReaching.bornDominantRate)})`);
}
if (reachableEmerged) {
  console.log(`OUTCOME: C1 CANDIDATE = high ${candidate!.high.toFixed(2)} (emerged, reaches 0.90, bar failable).`);
  console.log("  -> ratifiable by the C1 closing entry per D-057(a) headroom from this artifact (reporting only; selection is the closing entry's, D-069).");
} else {
  console.log("OUTCOME: C1<->rise-clause COUPLING FINDING (D-069 pre-commitment).");
  console.log("  The lowest bar-reaching cell is born-dominant: 0.90 is unreachable at the held D-024(b) neutral without");
  console.log("  born-dominance. No candidate this pass; C1 routes to a beat-design question (C0 escape), not more want-share.");
}
console.log("\nartifacts: c0-artifacts/C1_GRID_INPUT.json (pre-run, H6) + c0-artifacts/C1_GRID_RESULT.json");
