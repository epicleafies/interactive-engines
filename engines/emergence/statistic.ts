/**
 * Statistics, detection, regions, and telemetry (engine spec §9) — step 7.
 *
 * The one statistic A(g) (§9.1) is the recency-weighted positive fraction over
 * the UNION of distinct events involving g within the last WINDOW_ROUNDS rounds
 * — each event counted ONCE globally, never per witness (it is not any agent's
 * tally). Weights decay by the same per-round DECAY_FACTOR as the scores, so an
 * in-window event still carries age-decayed weight, not flat. With zero in-window
 * events A(g) is the explicit value NO_EVIDENCE. The seed prior and BURN_WEIGHT
 * never enter A(g) — they are per-agent, not market facts.
 *
 * The same statistic feeds the learner's chart, the dominance detector, and the
 * regional views. Region-scoped A(g) restricts to region-attributed events; a
 * cross-border trade is attributed to BOTH parties' regions, so regional event
 * sums legitimately exceed the global count (§1) — specified, not a defect.
 *
 * Windowing here is the hard WINDOW_ROUNDS window (D-021 confines per-agent
 * scores to pure decay, but A(g), the §6.1 refusal memory, the D7 trade floor,
 * and B13 all use this discrete in-window event set).
 */

import { regionOf } from "./ring.ts";
import {
  NO_EVIDENCE,
  type AcceptanceShare,
  type EngineEvent,
  type FlowCounts,
  type RoundTelemetry,
} from "./types.ts";
import type { EngineStateInternal, GoodStatState } from "./state.ts";

// --- Rolling buckets -----------------------------------------------------

function ensureBucket(gs: GoodStatState, idx: number, round: number): void {
  if (gs.bucketRound[idx] !== round) {
    gs.posBucket[idx] = 0;
    gs.totBucket[idx] = 0;
    gs.tradeBucket[idx] = 0;
    gs.bucketRound[idx] = round;
  }
}

function addToStat(gs: GoodStatState, round: number, window: number, dPos: number, dTot: number, dTrade: number): void {
  const idx = round % window;
  ensureBucket(gs, idx, round);
  gs.posBucket[idx] = gs.posBucket[idx]! + dPos;
  gs.totBucket[idx] = gs.totBucket[idx]! + dTot;
  gs.tradeBucket[idx] = gs.tradeBucket[idx]! + dTrade;
}

/** A(g): age-decayed positive fraction over the last `window` rounds, or NO_EVIDENCE. */
export function computeA(gs: GoodStatState, round: number, window: number, decay: number): AcceptanceShare {
  let dPos = 0;
  let dTot = 0;
  let weight = 1;
  for (let age = 0; age < window; age++) {
    const r = round - age;
    if (r < 0) break;
    const idx = ((r % window) + window) % window;
    if (gs.bucketRound[idx] === r) {
      dPos += gs.posBucket[idx]! * weight;
      dTot += gs.totBucket[idx]! * weight;
    }
    weight *= decay;
  }
  return dTot > 0 ? dPos / dTot : NO_EVIDENCE;
}

/** In-window TRADE-event count involving g (D7 floor input; NOT decayed). */
export function windowedTrades(gs: GoodStatState, round: number, window: number): number {
  let trades = 0;
  for (let age = 0; age < window; age++) {
    const r = round - age;
    if (r < 0) break;
    const idx = ((r % window) + window) % window;
    if (gs.bucketRound[idx] === r) trades += gs.tradeBucket[idx]!;
  }
  return trades;
}

