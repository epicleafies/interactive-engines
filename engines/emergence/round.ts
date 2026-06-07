/**
 * The round (engine spec §5) — exact step order, everything round-denominated.
 *
 *   1. Fake reveals   — trade-acquired fakes surface the round after acquisition,
 *                       BEFORE aging, so a trade-acquired fake can never exit
 *                       masked as spoilage.
 *   2. Aging          — held instances age; fresh->stale emits SPOIL_STAGE; an
 *                       instance reaching its spoil tick is destroyed.
 *   3. Production      — agents empty for >= PROD_DELAY completed rounds are
 *                       re-endowed (the only entry channel).
 *   4. Trading        — (M3) holdings live, one completed trade per agent.
 *   5. Consumption    — an agent holding its want consumes it (or, if it is a
 *                       fake, the fraud surfaces on use); real consumption redraws.
 *   6. Tally update   — (M3) batch update from witnessed events.
 *   7. Statistics     — (M4) shares, detector, leadership, telemetry.
 *
 * This module implements steps 1, 2, 3, 5, and the end-of-round bookkeeping;
 * steps 4/6/7 are wired in M3/M4. Conservation (criteria B12) is maintained at
 * every entry and exit: the live count equals production minus all exits at all
 * times.
 */

import { stageOf } from "./durability.ts";
import { scheduleOf } from "./lookup.ts";
import { produceFor } from "./produce.ts";
import { wantDistribution } from "./setup.ts";
import { categorical } from "./rng.ts";
import { NONE } from "./types.ts";
import type { EngineStateInternal, InstanceState } from "./state.ts";

/** Remove an instance from an agent and charge its exit to a conservation channel. */
function exitInstance(
  state: EngineStateInternal,
  type: number,
  channel: "consumed" | "spoiled" | "fake",
): void {
  state.conservation[channel][type] = state.conservation[channel][type]! + 1;
  state.conservation.live[type] = state.conservation.live[type]! - 1;
}

/**
 * Step 1 — Fake reveals. A trade-acquired fake currently held that was acquired
 * in the previous round reveals (FAKE_REVEAL, context "trade"), is destroyed,
 * and leaves its holder empty-handed. Self-produced fakes do not reveal here;
 * they surface only on consumption or via spoilage.
 */
export function stepFakeReveals(state: EngineStateInternal, round: number): void {
  for (let pos = 0; pos < state.agents.length; pos++) {
    const a = state.agents[pos]!;
    const held = a.held;
    if (held === null || !held.isFake) continue;
    if (held.acquiredByTrade && held.acquiredRound === round - 1) {
      state.events.push({
        type: "FAKE_REVEAL",
        round,
        agent: a.position,
        good: held.type,
        context: "trade",
        acquiredByTrade: true,
      });
      exitInstance(state, held.type, "fake");
      a.held = null;
    }
  }
}

/**
 * Step 2 — Aging. Each held instance ages by one tick. A fresh->stale crossing
 * emits SPOIL_STAGE (stream-only). An instance reaching its destroy tick emits
 * SPOIL_DESTROY and is destroyed; a fake destroyed here still exits via the fake
 * channel (with the wasFake tag), because observers saw rot, not fraud.
 */
export function stepAging(state: EngineStateInternal, round: number): void {
  for (let pos = 0; pos < state.agents.length; pos++) {
    const a = state.agents[pos]!;
    const held = a.held;
    if (held === null) continue;
    const schedule = scheduleOf(state.config, held.type);
    const oldStage = stageOf(held.age, schedule);
    held.age += 1;
    const newStage = stageOf(held.age, schedule);

    if (newStage === "destroyed") {
      state.events.push({
        type: "SPOIL_DESTROY",
        round,
        agent: a.position,
        good: held.type,
        wasFake: held.isFake,
        acquiredByTrade: held.acquiredByTrade,
      });
      // An isFake instance always exits via the fake channel, regardless of the
      // exit event type (engine spec §8).
      exitInstance(state, held.type, held.isFake ? "fake" : "spoiled");
      a.held = null;
    } else if (oldStage === "fresh" && newStage === "stale") {
      state.events.push({ type: "SPOIL_STAGE", round, agent: a.position, good: held.type });
    }
  }
}

/**
 * Step 3 — Production. Every agent empty-handed for at least PROD_DELAY completed
 * rounds is re-endowed, in ring-position order (which fixes the weighted policy's
 * draw order). PROD_DELAY = 0 means refill at the first step 3 after becoming empty.
 */
export function stepProduction(state: EngineStateInternal, round: number): void {
  const delay = state.config.constants.PROD_DELAY;
  for (let pos = 0; pos < state.agents.length; pos++) {
    const a = state.agents[pos]!;
    if (a.held === null && a.emptyRounds >= delay) {
      produceFor(state, a, round);
    }
  }
}

/**
 * Step 5 — Consumption. An agent holding an instance of its want consumes it. If
 * the instance is a fake, the fraud surfaces on use: FAKE_REVEAL (context
 * "consume"), the want is NOT satisfied, and there is no redraw. Real consumption
 * emits CONSUME and redraws the want (excluding the homeGood), in ring-position
 * order of consuming agents. Under the A1 ablation the want persists instead of
 * redrawing (and consumes no draw).
 */
export function stepConsumption(state: EngineStateInternal, round: number): void {
  const isA1 = state.config.ablation.kind === "A1";
  for (let pos = 0; pos < state.agents.length; pos++) {
    const a = state.agents[pos]!;
    const held: InstanceState | null = a.held;
    if (held === null || a.want === NONE || held.type !== a.want) continue;

    if (held.isFake) {
      state.events.push({
        type: "FAKE_REVEAL",
        round,
        agent: a.position,
        good: held.type,
        context: "consume",
        acquiredByTrade: held.acquiredByTrade,
      });
      exitInstance(state, held.type, "fake");
      a.held = null;
      // want not satisfied, no redraw
    } else {
      state.events.push({ type: "CONSUME", round, agent: a.position, good: held.type });
      exitInstance(state, held.type, "consumed");
      a.held = null;
      if (!isA1) {
        const dist = wantDistribution(state.config, a.homeGood);
        a.want = dist === null ? NONE : categorical(state.rng, dist);
      }
    }
  }
}

/**
 * End-of-round bookkeeping: an agent empty at the end of a round accrues one
 * toward its PROD_DELAY count (R-24). Holding agents are reset to zero when they
 * receive a good (in produceFor / on trade acquisition).
 */
export function stepEndOfRound(state: EngineStateInternal): void {
  for (const a of state.agents) {
    if (a.held === null) a.emptyRounds += 1;
  }
}

/**
 * Run one full round. Steps 4 (trading), 6 (tally update), and 7 (statistics)
 * are wired in M3/M4; until then a round advances mechanics without trade.
 */
export function runRound(state: EngineStateInternal): void {
  state.round += 1;
  const round = state.round;
  stepFakeReveals(state, round); // 1
  stepAging(state, round); // 2
  stepProduction(state, round); // 3
  // step 4 (trading): M3
  stepConsumption(state, round); // 5
  // step 6 (tally update): M3
  // step 7 (statistics/detection/telemetry): M4
  stepEndOfRound(state);
}
