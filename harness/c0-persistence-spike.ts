/**
 * PHASE 1 SPIKE (D-061 durability-reframe gate) — is the C3 "held-and-re-traded
 * persistence" statistic DERIVABLE from telemetry the engine ALREADY emits, or
 * does it need a per-instance holding-duration counter (Phase 3b)?
 *
 * EXPLICITLY DIAGNOSTIC: this is analysis, not a registered pass and not an
 * engine change. It commits no verdict, no bar, no C0 cell. It exists only to
 * settle the gate with evidence before any harness/engine code is written.
 *
 * D-061 defines C3's statistic as temporal-saleability — "can a unit be set
 * aside across rounds and re-spent via the bridge mechanic (§6.2) vs. vetoed
 * stale / destroyed by spoilage" — the ability-to-wait signal, immune to the
 * stock/holdings churn confound (§9.1/L-21). The candidate inputs (per the
 * brief / D-061) are all per-good event aggregates the stream already carries:
 *   - trade-moves           (TRADE involving g)            — re-circulation
 *   - spoil-destroys         (SPOIL_DESTROY good=g, !wasFake) — destroyed by rot
 *   - stale refusals         (REFUSAL offered=g, stale∈reasons) — vetoed stale
 *   - production / consume   (PRODUCE / CONSUME good=g)     — denominators
 *
 * The spike does two things over the registered C0 C3 (durability) configs:
 *   (A) Computes per-good survival-and-recirculation statistics from the EVENT
 *       STREAM ONLY, and measures the durable(honey,id2) vs perishable(fish,id0)
 *       separation — the contrast A(g) freezes on (existing C3.json: ~0.02 pass).
 *   (B) Reconstructs per-holder holding spells from the event stream alone (no
 *       instance ids, no emitted age) to show that even the *duration* reading
 *       ("set aside across rounds") is recoverable without an engine counter —
 *       with a hard consistency check (every release event must match the
 *       reconstructed held good; any mismatch ⇒ reconstruction is unsound).
 *
 * Determination rule:
 *   - separation present AND reconstruction consistent ⇒ DERIVABLE (engine
 *     unchanged; C3 becomes a harness check; Phase 3b does not exist).
 *   - otherwise ⇒ needs a per-instance counter (Phase 3b).
 *
 * Harness code: may use Node/console. The engine stays platform-pure.
 */

import type { Config, EngineEvent, LevelMapping, RunResult } from "../engines/emergence/types.ts";
import { run } from "../engines/emergence/index.ts";
import { deriveSeeds, DEFAULT_BATCH_SIZE } from "./batch.ts";
import {
  buildVillage,
  VILLAGE_BEATS,
  C0_MAPPING_VILLAGE,
  C0_CONSTANTS_VILLAGE,
  type VillageBeat,
} from "./c0.ts";

const C3_BEAT: VillageBeat = VILLAGE_BEATS.find((b) => b.id === "C3")!; // durability; ids 0=fish(2,2) 1=grain(8,4) 2=honey(never)
const SEEDS = deriveSeeds(20260608, DEFAULT_BATCH_SIZE); // functional sweep base (D-010); not outcome-shopped
const FOCAL = [0, 1, 2] as const; // worst→best durability

// --- (A) Per-good event aggregates, computed from the stream ONLY -----------

interface GoodAgg {
  produced: number;
  tradeMoves: number; // TRADE involving g (each side counted once)
  spoilDestroys: number; // SPOIL_DESTROY good=g, real rot (!wasFake)
  staleRefusals: number; // REFUSAL offered=g with stale∈reasons
  consumed: number;
  fakeReveals: number;
}

function zeroAgg(): GoodAgg {
  return { produced: 0, tradeMoves: 0, spoilDestroys: 0, staleRefusals: 0, consumed: 0, fakeReveals: 0 };
}

