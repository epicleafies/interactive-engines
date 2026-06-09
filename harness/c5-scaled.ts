/**
 * C5 scaled-grading module — E1/E2/E3 over scaled-mode runs (the D-063 pending-module,
 * built against D-072). Extends the Phase-2 regional-trace scaffold (c-series.ts
 * finalRegionalLeaders / ledOutsideRegion) into full regional-formation / merge grading.
 *
 * D-072 (pre-build constraint): wherever C5 needs an emergence / born-dominance /
 * convergence-winner determination, use D-069's ROBUST measure — A(g) sustained
 * >= 1 - DOM_RISE_MIN across the first WINDOW_ROUNDS from the first stably-defined (n>=2)
 * value — recomputed HARNESS-SIDE from acceptance-share telemetry (§9.3), NOT the engine's
 * §9.2 DOMINANT(g) / DOMINANCE event (which still carries the rise-clause confound D-069
 * corrected). The weak regional-leader notion (greatest per-region A(g)) carries no rise
 * clause and is unaffected — it is read from telemetry.regionLeaders directly.
 *
 * At-head recomputability (D-072): the per-round per-region leader (telemetry.regionLeaders)
 * and the global per-round A(g) trajectory (telemetry.acceptanceShare) are in §9.3 telemetry.
 * The merge-winner is the GLOBAL convergence winner — recomputable from the global A(g)
 * trajectory via the robust measure, with NO read of the DOMINANCE event. (Per-region A(g)
 * VALUES are not pre-aggregated in RoundTelemetry — only the derived regionLeaders are — but
 * the global merge-winner does not need them, and the weak regional leader is provided
 * directly; so the determination is recomputable without DOMINANT(g), and no STOP is owed.)
 *
 * D-060: C5 grades regional/merge behavior; the acceptance-share-ORDERING bar is dropped
 * and is NOT reintroduced here.
 *
 * Bars (pass-rate fractions, margins) are explicit TBD parameters (H6): this module fixes
 * the STATISTICS; the C0 re-run fills the numbers. Harness-side only — no engine change,
 * no spec change, no re-pin.
 */

import type { RunResult, AcceptanceShare } from "../engines/emergence/types.ts";

// =========================================================================
// Robust born-dominance (D-069 / D-072), over the GLOBAL A(g) trajectory.
// =========================================================================

export type Emergence = "born-dominant" | "emerged" | "no-evidence";

/** WINDOW_ROUNDS and the near-ceiling floor (1 - DOM_RISE_MIN) for a run, from its config (D-057). */
function bornDominanceParams(r: RunResult): { window: number; floor: number } {
  const c = r.record.config.constants;
  return { window: c.WINDOW_ROUNDS, floor: 1 - c.DOM_RISE_MIN };
}

/** Per-round global A(g) for good `g` (telemetry); null = NO_EVIDENCE. round is 1-indexed. */
function globalA(r: RunResult, g: number, round: number): AcceptanceShare {
  const t = r.telemetry[round - 1];
  if (!t) return null;
  const v = t.acceptanceShare[g];
  return v === undefined ? null : v;
}

/** In-window distinct global event count involving good `g` at a round (the §9.1 event set, from §10 events). */
function inWindowCountFn(r: RunResult, g: number): (round: number) => number {
  const window = r.record.config.constants.WINDOW_ROUNDS;
  const maxRound = r.telemetry.length;
  const newEv = new Array<number>(maxRound + 2).fill(0);
  for (const e of r.events) {
    let involves = false;
    if (e.type === "TRADE") involves = e.goodFromProposer === g || e.goodFromPartner === g;
    else if (e.type === "REFUSAL") involves = e.offeredGood === g;
    else if (e.type === "FAKE_REVEAL" || e.type === "SPOIL_DESTROY") involves = e.good === g;
    if (involves && e.round >= 1 && e.round <= maxRound) newEv[e.round]! += 1;
  }
  return (round: number) => {
    let n = 0;
    for (let rr = Math.max(1, round - window + 1); rr <= round; rr++) n += newEv[rr] ?? 0;
    return n;
  };
}

