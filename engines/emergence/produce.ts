/**
 * Production policy (engine spec §8) — the scarcity hook, and the ONLY channel
 * by which goods enter the world (including the round-0 endowment, §4.1).
 *
 *   - `profession` (Week 1): a fresh instance of the agent's homeGood. The only
 *     draw is the fake Bernoulli on the new instance, so under this policy
 *     endowment consumes exactly one draw per agent (the spec's "endowment fake
 *     draws in ring-position order").
 *   - `weighted`: production type is drawn tilted by the registered scarcity
 *     production weights, so a low-scarcity good can appear in place of other
 *     production. Present and tested; exposed later.
 *
 * Conservation (criteria B12): every produced instance is charged to the
 * production channel and added to the live count for its type.
 */

import { bernoulli, categorical } from "./rng.ts";
import { fakeProbOf } from "./lookup.ts";
import { isA2 } from "./ablation.ts";
import type { AgentState, EngineStateInternal } from "./state.ts";

/**
 * Produce a fresh instance for `agent` at `round`, per the configured policy.
 * Sets the agent's held instance, resets its empty counter, emits PRODUCE, and
 * updates conservation. Draw order: (weighted only) a type draw first, then the
 * fake Bernoulli — both in the caller's iteration order over producing agents.
 */
export function produceFor(state: EngineStateInternal, agent: AgentState, round: number): void {
  const { config } = state;

  let type: number;
  // A2:scarcity disables the scarcity mechanic — production falls back to the
  // profession policy regardless of the configured weights.
  if (config.productionPolicy === "profession" || isA2(config, "scarcity")) {
    type = agent.homeGood;
  } else {
    // weighted: draw a type tilted by scarcity production weights over all goods.
    const weights = config.goods.map((g) => config.mapping.scarcityWeight[g.attributes.scarcity]);
    let sum = 0;
    for (const w of weights) sum += w;
    if (sum <= 0) throw new Error("weighted production policy has all-zero scarcity weights");
    const probs = weights.map((w) => w / sum);
    type = categorical(state.rng, probs);
  }

  // A2:recognizability disables fake creation — no instance is ever fake (and
  // the fake Bernoulli is not drawn), so the recognizability level has no effect.
  const isFake = isA2(config, "recognizability") ? false : bernoulli(state.rng, fakeProbOf(config, type));
  agent.held = { type, age: 0, isFake, acquiredByTrade: false, acquiredRound: null };
  agent.emptyRounds = 0;

  state.conservation.produced[type] = state.conservation.produced[type]! + 1;
  state.conservation.live[type] = state.conservation.live[type]! + 1;
  state.events.push({ type: "PRODUCE", round, agent: agent.position, good: type });
}