/** Tally per-good event aggregates for the focal goods from one run's stream. */
function aggregate(events: readonly EngineEvent[]): Record<number, GoodAgg> {
  const agg: Record<number, GoodAgg> = {};
  for (const g of FOCAL) agg[g] = zeroAgg();
  const bump = (g: number, k: keyof GoodAgg, by = 1) => {
    if (agg[g]) agg[g]![k] += by;
  };
  for (const e of events) {
    switch (e.type) {
      case "PRODUCE":
        bump(e.good, "produced");
        break;
      case "CONSUME":
        bump(e.good, "consumed");
        break;
      case "TRADE":
        bump(e.goodFromProposer, "tradeMoves");
        bump(e.goodFromPartner, "tradeMoves");
        break;
      case "SPOIL_DESTROY":
        if (!e.wasFake) bump(e.good, "spoilDestroys");
        break;
      case "FAKE_REVEAL":
        bump(e.good, "fakeReveals");
        break;
      case "REFUSAL":
        if (e.reasons.includes("stale")) bump(e.offeredGood, "staleRefusals");
        break;
      default:
        break;
    }
  }
  return agg;
}

/**
 * Candidate persistence statistics for good g (all from the aggregates above).
 * `null` = NO_EVIDENCE (denominator 0): the good had no qualifying activity.
 */
function persistenceStats(a: GoodAgg) {
  const disposition = a.tradeMoves + a.spoilDestroys + a.staleRefusals;
  return {
    // Headline: re-trades as a share of disposition-relevant events. [0,1].
    persistence: disposition > 0 ? a.tradeMoves / disposition : null,
    // Survival: fraction of produced units NOT destroyed by rot. [0,1].
    survival: a.produced > 0 ? 1 - a.spoilDestroys / a.produced : null,
    // Re-circulation: trade-moves per produced unit. ≥0.
    recircPerUnit: a.produced > 0 ? a.tradeMoves / a.produced : null,
    // Stale-veto rate: stale refusals per produced unit. ≥0.
    staleVetoPerUnit: a.produced > 0 ? a.staleRefusals / a.produced : null,
  };
}

// --- (B) Per-holder holding-spell reconstruction (stream only) --------------

interface SpellAgg {
  spells: number; // completed holding spells of good g
  totalRounds: number; // Σ (releaseRound − acquireRound)
  reTradedAfterHold: number; // spells released by TRADE with duration ≥ 1 (the literal "set aside then re-spent")
}

interface Recon {
  perGood: Record<number, SpellAgg>;
  releaseEvents: number;
  mismatches: number; // release event whose good ≠ reconstructed held good (must be 0)
}

/**
 * Replay the event stream per agent to recover holding spells WITHOUT instance
 * ids or emitted age. Each agent holds ≤1 instance (types.ts Agent.held), and
 * every acquisition (PRODUCE / TRADE-in) and release (TRADE-out / CONSUME /
 * SPOIL_DESTROY / FAKE_REVEAL) is an evented transition naming the agent and
 * good. Tracking "(agent → currently-held good, acquiredRound)" through the
 * stream therefore reconstructs every spell; the held good at each release must
 * equal the event's good or the reconstruction is unsound (counted as mismatch).
 */
function reconstruct(events: readonly EngineEvent[], ringSize: number): Recon {
  const heldGood: (number | null)[] = new Array(ringSize).fill(null);
  const acquiredAt: (number | null)[] = new Array(ringSize).fill(null);
  const perGood: Record<number, SpellAgg> = {};
  for (const g of FOCAL) perGood[g] = { spells: 0, totalRounds: 0, reTradedAfterHold: 0 };
  let releaseEvents = 0;
  let mismatches = 0;

  const acquire = (agent: number, good: number, round: number) => {
    heldGood[agent] = good;
    acquiredAt[agent] = round;
  };
  const release = (agent: number, good: number, round: number, viaTrade: boolean) => {
    releaseEvents++;
    const cur = heldGood[agent];
    const at = acquiredAt[agent];
    if (cur !== good) mismatches++; // reconstruction unsound for this transition
    if (typeof cur === "number" && typeof at === "number") {
      const s = perGood[cur];
      if (s) {
        const dur = round - at;
        s.spells++;
        s.totalRounds += dur;
        if (viaTrade && dur >= 1) s.reTradedAfterHold++;
      }
    }
    heldGood[agent] = null;
    acquiredAt[agent] = null;
  };

  for (const e of events) {
    switch (e.type) {
      case "PRODUCE":
        acquire(e.agent, e.good, e.round);
        break;
      case "TRADE":
        // proposer releases goodFromProposer, acquires goodFromPartner; partner mirrors. Order: release then acquire.
        release(e.proposer, e.goodFromProposer, e.round, true);
        release(e.partner, e.goodFromPartner, e.round, true);
        acquire(e.proposer, e.goodFromPartner, e.round);
        acquire(e.partner, e.goodFromProposer, e.round);
        break;
      case "CONSUME":
        release(e.agent, e.good, e.round, false);
        break;
      case "SPOIL_DESTROY":
      case "FAKE_REVEAL":
        release(e.agent, e.good, e.round, false);
        break;
      default:
        break; // SPOIL_STAGE keeps the instance; stats/narration events don't move holdings
    }
  }
  return { perGood, releaseEvents, mismatches };
}

