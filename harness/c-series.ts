/**
 * C-series per-dimension statistics (criteria v2.4 relocation; D-059/060/061/062).
 *
 * D-059 corrected A7's universal-monotonic over-claim: the win-rate statistic
 * A(g) (§9.1) is faithful only to DESIRABILITY (the demand determinant Menger
 * names as initiating), so only C1 keeps the A(g) round bar. Each
 * friction-reducing property is graded on its OWN honest dimension, never on
 * A(g) — encoding "this property matters less" as "it clears a lower
 * acceptance-share bar" is the per-threshold error D-059 forbids:
 *
 *   C3 durability      -> held-and-re-traded PERSISTENCE (D-061)
 *   C4 divisibility    -> per-good CIRCULATION + a divisibility-refusal hook (D-060)
 *   C5 portability     -> regional reach / E3 (D-060; the A(g)-ordering pass dropped)
 *   C2 recognizability -> DEMOTED to a narrated demonstration, no graded bar (D-062)
 *   C1 desirability    -> unchanged: A(g) win-rate, the metric A(g) measures honestly
 *
 * Every statistic here reads ONLY the witnessed event stream (PRODUCE, TRADE,
 * REFUSAL with its reason set, SPOIL_DESTROY, FAKE_REVEAL, CONSUME) — the
 * A2-clean channel (spec §2.2): no instance ids, no emitted age, no holdings
 * view (the stock/holdings churn confound L-21/§9.1 forbids). The acceptance
 * BARS — pass-rate fraction and visible-margin floor — are TBD, filled by the C0
 * campaign under a registered D-057-successor entry (H6). This module fixes the
 * STATISTIC and the predicate SHAPE; it does not commit a threshold.
 *
 * Derivability was settled by the Phase 1 spike (D-061 gate): the persistence
 * statistic separates durable from perishable from existing engine output, and
 * per-holder holding spells reconstruct from the stream with zero mismatches —
 * so no per-instance holding-duration counter (and no re-pin) is required.
 */

import type { EngineEvent, RunResult } from "../engines/emergence/types.ts";

/**
 * Per-good event aggregates for the focal trio, tallied from the witnessed event
 * stream of one run. These are the raw inputs every C-series dimension statistic
 * is built from — each is a count of a witnessed event type involving the good,
 * never a holdings level or a derived property score.
 */
export interface FocalEventCounts {
  /** PRODUCE events for the good (entries into the world; the per-unit denominator). */
  produced: number;
  /** TRADE events the good was a side of (its circulation / changing-hands count). */
  tradeMoves: number;
  /** SPOIL_DESTROY events for the good that were real rot (not a fake disposal). */
  spoilDestroys: number;
  /** REFUSAL events offering the good that failed the §6.2 condition gate (`stale`). */
  staleRefusals: number;
  /** REFUSAL events offering the good that failed the §6.2 divisibility table. */
  divisibilityRefusals: number;
  /** CONSUME events for the good (a satisfied want — the good left as itself). */
  consumed: number;
  /** FAKE_REVEAL events for the good (the recognizability footprint; narration only post-D-062). */
  fakeReveals: number;
}

function emptyCounts(): FocalEventCounts {
  return {
    produced: 0,
    tradeMoves: 0,
    spoilDestroys: 0,
    staleRefusals: 0,
    divisibilityRefusals: 0,
    consumed: 0,
    fakeReveals: 0,
  };
}

/** Tally per-good focal event aggregates from a run's event stream. */
export function focalEventCounts(
  events: readonly EngineEvent[],
  focalIds: readonly number[],
): Record<number, FocalEventCounts> {
  const counts: Record<number, FocalEventCounts> = {};
  for (const g of focalIds) counts[g] = emptyCounts();
  const bump = (g: number, k: keyof FocalEventCounts) => {
    const c = counts[g];
    if (c) c[k] += 1;
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
        if (e.reasons.includes("divisibility")) bump(e.offeredGood, "divisibilityRefusals");
        break;
      default:
        break;
    }
  }
  return counts;
}

// --- C3: durability -> held-and-re-traded persistence (D-061) ---------------

/**
 * Persistence of a good (C3): re-trades as a fraction of all
 * disposition-relevant events — a unit re-spent counts up, a unit lost to
 * spoilage or vetoed `stale` counts against. A never-spoils good that keeps
 * changing hands approaches 1; a perishable good, whose units rot
 * (`SPOIL_DESTROY`) and are refused once `stale` (§6.2), sits well below it.
 * This is the "ability to wait" — set a unit aside across rounds and re-spend it
 * — NOT a holdings level (which is the churn confound D-061 forbids). NO_EVIDENCE
 * (null) when the good had no disposition-relevant activity at all.
 */
export function persistence(c: FocalEventCounts): number | null {
  const disposition = c.tradeMoves + c.spoilDestroys + c.staleRefusals;
  return disposition > 0 ? c.tradeMoves / disposition : null;
}