/** Write this round's distinct events into the global and region buckets. */
export function writeBuckets(state: EngineStateInternal, round: number, roundEvents: readonly EngineEvent[]): void {
  const window = state.config.constants.WINDOW_ROUNDS;
  const n = state.agents.length;
  const rc = state.regionCount;

  const global = (g: number, dPos: number, dTot: number, dTrade: number): void =>
    addToStat(state.goodStats[g]!, round, window, dPos, dTot, dTrade);
  const region = (pos: number, g: number, dPos: number, dTot: number, dTrade: number): void => {
    if (rc <= 1) return;
    addToStat(state.regionGoodStats[regionOf(pos, n, rc)]![g]!, round, window, dPos, dTot, dTrade);
  };
  // Attribute to each DISTINCT region among the participating positions.
  const regions = (positions: readonly number[], g: number, dPos: number, dTot: number, dTrade: number): void => {
    if (rc <= 1) return;
    const seen = new Set<number>();
    for (const pos of positions) {
      const reg = regionOf(pos, n, rc);
      if (seen.has(reg)) continue;
      seen.add(reg);
      addToStat(state.regionGoodStats[reg]![g]!, round, window, dPos, dTot, dTrade);
    }
  };

  for (const e of roundEvents) {
    switch (e.type) {
      case "TRADE": {
        const parties = [e.proposer, e.partner];
        // Positive evidence and a trade event for BOTH traded goods, in both parties' regions.
        global(e.goodFromProposer, 1, 1, 1);
        global(e.goodFromPartner, 1, 1, 1);
        regions(parties, e.goodFromProposer, 1, 1, 1);
        regions(parties, e.goodFromPartner, 1, 1, 1);
        break;
      }
      case "REFUSAL":
        global(e.offeredGood, 0, 1, 0);
        regions([e.proposer, e.partner], e.offeredGood, 0, 1, 0);
        break;
      case "FAKE_REVEAL":
      case "SPOIL_DESTROY":
        global(e.good, 0, 1, 0);
        region(e.agent, e.good, 0, 1, 0);
        break;
      default:
        break; // non-tally events do not enter A(g)
    }
  }
}

// --- Leadership ----------------------------------------------------------

/** The strictly-greatest-defined good, or null when no good or a tie holds the max. */
function strictLeader(a: readonly AcceptanceShare[]): number | null {
  let maxA: number | null = null;
  for (const v of a) if (v !== NO_EVIDENCE && (maxA === null || v > maxA)) maxA = v;
  if (maxA === null) return null;
  let leader = -1;
  let count = 0;
  for (let g = 0; g < a.length; g++) {
    if (a[g] !== NO_EVIDENCE && a[g] === maxA) {
      count++;
      leader = g;
    }
  }
  return count === 1 ? leader : null;
}

// --- Step 7 --------------------------------------------------------------

export function stepStatistics(
  state: EngineStateInternal,
  round: number,
  roundEvents: readonly EngineEvent[],
): void {
  const c = state.config.constants;
  const window = c.WINDOW_ROUNDS;
  const decay = c.DECAY_FACTOR;
  const n = state.agents.length;

  writeBuckets(state, round, roundEvents);

  // Global A(g) for every good; set each good's first-defined value once (never reset).
  const a: AcceptanceShare[] = [];
  for (let g = 0; g < state.goodCount; g++) {
    const av = computeA(state.goodStats[g]!, round, window, decay);
    a.push(av);
    if (av !== NO_EVIDENCE && state.goodStats[g]!.firstDefinedA === null) {
      state.goodStats[g]!.firstDefinedA = av;
    }
  }

  // Dominance detector: the four clauses must hold JOINTLY on DOM_SUSTAIN
  // consecutive rounds. DOMINANCE fires on the rising edge.
  for (let g = 0; g < state.goodCount; g++) {
    const gs = state.goodStats[g]!;
    const av = a[g]!;
    const c1 = av !== NO_EVIDENCE && av >= c.DOM_THRESHOLD;
    const c3 = windowedTrades(gs, round, window) >= c.DOM_MIN_TRADE_SHARE * n;
    const fd = gs.firstDefinedA;
    const c4 = av !== NO_EVIDENCE && fd !== null && av - fd >= c.DOM_RISE_MIN;

    let allHold = false;
    if (c1 && c3 && c4 && av !== NO_EVIDENCE) {
      // Gap clause, evaluated only when the others hold. Runner-up = highest
      // defined A among the other goods.
      let runnerUp: number | null = null;
      let definedOthers = 0;
      for (let h = 0; h < state.goodCount; h++) {
        if (h === g) continue;
        const ah = a[h]!;
        if (ah !== NO_EVIDENCE) {
          definedOthers++;
          if (runnerUp === null || ah > runnerUp) runnerUp = ah;
        }
      }
      // D-029: when no other good has a defined A(g) there is no runner-up, so
      // the gap clause is unsatisfiable and DOMINANT(g) is false — a DEFINED
      // verdict, not an error. Dominance is a comparative claim; with no
      // comparator there is no verdict. (Reachable only via a sole-defined good,
      // which carries only negative evidence and already fails the threshold and
      // trade-floor clauses; the defined false honors G6 in every state.)
      allHold = definedOthers > 0 && av - runnerUp! >= c.DOM_GAP;
    }

    gs.sustainCount = allHold ? gs.sustainCount + 1 : 0;
    const dominantNow = gs.sustainCount >= c.DOM_SUSTAIN;
    if (dominantNow && !gs.dominant) {
      state.events.push({ type: "DOMINANCE", round, good: g });
      if (state.dominantGood === null) state.dominantGood = g;
    }
    gs.dominant = dominantNow;
  }

  // Global leadership (weak notion): strict-max defined good; ties retain incumbent.
  const leader = strictLeader(a);
  if (leader !== null && leader !== state.leader) {
    state.events.push({ type: "LEAD_CHANGE", round, from: state.leader, to: leader });
    state.leader = leader;
  }

  // Regional leadership and merge (scaled mode only).
  if (state.regionCount > 1) {
    const regionA: AcceptanceShare[][] = [];
    for (let r = 0; r < state.regionCount; r++) {
      const ra: AcceptanceShare[] = [];
      for (let g = 0; g < state.goodCount; g++) ra.push(computeA(state.regionGoodStats[r]![g]!, round, window, decay));
      regionA.push(ra);
      const rl = strictLeader(ra);
      if (rl !== null && rl !== state.regionLeaders[r]) {
        state.events.push({ type: "REGION_LEADER", round, region: r, good: rl });
        state.regionLeaders[r] = rl;
      }
    }
    // REGIONS_MERGED on the rising edge of all regional leaders aligning.
    const first = state.regionLeaders[0] ?? null;
    const aligned = first !== null && state.regionLeaders.every((l) => l === first);
    if (aligned && first !== null && !state.regionsAligned) {
      state.events.push({ type: "REGIONS_MERGED", round, good: first });
    }
    state.regionsAligned = aligned;
  }

  // Filler promotion: a filler is promoted iff strictly fewer than two goods have
  // a strictly greater defined A(g). Permanent.
  for (let g = 0; g < state.goodCount; g++) {
    const gs = state.goodStats[g]!;
    if (!state.config.goods[g]!.isFiller || gs.promoted) continue;
    const af = a[g]!;
    if (af === NO_EVIDENCE) continue;
    let greater = 0;
    for (let h = 0; h < state.goodCount; h++) {
      if (h === g) continue;
      const ah = a[h]!;
      if (ah !== NO_EVIDENCE && ah > af) greater++;
    }
    if (greater < 2) {
      gs.promoted = true;
      state.promoted.add(g);
      state.events.push({ type: "FILLER_PROMOTED", round, good: g });
    }
  }

  // Cap reached without any dominance verdict (a first-class outcome).
  if (round >= c.ROUND_CAP && state.dominantGood === null && !state.reachedCap) {
    state.events.push({ type: "CAP_REACHED", round });
    state.reachedCap = true;
  }

  state.telemetry.push(buildTelemetry(state, round, roundEvents, a));
}