// --- Regime cells -----------------------------------------------------------

const sharperSpoil = (m: LevelMapping): LevelMapping => ({
  ...m,
  // fast-spoil (2,2)→(1,1): destroyed at age 2 — a starker durability gap (cf. c0-probe WIDEN.C3).
  durabilitySchedule: [{ s1: 1, s2: 1, neverSpoils: false }, m.durabilitySchedule[1]!, m.durabilitySchedule[2]!],
});

interface Cell {
  readonly label: string;
  readonly cfg: Config;
}

function cells(): Cell[] {
  const M = C0_MAPPING_VILLAGE;
  const K = C0_CONSTANTS_VILLAGE;
  const out: Cell[] = [];
  // Registered frozen regime (8-good) and the few-good liquid regime (cf. c0-probe), N∈{12,16}.
  out.push({ label: "registered N=12 filler=5 (8-good, frozen)", cfg: buildVillage(C3_BEAT, 12, 5, M, K) });
  out.push({ label: "registered N=16 filler=5 (8-good)", cfg: buildVillage(C3_BEAT, 16, 5, M, K) });
  out.push({ label: "liquid    N=12 filler=1 (4-good)", cfg: buildVillage(C3_BEAT, 12, 1, M, K) });
  out.push({ label: "liquid    N=16 filler=1 (4-good)", cfg: buildVillage(C3_BEAT, 16, 1, M, K) });
  out.push({ label: "liquid    N=12 filler=1, sharper spoil (1,1)", cfg: buildVillage(C3_BEAT, 12, 1, sharperSpoil(M), K) });
  return out;
}

// --- Reporting --------------------------------------------------------------

const f3 = (x: number | null) => (x === null ? "  —  " : x.toFixed(3));
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const definedMean = (xs: (number | null)[]) => {
  const d = xs.filter((x): x is number => x !== null);
  return { mean: d.length ? mean(d) : NaN, definedRate: xs.length ? d.length / xs.length : 0 };
};

function finalA(r: RunResult, g: number): number | null {
  const last = r.telemetry[r.telemetry.length - 1]!;
  const v = last.acceptanceShare[g];
  return v === null || v === undefined ? null : v;
}

interface RunMetrics {
  persistence: Record<number, number | null>;
  survival: Record<number, number | null>;
  recirc: Record<number, number | null>;
  staleVeto: Record<number, number | null>;
  reTradedPerUnit: Record<number, number | null>;
  aShare: Record<number, number | null>;
  agg: Record<number, GoodAgg>;
  releaseEvents: number;
  mismatches: number;
}

function metricsFor(r: RunResult, ringSize: number): RunMetrics {
  const agg = aggregate(r.events);
  const recon = reconstruct(r.events, ringSize);
  const persistence: Record<number, number | null> = {};
  const survival: Record<number, number | null> = {};
  const recirc: Record<number, number | null> = {};
  const staleVeto: Record<number, number | null> = {};
  const reTradedPerUnit: Record<number, number | null> = {};
  const aShare: Record<number, number | null> = {};
  for (const g of FOCAL) {
    const s = persistenceStats(agg[g]!);
    persistence[g] = s.persistence;
    survival[g] = s.survival;
    recirc[g] = s.recircPerUnit;
    staleVeto[g] = s.staleVetoPerUnit;
    const prod = agg[g]!.produced;
    reTradedPerUnit[g] = prod > 0 ? recon.perGood[g]!.reTradedAfterHold / prod : null;
    aShare[g] = finalA(r, g);
  }
  return { persistence, survival, recirc, staleVeto, reTradedPerUnit, aShare, agg, releaseEvents: recon.releaseEvents, mismatches: recon.mismatches };
}

