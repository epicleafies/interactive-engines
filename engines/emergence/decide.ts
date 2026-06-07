/**
 * Decision rules and the trading step (engine spec §5.4, §6.1, §6.2).
 *
 * Agents act in fresh seeded-shuffled order, one proposal per acting turn.
 * Holdings are live and each agent completes at most one TRADE per round in any
 * role; an agent that has completed a trade neither acts nor accepts for the
 * rest of the round. Being party to a refusal carries no eligibility effect.
 *
 * Partner selection (§6.1), among A's reachable neighbours (mutual reach):
 *   1. Direct, refusal-aware: a neighbour holding A's want, excluding any
 *      neighbour T whom A has, in-window, witnessed refuse an offer of A's
 *      currently held good. Tie-break nearest, then lowest index.
 *   2. Tally bridge: offer A's good for the reachable good gX with the highest
 *      tally that clears tally(gA)+epsilon and whose targeted instance is fresh.
 *      Tie-break highest tally, then lowest type index, then nearest holder.
 *   If neither yields a partner, A passes (no event).
 *
 * Acceptance (§6.2) is the PARTNER's decision over three independent gates —
 * value test, condition gate, divisibility — and a refusal carries the full set
 * of failed gates as its reasons, with no precedence. Every acceptance
 * evaluation emits a DECISION_TRACE (D-023), whose listed inputs are sufficient
 * for an independent referee to reproduce the verdict (criteria A9).
 */

import { reachOf, scheduleOf, sizeClassOf } from "./lookup.ts";
import { ringDistance, reachEligible } from "./ring.ts";
import { stageOf } from "./durability.ts";
import { sizeCompatible } from "./divisibility.ts";
import { shuffleOrder } from "./rng.ts";
import { scoreOf } from "./score.ts";
import { isA2 } from "./ablation.ts";
import { NONE, type BridgeQualifier, type RefusalReason } from "./types.ts";
import type { AgentState, EngineStateInternal, InstanceState } from "./state.ts";

/** The partner's acceptance verdict over the three independent gates (§6.2). */
export interface AcceptanceVerdict {
  readonly accept: boolean;
  /** The accepter took a non-want (the bridge/tally clause carried it). */
  readonly viaBridge: boolean;
  readonly valueTestPass: boolean;
  readonly conditionPass: boolean;
  readonly divisibilityPass: boolean;
  /** Failed gates, in fixed order; the REFUSAL reason set when not accepting. */
  readonly reasons: RefusalReason[];
}

/**
 * The acceptance decision (§6.2): partner P, currently holding gP, evaluates the
 * `offered` instance (good gO). Pure over P's tallies, P's want, the two goods'
 * classes, and the offered instance's staleness — the exact inputs a
 * DECISION_TRACE lists, so an independent referee reproduces this verdict
 * (criteria A9).
 */
export function evaluateAcceptance(
  state: EngineStateInternal,
  partner: AgentState,
  offered: InstanceState,
): AcceptanceVerdict {
  const { config } = state;
  const k = config.constants.SEED_STRENGTH;
  const eps = config.constants.ACCEPT_MARGIN;
  const gO = offered.type;
  const gP = partner.held!.type;

  const offeredIsWant = gO === partner.want;
  const valueTestPass = offeredIsWant || scoreOf(partner, gO, k) > scoreOf(partner, gP, k) + eps;
  const offeredStale = stageOf(offered.age, scheduleOf(config, gO)) === "stale";
  const conditionPass = offeredIsWant || !offeredStale;
  // A2:divisibility disables the mechanic — the table always passes, so the divisibility level has no effect.
  const divisibilityPass = isA2(config, "divisibility") || sizeCompatible(sizeClassOf(config, gO), sizeClassOf(config, gP));

  const accept = valueTestPass && conditionPass && divisibilityPass;
  const reasons: RefusalReason[] = [];
  if (!valueTestPass) reasons.push("judgment");
  if (!conditionPass) reasons.push("stale");
  if (!divisibilityPass) reasons.push("divisibility");

  return { accept, viaBridge: !offeredIsWant, valueTestPass, conditionPass, divisibilityPass, reasons };
}

/** Step 4 — trading. */
export function stepTrading(state: EngineStateInternal, round: number): void {
  const n = state.agents.length;
  const order = shuffleOrder(state.rng, n); // fresh shuffle each round
  const completed = new Set<number>(); // positions locked by a completed trade

  for (const posA of order) {
    if (completed.has(posA)) continue; // already traded this round
    if (state.agents[posA]!.held === null) continue; // empty: nothing to give
    const posP = selectPartner(state, posA, completed, round);
    if (posP === null) continue; // A passes, no event
    resolveProposal(state, posA, posP, round, completed);
  }
}

interface Candidate {
  readonly pos: number;
  readonly good: number;
  readonly dist: number;
}

/** Whether T has, in-window, been witnessed by A refusing an offer of good `gA`. */
function refusalExcluded(a: AgentState, t: number, gA: number, round: number, window: number): boolean {
  for (const r of a.witnessedRefusals) {
    if (r.refuser === t && r.offeredGood === gA && round - r.round < window) return true;
  }
  return false;
}