/**
 * Classify good `g`'s emergence vs born-dominance (D-069/D-072) over the GLOBAL A(g)
 * trajectory: born-dominant iff A(g) is defined and >= floor (1 - DOM_RISE_MIN) in EVERY
 * round of the first WINDOW_ROUNDS from its first stably-defined (in-window n >= 2) value
 * — sustained near the ceiling, never dipped, never rose into position. Otherwise emerged
 * (an n=1 first-event 1.0 that resolves downward, or a rise from a lower stable start).
 */
export function classifyEmergence(r: RunResult, g: number): Emergence {
  const { window, floor } = bornDominanceParams(r);
  const maxRound = r.telemetry.length;
  const everDefined = r.telemetry.some((t) => t.acceptanceShare[g] !== null && t.acceptanceShare[g] !== undefined);
  if (!everDefined) return "no-evidence";
  const nInWindow = inWindowCountFn(r, g);
  let rs = -1;
  for (let round = 1; round <= maxRound; round++) {
    if (globalA(r, g, round) !== null && nInWindow(round) >= 2) { rs = round; break; }
  }
  if (rs === -1) return "emerged"; // never resolves past the n=1 artifact (noisy/thin start)
  for (let round = rs; round < rs + window && round <= maxRound; round++) {
    const a = globalA(r, g, round);
    if (a === null || a < floor) return "emerged";
  }
  return "born-dominant";
}

// =========================================================================
// Convergence winner (the merge-winner) — robust, harness-side, no DOMINANCE.
// =========================================================================

/**
 * The round at which the market first converges: the earliest round from which some single
 * good's global A(g) stays >= DOM_THRESHOLD for the rest of the run (sustained global
 * dominance). Returns { round, good } or null if the market never converges. Read from the
 * global A(g) trajectory only — the robust replacement for the engine's DOMINANCE event (D-072).
 */
export function convergence(r: RunResult): { round: number; good: number } | null {
  const threshold = r.record.config.constants.DOM_THRESHOLD;
  const goodCount = r.record.config.goods.length;
  const maxRound = r.telemetry.length;
  for (let start = 1; start <= maxRound; start++) {
    for (let g = 0; g < goodCount; g++) {
      let held = true;
      for (let round = start; round <= maxRound; round++) {
        const a = globalA(r, g, round);
        if (a === null || a < threshold) { held = false; break; }
      }
      if (held && globalA(r, g, start) !== null) return { round: start, good: g };
    }
  }
  return null;
}

/** The convergence (merge) winner good id, or null if the market never converged. */
export function convergenceWinner(r: RunResult): number | null {
  return convergence(r)?.good ?? null;
}

// =========================================================================
// Regional structure (weak leader — D-072 unaffected; telemetry.regionLeaders).
// =========================================================================

/** Distinct goods that are ever a regional leader, restricted to rounds < `beforeRound` (exclusive; Infinity = all). */
export function regionalLeadersBefore(r: RunResult, beforeRound: number): Set<number> {
  const seen = new Set<number>();
  for (const t of r.telemetry) {
    if (t.round >= beforeRound) break;
    for (const l of t.regionLeaders) if (l !== null) seen.add(l);
  }
  return seen;
}

/** Regions in which good `g` is the leader at some round (the spatial footprint of g). */
export function regionsLedBy(r: RunResult, g: number): Set<number> {
  const regions = new Set<number>();
  for (const t of r.telemetry) {
    for (let region = 0; region < t.regionLeaders.length; region++) {
      if (t.regionLeaders[region] === g) regions.add(region);
    }
  }
  return regions;
}

// =========================================================================
// E1 / E2 / E3 per-run predicates. Bars (pass-rate fractions) are TBD (H6).
// =========================================================================

/**
 * E1 — regional moneys form: at least `minDistinctLeaders` distinct regional leaders appear
 * BEFORE global convergence (or across the whole run when it never converges). The weak
 * regional-leader notion (no rise clause, D-072 unaffected). `minDistinctLeaders` default 2
 * is the criterion's structural shape ("at least two distinct regional leaders"); a tuned
 * pass-rate bar over runs is C0-filled.
 */
export function e1RegionalMoneysForm(r: RunResult, minDistinctLeaders = 2): boolean {
  const conv = convergence(r);
  const before = conv ? conv.round : Infinity;
  return regionalLeadersBefore(r, before).size >= minDistinctLeaders;
}