/**
 * Survival of a good (C3 companion): the fraction of produced units NOT
 * destroyed by rot. A never-spoils good is 1; a perishable good drops with every
 * `SPOIL_DESTROY`. Reported alongside persistence as the spoilage-only view.
 */
export function survival(c: FocalEventCounts): number | null {
  return c.produced > 0 ? 1 - c.spoilDestroys / c.produced : null;
}

// --- C4: divisibility -> circulation + change-making refusal (D-060) --------

/**
 * Circulation of a good (C4): trade-moves per produced unit — how many times, on
 * average, a unit of the good changes hands. The teaching claim relocates from
 * "the divisible good wins" (which A(g) freezes on) to "the divisible good
 * CIRCULATES while the indivisible good stalls on change-making" (D-060): a fine
 * good clears the §6.2 size table against anything; a whole/indivisible good
 * fails it and stops moving. NO_EVIDENCE (null) when nothing of the good was
 * produced.
 */
export function circulation(c: FocalEventCounts): number | null {
  return c.produced > 0 ? c.tradeMoves / c.produced : null;
}

/**
 * Divisibility-refusal rate (C4 legibility hook, §6.2): change-making collapses
 * per produced unit — REFUSALs offering the good that failed the size table. The
 * indivisible (whole) good accrues these as the offered side; the fine good
 * never does. This is the visible "watching a cow trade collapse over
 * change-making" signal that makes the circulation gap legible, not a second
 * grading metric. NO_EVIDENCE (null) when nothing of the good was produced.
 */
export function divisibilityRefusalRate(c: FocalEventCounts): number | null {
  return c.produced > 0 ? c.divisibilityRefusals / c.produced : null;
}

// --- Generic per-dimension predicates (bar/margin are TBD, register-gated) ---

/** A per-good statistic, by good id; null = NO_EVIDENCE for that good this run. */
export type GoodStat = Record<number, number | null>;

/** Build a per-good statistic over the focal trio from a stat function. */
export function statByGood(
  counts: Record<number, FocalEventCounts>,
  fn: (c: FocalEventCounts) => number | null,
): GoodStat {
  const out: GoodStat = {};
  for (const [g, c] of Object.entries(counts)) out[Number(g)] = fn(c);
  return out;
}

/**
 * Predict-then-reveal ordering (C3/C4 round shape): the favored good (best level,
 * `highId`) exceeds the worst (`lowId`) by at least `margin`, with the mid good
 * in between — the full ordering high > mid > low. Returns null when any of the
 * three is NO_EVIDENCE this run (the run cannot speak to the ordering), so the
 * caller can grade over the defined runs and report the defined rate separately.
 */
export function orderedByMargin(
  stat: GoodStat,
  lowId: number,
  midId: number,
  highId: number,
  margin: number,
): boolean | null {
  const lo = stat[lowId];
  const md = stat[midId];
  const hi = stat[highId];
  if (lo == null || md == null || hi == null) return null;
  return hi > md && md > lo && hi - lo >= margin;
}

/**
 * Favored-vs-worst separation (the simpler round signal): the favored good
 * exceeds the worst by at least `margin`, ignoring the mid good. Null when either
 * endpoint is NO_EVIDENCE this run.
 */
export function separatedByMargin(
  stat: GoodStat,
  lowId: number,
  highId: number,
  margin: number,
): boolean | null {
  const lo = stat[lowId];
  const hi = stat[highId];
  if (lo == null || hi == null) return null;
  return hi - lo >= margin;
}

// --- C5: portability -> regional reach / E3 trace (D-060) -------------------

/**
 * Final per-region leaders of a run (scaled mode). The C5 grade relocates off the
 * dropped acceptance-share ordering onto the REGIONAL TRACE (D-060): a
 * low-portability good stays confined to its supply region while a high-
 * portability good reaches across — the E3 "portability decides the merge"
 * evidence. The full scaled-mode C5 grading is built with its own scaled-geometry
 * module (D-057(c)/(f)); this exposes the regional-leader trace the check reads.
 * Outside scaled mode `regionLeaders` is a single-element [global leader].
 */
export function finalRegionalLeaders(r: RunResult): readonly (number | null)[] {
  const last = r.telemetry[r.telemetry.length - 1];
  return last ? last.regionLeaders : [];
}

/**
 * Whether a good ever led OUTSIDE the given home region across the run — the
 * spatial-reach signal C5 grades. A low-portability good confined to its region
 * never does; a high-portability good does. Reads the per-round regional-leader
 * telemetry only.
 */
export function ledOutsideRegion(r: RunResult, goodId: number, homeRegion: number): boolean {
  for (const t of r.telemetry) {
    for (let region = 0; region < t.regionLeaders.length; region++) {
      if (region !== homeRegion && t.regionLeaders[region] === goodId) return true;
    }
  }
  return false;
}