/** Pass rate over the batch for a per-run predicate, ignoring runs where it's undefined. */
function rateWhereDefined(rows: RunMetrics[], pred: (m: RunMetrics) => boolean | null): { rate: number; n: number } {
  let hits = 0;
  let n = 0;
  for (const m of rows) {
    const v = pred(m);
    if (v === null) continue;
    n++;
    if (v) hits++;
  }
  return { rate: n ? hits / n : NaN, n };
}

function reportCell(cell: Cell): void {
  const ringSize = cell.cfg.ringSize;
  const rows = SEEDS.map((s) => metricsFor(run(cell.cfg, s), ringSize));

  const totalReleases = rows.reduce((a, m) => a + m.releaseEvents, 0);
  const totalMismatch = rows.reduce((a, m) => a + m.mismatches, 0);

  console.log(`--- ${cell.label} ---`);
  console.log(`  reconstruction: ${totalReleases} release events across ${rows.length} runs, ${totalMismatch} mismatches ${totalMismatch === 0 ? "(SOUND — held good matched at every release)" : "(UNSOUND)"}`);

  // Per-good means (defined-only) for each statistic + A(g).
  const header = "    good        A(g)   persist  surviv  recirc  staleV  reTrade/unit  defined%";
  console.log(header);
  const names = ["fish(0,perish)", "grain(1,mid)", "honey(2,durable)"];
  for (const g of FOCAL) {
    const A = definedMean(rows.map((m) => m.aShare[g]!));
    const P = definedMean(rows.map((m) => m.persistence[g]!));
    const Sv = definedMean(rows.map((m) => m.survival[g]!));
    const Rc = definedMean(rows.map((m) => m.recirc[g]!));
    const St = definedMean(rows.map((m) => m.staleVeto[g]!));
    const Rt = definedMean(rows.map((m) => m.reTradedPerUnit[g]!));
    console.log(
      `    ${names[g]!.padEnd(16)} ${f3(A.mean)}  ${f3(P.mean)}   ${f3(Sv.mean)}   ${f3(Rc.mean)}   ${f3(St.mean)}   ${f3(Rt.mean).padStart(6)}       ${(P.definedRate * 100).toFixed(0)}%`,
    );
  }

  // Separation: durable(2) vs perishable(0), per-run, at candidate margins.
  const sep = (m: RunMetrics, stat: keyof RunMetrics, margin: number): boolean | null => {
    const hi = (m[stat] as Record<number, number | null>)[2];
    const lo = (m[stat] as Record<number, number | null>)[0];
    if (hi == null || lo == null) return null;
    return hi - lo >= margin;
  };
  const order = (m: RunMetrics, stat: keyof RunMetrics): boolean | null => {
    const s = m[stat] as Record<number, number | null>;
    const lo = s[0];
    const md = s[1];
    const hi = s[2];
    if (lo == null || md == null || hi == null) return null;
    return hi > md && md > lo;
  };

  console.log("    durable(2) vs perishable(0) separation — pass rate over the batch (bar % is TBD, C0-filled):");
  for (const stat of ["persistence", "survival", "recirc"] as const) {
    const m02 = [0.1, 0.2, 0.3].map((mg) => `≥${mg}:${f3(rateWhereDefined(rows, (m) => sep(m, stat, mg)).rate)}`).join("  ");
    const ord = rateWhereDefined(rows, (m) => order(m, stat));
    console.log(`      ${stat.padEnd(11)} margin[honey−fish] ${m02}   | full order 2>1>0: ${f3(ord.rate)} (n=${ord.n})`);
  }
  // A(g) contrast: the metric D-059/D-061 say freezes here.
  const aOrd = rateWhereDefined(rows, (m) => order(m, "aShare"));
  const aSep = rateWhereDefined(rows, (m) => sep(m, "aShare", 0.1));
  console.log(`      A(g)  [the frozen metric]  honey−fish ≥0.1: ${f3(aSep.rate)}   | full order 2>1>0: ${f3(aOrd.rate)} (n=${aOrd.n})`);
  console.log("");
}

console.log("PHASE 1 SPIKE — D-061 C3 persistence derivability. DIAGNOSTIC ONLY (no pass, no bar, no engine change).");
console.log(`C3 durability beat: ids 0=fish(spoils 2,2) 1=grain(8,4) 2=honey(never spoils); ${DEFAULT_BATCH_SIZE}-seed batches.`);
console.log("All persistence statistics computed from the EVENT STREAM ONLY (no instance ids, no emitted age).\n");
for (const cell of cells()) reportCell(cell);