/**
 * E2 — regions merge: the market reaches global convergence AND its convergence winner
 * EMERGED (robust born-dominance, D-072) rather than being born-dominant. A born-dominant
 * "convergence" is fiat, not a merge. Null when there is no convergence to grade (reported
 * as a non-merge, never a pass).
 */
export function e2RegionsMerge(r: RunResult): boolean {
  const conv = convergence(r);
  if (conv === null) return false;
  return classifyEmergence(r, conv.good) === "emerged";
}

/** Whether the E3 lead-configuration holds in a run: the low-port good leads some region and the high-port good leads another (weak leaders). */
export function e3LeadConfigHolds(r: RunResult, lowPortId: number, highPortId: number): boolean {
  const lowRegions = regionsLedBy(r, lowPortId);
  const highRegions = regionsLedBy(r, highPortId);
  if (lowRegions.size === 0 || highRegions.size === 0) return false;
  // Distinct regions: the two goods lead different regions at some point.
  for (const lr of lowRegions) if (!highRegions.has(lr)) return true;
  for (const hr of highRegions) if (!lowRegions.has(hr)) return true;
  return false;
}

/**
 * E3 — portability decides the merge (directional): in runs where the lead-configuration
 * holds (low-port leads one region, high-port another), the HIGH-PORT good wins the merge
 * and emerged (robust, D-072). Returns null when the lead-config does not hold (the run is
 * not in E3's conditioning set — excluded from the directional rate, never a fail).
 */
export function e3PortabilityDecidesMerge(r: RunResult, lowPortId: number, highPortId: number): boolean | null {
  if (!e3LeadConfigHolds(r, lowPortId, highPortId)) return null;
  const conv = convergence(r);
  if (conv === null) return false;
  return conv.good === highPortId && classifyEmergence(r, highPortId) === "emerged";
}

// =========================================================================
// Batch aggregation — pass rates over a batch (the C0 re-run fills the bars).
// =========================================================================

export interface ScaledOutcome {
  /** E1 pass rate: fraction of runs with >= minDistinctLeaders regional leaders before convergence. */
  readonly e1FormRate: number;
  /** E2 pass rate: fraction of runs that converged via an EMERGED winner (robust). */
  readonly e2MergeRate: number;
  /** Fraction of runs that converged at all (context for E2). */
  readonly convergedRate: number;
  /** E3 directional rate over the CONDITIONING set: of runs where the lead-config holds, the fraction the high-port good wins+emerged. */
  readonly e3DecidesRate: number;
  /** Size of the E3 conditioning set (runs where the lead-config held). */
  readonly e3ConditioningRuns: number;
  /** Diagnostic: mean fraction of (region,round) cells with a defined leader (low ⇒ thinness, D-058). */
  readonly regionalDefinedRate: number;
}

/** Aggregate E1/E2/E3 over a batch of scaled-mode runs (config supplies low/high-port focal ids). */
export function scaledOutcome(runs: readonly RunResult[], lowPortId: number, highPortId: number, minDistinctLeaders = 2): ScaledOutcome {
  const n = runs.length;
  let e1 = 0;
  let e2 = 0;
  let converged = 0;
  let e3hits = 0;
  let e3cond = 0;
  let defSum = 0;
  for (const r of runs) {
    if (e1RegionalMoneysForm(r, minDistinctLeaders)) e1++;
    if (convergence(r) !== null) converged++;
    if (e2RegionsMerge(r)) e2++;
    const e3 = e3PortabilityDecidesMerge(r, lowPortId, highPortId);
    if (e3 !== null) { e3cond++; if (e3) e3hits++; }
    // Regional definedness (thinness read): fraction of (region,round) cells with a defined leader.
    let cells = 0;
    let defined = 0;
    for (const t of r.telemetry) for (const l of t.regionLeaders) { cells++; if (l !== null) defined++; }
    defSum += cells > 0 ? defined / cells : 0;
  }
  return {
    e1FormRate: n ? e1 / n : NaN,
    e2MergeRate: n ? e2 / n : NaN,
    convergedRate: n ? converged / n : NaN,
    e3DecidesRate: e3cond ? e3hits / e3cond : NaN,
    e3ConditioningRuns: e3cond,
    regionalDefinedRate: n ? defSum / n : NaN,
  };
}