function buildTelemetry(
  state: EngineStateInternal,
  round: number,
  roundEvents: readonly EngineEvent[],
  a: readonly AcceptanceShare[],
): RoundTelemetry {
  const acceptanceShare: Record<number, AcceptanceShare> = {};
  for (let g = 0; g < state.goodCount; g++) acceptanceShare[g] = a[g]!;

  let produced = 0;
  let trades = 0;
  let consumed = 0;
  let spoiled = 0;
  let fake = 0;
  const refusalsByReasonSet: Record<string, number> = {};
  const composition: Record<string, number> = { TRADE: 0, REFUSAL: 0, FAKE_REVEAL: 0, SPOIL_DESTROY: 0 };

  for (const e of roundEvents) {
    switch (e.type) {
      case "PRODUCE":
        produced++;
        break;
      case "TRADE":
        trades++;
        composition.TRADE = composition.TRADE! + 1;
        break;
      case "CONSUME":
        consumed++;
        break;
      case "SPOIL_DESTROY":
        if (e.wasFake) fake++;
        else spoiled++;
        composition.SPOIL_DESTROY = composition.SPOIL_DESTROY! + 1;
        break;
      case "FAKE_REVEAL":
        fake++;
        composition.FAKE_REVEAL = composition.FAKE_REVEAL! + 1;
        break;
      case "REFUSAL": {
        composition.REFUSAL = composition.REFUSAL! + 1;
        const key = [...e.reasons].sort().join("+") || "none";
        refusalsByReasonSet[key] = (refusalsByReasonSet[key] ?? 0) + 1;
        break;
      }
      default:
        break;
    }
  }

  const flow: FlowCounts = { produced, tradeMoves: trades * 2, consumed, spoiled, fake };
  return {
    round,
    acceptanceShare,
    flow,
    leader: state.leader,
    regionLeaders: [...state.regionLeaders],
    refusalsByReasonSet,
    eventRecordComposition: composition,
  };
}
