/**
 * C-SERIES RELOCATION FEASIBILITY (Phase 2 demonstration; D-059/060/061).
 * EXPLICITLY DIAGNOSTIC: not a registered pass, commits no bar. It shows the
 * relocated per-dimension checks (harness/c-series.ts) read telemetry and
 * separate the focal trio where A(g) freezes — the empirical backing for the
 * Phase 2 relocation. The pass-rate fraction and the visible-margin floor are
 * TBD, filled by the C0 re-run under a registered D-057-successor entry (H6);
 * nothing here is a committed cell or bar.
 *
 *   C3 durability  -> persistence  (honey/never-spoils >> fish/perishable)
 *   C4 divisibility -> circulation + divisibility-refusal (nails/fine circulates;
 *                      iron-pot/whole stalls and is refused on change-making)
 *
 * Harness code: may use Node/console. The engine stays platform-pure.
 */

import type { RunResult } from "../engines/emergence/types.ts";
import { run } from "../engines/emergence/index.ts";
import { deriveSeeds, DEFAULT_BATCH_SIZE } from "./batch.ts";
import {
  buildVillage,
  VILLAGE_BEATS,
  C0_MAPPING_VILLAGE,
  C0_CONSTANTS_VILLAGE,
  type VillageBeat,
} from "./c0.ts";
import {
  focalEventCounts,
  statByGood,
  persistence,
  survival,
  circulation,
  divisibilityRefusalRate,
  orderedByMargin,
  separatedByMargin,
  type GoodStat,
} from "./c-series.ts";

const SEEDS = deriveSeeds(20260608, DEFAULT_BATCH_SIZE); // functional base (D-010); not outcome-shopped
const FOCAL = [0, 1, 2];
const C3 = VILLAGE_BEATS.find((b) => b.id === "C3")!; // durability: 0 fish(2,2) 1 grain(8,4) 2 honey(never)
const C4 = VILLAGE_BEATS.find((b) => b.id === "C4")!; // divisibility: 0 whole 1 coarse 2 fine

const f3 = (x: number | null) => (x == null ? "  —  " : x.toFixed(3));
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const definedMean = (xs: (number | null)[]) => {
  const d = xs.filter((x): x is number => x != null);
  return { mean: d.length ? mean(d) : NaN, definedRate: xs.length ? d.length / xs.length : 0 };
};
const aShare = (r: RunResult, g: number): number | null => {
  const last = r.telemetry[r.telemetry.length - 1]!;
  const v = last.acceptanceShare[g];
  return v == null ? null : v;
};

/** Pass rate over the batch for a per-run predicate, restricted to runs where it is defined. */
function definedRate(rows: GoodStat[], pred: (s: GoodStat) => boolean | null): { rate: number; n: number } {
  let hits = 0;
  let n = 0;
  for (const s of rows) {
    const v = pred(s);
    if (v === null) continue;
    n++;
    if (v) hits++;
  }
  return { rate: n ? hits / n : NaN, n };
}

interface Regime {
  readonly label: string;
  readonly n: number;
  readonly filler: number;
}
const REGIMES: readonly Regime[] = [
  { label: "registered N=12 filler=5 (8-good, frozen)", n: 12, filler: 5 },
  { label: "registered N=16 filler=5 (8-good)", n: 16, filler: 5 },
  { label: "liquid     N=12 filler=1 (4-good)", n: 12, filler: 1 },
];