/** Pick a partner for acting agent A per §6.1, or null if A passes. */
export function selectPartner(
  state: EngineStateInternal,
  posA: number,
  completed: ReadonlySet<number>,
  round: number,
): number | null {
  const { config } = state;
  const n = state.agents.length;
  const k = config.constants.SEED_STRENGTH;
  const eps = config.constants.ACCEPT_MARGIN;
  const window = config.constants.WINDOW_ROUNDS;

  const A = state.agents[posA]!;
  const gA = A.held!.type;
  const wA = A.want;
  const reachA = reachOf(config, gA);

  // Reachable, available neighbours (mutual reach depends on both held goods).
  // A2:portability disables the reach mechanic — every neighbour is reachable, so
  // the portability level has no effect.
  const reachUnrestricted = isA2(config, "portability");
  const cands: Candidate[] = [];
  for (let b = 0; b < n; b++) {
    if (b === posA || completed.has(b)) continue;
    const B = state.agents[b]!;
    if (B.held === null) continue;
    const gB = B.held.type;
    if (reachUnrestricted || reachEligible(posA, b, n, reachA, reachOf(config, gB))) {
      cands.push({ pos: b, good: gB, dist: ringDistance(posA, b, n) });
    }
  }

  // Priority 1 — direct, refusal-aware.
  if (wA !== NONE) {
    const direct = cands.filter((c) => c.good === wA && !refusalExcluded(A, c.pos, gA, round, window));
    if (direct.length > 0) {
      direct.sort((x, y) => x.dist - y.dist || x.pos - y.pos);
      return direct[0]!.pos;
    }
  }

  // Priority 2 — tally bridge.
  const scoreGA = scoreOf(A, gA, k);
  const bridge = cands.filter((c) => {
    const inst = state.agents[c.pos]!.held!;
    if (stageOf(inst.age, scheduleOf(config, c.good)) === "stale") return false; // proposer-side condition gate
    return scoreOf(A, c.good, k) > scoreGA + eps;
  });
  if (bridge.length === 0) return null;

  // Choose the good: highest tally, then lowest type index.
  let bestGood = -1;
  let bestScore = -Infinity;
  for (const c of bridge) {
    const s = scoreOf(A, c.good, k);
    if (s > bestScore || (s === bestScore && (bestGood === -1 || c.good < bestGood))) {
      bestScore = s;
      bestGood = c.good;
    }
  }
  // Among holders of that good: nearest, then lowest index.
  const holders = bridge.filter((c) => c.good === bestGood);
  holders.sort((x, y) => x.dist - y.dist || x.pos - y.pos);
  return holders[0]!.pos;
}

/** Evaluate the partner's acceptance (§6.2) and emit the trace + outcome events. */
function resolveProposal(
  state: EngineStateInternal,
  posA: number,
  posP: number,
  round: number,
  completed: Set<number>,
): void {
  const { config } = state;
  const k = config.constants.SEED_STRENGTH;
  const eps = config.constants.ACCEPT_MARGIN;

  const A = state.agents[posA]!;
  const P = state.agents[posP]!;
  const gA = A.held!.type; // offered good gO
  const gP = P.held!.type;

  const v = evaluateAcceptance(state, P, A.held!);

  state.events.push({
    type: "DECISION_TRACE",
    round,
    agent: posP,
    inputs: {
      offeredGood: gA,
      heldGood: gP,
      want: P.want,
      scoreOffered: scoreOf(P, gA, k),
      scoreHeld: scoreOf(P, gP, k),
      epsilon: eps,
      offeredIsWant: gA === P.want,
      offeredStale: stageOf(A.held!.age, scheduleOf(config, gA)) === "stale",
      sizeOffered: sizeClassOf(config, gA),
      sizeHeld: sizeClassOf(config, gP),
    },
    verdict: v.accept ? "accept" : "reject",
  });

  if (v.accept) {
    // Swap instances; both are now trade-acquired this round (age travels along).
    const instA = A.held!;
    const instP = P.held!;
    instA.acquiredByTrade = true;
    instA.acquiredRound = round;
    instP.acquiredByTrade = true;
    instP.acquiredRound = round;
    A.held = instP;
    P.held = instA;
    A.emptyRounds = 0;
    P.emptyRounds = 0;

    state.events.push({
      type: "TRADE",
      round,
      proposer: posA,
      partner: posP,
      goodFromProposer: gA,
      goodFromPartner: gP,
      viaBridge: v.viaBridge,
    });
    // FIRST_BRIDGE_ACCEPT (D-028): the first trade in which EITHER party acquires
    // a good that is not its current want. The accepter acquires gA; the proposer
    // acquires gP. Either acquiring a non-want is an intermediary acquisition.
    if (!state.firstBridgeDone) {
      const proposerQualifies = gP !== A.want; // proposer took gP as a bridge, not its want
      const accepterQualifies = gA !== P.want; // accepter took gA via the tally clause
      if (proposerQualifies || accepterQualifies) {
        const qualifiers: BridgeQualifier[] = [];
        if (proposerQualifies) {
          qualifiers.push({ party: posA, role: "proposer", acquiredGood: gP, qualification: "bridge-targeted acquisition" });
        }
        if (accepterQualifies) {
          qualifiers.push({ party: posP, role: "accepter", acquiredGood: gA, qualification: "tally-clause acceptance" });
        }
        state.events.push({ type: "FIRST_BRIDGE_ACCEPT", round, qualifiers });
        state.firstBridgeDone = true;
      }
    }
    completed.add(posA);
    completed.add(posP);
  } else {
    state.events.push({ type: "REFUSAL", round, proposer: posA, partner: posP, offeredGood: gA, reasons: v.reasons });
  }
}
