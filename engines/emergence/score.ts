/**
 * The acceptance tally (engine spec §7) — per-agent scores and the step-6
 * batch update.
 *
 * Each agent keeps, per good type, a positive accumulator and a total
 * accumulator. The score is
 *
 *     score_i(g) = (decayed positive weight + K * prior_i(g))
 *                / (decayed total weight    + K)
 *
 * The prior (a capped local want-share, §4.3) is a permanent additive term that
 * keeps the denominator >= K > 0, so every score is a defined finite number for
 * every agent, good, and round (criteria G6).
 *
 * D-021 fixed the windowing question: per-agent scores are PURE decay
 * accumulators — no hard window. Step 6 multiplies both accumulators by
 * DECAY_FACTOR (the only forgetting), then adds this round's witnessed events at
 * their §7.3 weights. WINDOW_ROUNDS governs only the discrete event-set
 * predicates elsewhere (the §6.1 refusal memory, A(g), the D7 floor, B13).
 *
 * Exactly four event types enter tallies, all witnessable by the parties and
 * every agent within W_r of either party (§7.1):
 *   - TRADE         positive evidence for BOTH traded goods
 *   - REFUSAL       negative evidence for the offered good
 *   - FAKE_REVEAL   negative evidence for the good type
 *   - SPOIL_DESTROY negative evidence for the good type
 * All weight 1.0, except the victim's own entry for a destroyed instance it had
 * acquired by trade, which weighs BURN_WEIGHT (§7.3).
 */

import { ringDistance } from "./ring.ts";
import { isA1 } from "./ablation.ts";
import type { AgentState, EngineStateInternal } from "./state.ts";
import type { EngineEvent } from "./types.ts";

/** The per-agent acceptance score for a good (the §6 decision input). */
export function scoreOf(agent: AgentState, g: number, k: number): number {
  return (agent.scorePos[g]! + k * agent.prior[g]!) / (agent.scoreTot[g]! + k);
}

/** Apply `fn` to every agent within W_r of any of the event's locus positions. */
function forWitnesses(
  state: EngineStateInternal,
  loci: readonly number[],
  radius: number,
  fn: (a: AgentState) => void,
): void {
  const n = state.agents.length;
  for (const a of state.agents) {
    for (const p of loci) {
      if (ringDistance(a.position, p, n) <= radius) {
        fn(a);
        break;
      }
    }
  }
}

function addPositive(a: AgentState, g: number, w: number): void {
  a.scorePos[g] = a.scorePos[g]! + w;
  a.scoreTot[g] = a.scoreTot[g]! + w;
}

function addNegative(a: AgentState, g: number, w: number): void {
  a.scoreTot[g] = a.scoreTot[g]! + w;
}

/**
 * Step 6 — batch tally update. First decays every accumulator once, then folds
 * in the events witnessed this round. Batch (rather than per-event) keeps the
 * round deterministic and order-free. Also records each witnessed REFUSAL into
 * the witnessing agent's refusal memory, which the §6.1 direct-priority
 * exclusion reads next round.
 *
 * `roundEvents` are the events emitted during this round (steps 1–5).
 */
export function tallyUpdate(
  state: EngineStateInternal,
  round: number,
  roundEvents: readonly EngineEvent[],
): void {
  const c = state.config.constants;
  const decay = c.DECAY_FACTOR;
  const burn = c.BURN_WEIGHT;
  const radius = c.WITNESS_RADIUS;

  // A1 freezes the acceptance tally at the seeded prior: no decay, no events fold
  // in, so every score stays equal to its prior. Trading still runs normally, so
  // the §6.1 refusal memory still records and prunes (below).
  const frozen = isA1(state.config);

  // 1. Decay every accumulator once (the only forgetting; D-021) — unless frozen.
  if (!frozen) {
    for (const a of state.agents) {
      for (let g = 0; g < state.goodCount; g++) {
        a.scorePos[g] = a.scorePos[g]! * decay;
        a.scoreTot[g] = a.scoreTot[g]! * decay;
      }
    }
  }

  // 2. Fold in this round's witnessed events (accumulator updates skipped when frozen;
  //    the refusal memory is recorded either way).
  for (const e of roundEvents) {
    switch (e.type) {
      case "TRADE":
        if (!frozen) {
          forWitnesses(state, [e.proposer, e.partner], radius, (a) => {
            addPositive(a, e.goodFromProposer, 1);
            addPositive(a, e.goodFromPartner, 1);
          });
        }
        break;
      case "REFUSAL":
        forWitnesses(state, [e.proposer, e.partner], radius, (a) => {
          if (!frozen) addNegative(a, e.offeredGood, 1);
          // §6.1 memory: the refuser is the partner; key on (refuser, offered good).
          a.witnessedRefusals.push({ refuser: e.partner, offeredGood: e.offeredGood, round });
        });
        break;
      case "FAKE_REVEAL":
      case "SPOIL_DESTROY":
        if (!frozen) {
          forWitnesses(state, [e.agent], radius, (a) => {
            // The victim's own entry burns heavier iff the lost instance was trade-acquired.
            const w = a.position === e.agent && e.acquiredByTrade ? burn : 1;
            addNegative(a, e.good, w);
          });
        }
        break;
      default:
        // PRODUCE, SPOIL_STAGE, CONSUME, DECISION_TRACE, and the §9 narration
        // events are not tally events and do not enter any score.
        break;
    }
  }

  // 3. Prune each agent's refusal memory to the rolling window (it governs the
  // §6.1 direct-priority exclusion, a discrete in-window event-set predicate).
  const window = c.WINDOW_ROUNDS;
  for (const a of state.agents) {
    if (a.witnessedRefusals.length > 0) {
      a.witnessedRefusals = a.witnessedRefusals.filter((r) => round - r.round < window);
    }
  }
}