/** C3 — persistence. */
function reportC3(beat: VillageBeat, reg: Regime): void {
  const cfg = buildVillage(beat, reg.n, reg.filler, C0_MAPPING_VILLAGE, C0_CONSTANTS_VILLAGE);
  const runs = SEEDS.map((s) => run(cfg, s));
  const counts = runs.map((r) => focalEventCounts(r.events, FOCAL));
  const pers = counts.map((c) => statByGood(c, persistence));
  const surv = counts.map((c) => statByGood(c, survival));

  console.log(`  [${reg.label}]`);
  const names = ["fish(0,perish)", "grain(1,mid)", "honey(2,durable)"];
  console.log("    good              A(g)   persist  surviv  defined%");
  for (const g of FOCAL) {
    const A = definedMean(runs.map((r) => aShare(r, g)));
    const P = definedMean(pers.map((s) => s[g]!));
    const S = definedMean(surv.map((s) => s[g]!));
    console.log(`    ${names[g]!.padEnd(16)} ${f3(A.mean)}  ${f3(P.mean)}   ${f3(S.mean)}    ${(P.definedRate * 100).toFixed(0)}%`);
  }
  for (const m of [0.1, 0.2, 0.3]) {
    const ord = definedRate(pers, (s) => orderedByMargin(s, 0, 1, 2, m));
    console.log(`    persistence full-order 2>1>0, margin honey−fish ≥${m}: ${f3(ord.rate)} (n=${ord.n})  [bar % TBD, C0-filled]`);
  }
  const aOrd = definedRate(
    runs.map((r) => ({ 0: aShare(r, 0), 1: aShare(r, 1), 2: aShare(r, 2) }) as GoodStat),
    (s) => orderedByMargin(s, 0, 1, 2, 0.1),
  );
  console.log(`    A(g) [the frozen metric] full-order ≥0.1: ${f3(aOrd.rate)} (n=${aOrd.n})\n`);
}

/** C4 — circulation + divisibility-refusal hook. */
function reportC4(beat: VillageBeat, reg: Regime): void {
  const cfg = buildVillage(beat, reg.n, reg.filler, C0_MAPPING_VILLAGE, C0_CONSTANTS_VILLAGE);
  const runs = SEEDS.map((s) => run(cfg, s));
  const counts = runs.map((r) => focalEventCounts(r.events, FOCAL));
  const circ = counts.map((c) => statByGood(c, circulation));
  const divR = counts.map((c) => statByGood(c, divisibilityRefusalRate));

  console.log(`  [${reg.label}]`);
  const names = ["iron-pot(0,whole)", "iron-bar(1,coarse)", "iron-nails(2,fine)"];
  console.log("    good                  A(g)   circ   divRefusal/unit  defined%");
  for (const g of FOCAL) {
    const A = definedMean(runs.map((r) => aShare(r, g)));
    const C = definedMean(circ.map((s) => s[g]!));
    const D = definedMean(divR.map((s) => s[g]!));
    console.log(`    ${names[g]!.padEnd(20)} ${f3(A.mean)}  ${f3(C.mean)}      ${f3(D.mean)}        ${(C.definedRate * 100).toFixed(0)}%`);
  }
  // Teaching claim: fine(2) circulates more than whole(0); whole(0) is refused on change-making more than fine(2).
  for (const m of [0.1, 0.2, 0.3]) {
    const sep = definedRate(circ, (s) => separatedByMargin(s, 0, 2, m));
    console.log(`    circulation fine(2)−whole(0) ≥${m}: ${f3(sep.rate)} (n=${sep.n})  [bar % TBD, C0-filled]`);
  }
  const divStall = definedRate(divR, (s) => separatedByMargin(s, 2, 0, 0.05)); // whole refused MORE than fine
  console.log(`    change-making stalls: divRefusal/unit whole(0)−fine(2) ≥0.05: ${f3(divStall.rate)} (n=${divStall.n})  [legibility hook]\n`);
}

console.log("C-SERIES RELOCATION FEASIBILITY — Phase 2 (D-059/060/061). DIAGNOSTIC ONLY (no pass, no bar).");
console.log(`Statistics read the witnessed event stream only; ${DEFAULT_BATCH_SIZE}-seed batches.\n`);

console.log("=== C3 durability -> PERSISTENCE (held-and-re-traded; A(g) freezes here) ===");
for (const reg of REGIMES) reportC3(C3, reg);

console.log("=== C4 divisibility -> CIRCULATION + change-making refusal (A(g) freezes here) ===");
for (const reg of REGIMES) reportC4(C4, reg);
