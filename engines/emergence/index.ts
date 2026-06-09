/**
 * Money Emergence Simulation — reference engine entry point (build-order step 2).
 *
 * `run(config, seed)` is the engine's single public surface: a pure state machine
 * that validates the configuration, runs the setup tape, advances the round loop
 * to ROUND_CAP, and returns the full replayable output — the ordered event
 * stream, per-round telemetry, the final agents, and the run record. It is
 * platform-pure (no DOM, Node, host APIs, Date, or Math.random; only deterministic
 * arithmetic), so the same {config, seed} replays bit-for-bit under V8 and Hermes.
 *
 * The four fixed-seed divergence points the first build sessions surfaced are all
 * ruled in the decisions register and implemented here: score windowing (D-021),
 * the RNG tape and seed self-exclusion (D-022), the FIRST_BRIDGE_ACCEPT predicate
 * (D-028), and the no-runner-up detector verdict (D-029).
 */

import type { Agent, Config, InitialTopology, Instance, RunFn } from "./types.ts";
import { validateConfig, runSetup } from "./setup.ts";
import { createState, type AgentState, type InstanceState } from "./state.ts";
import { runRound } from "./round.ts";
import { reachOf } from "./lookup.ts";
import { regionOf } from "./ring.ts";
import { makeRunRecord } from "../../harness/replay.ts";

function freezeInstance(i: InstanceState | null): Instance | null {
  if (i === null) return null;
  return { type: i.type, age: i.age, isFake: i.isFake, acquiredByTrade: i.acquiredByTrade };
}

function freezeAgent(a: AgentState): Agent {
  return { position: a.position, homeGood: a.homeGood, held: freezeInstance(a.held), want: a.want };
}

/**
 * Resolve the setup topology a consumer renders from (D-064): each good's reach
 * and each trader's region, computed through the engine's OWN resolvers
 * (`reachOf`, `regionOf`) so the resolution is surfaced, not duplicated (D-053).
 * `regionCount` is the engine's resolved region count (1 outside scaled mode), so
 * the single-region case falls out of `regionOf` with no special-casing: with
 * count 1 every position maps to arc 0. Pure in {config, positions} — no draws,
 * no run state — which is why the block carries no entropy and stays out of the
 * pinned serialization.
 */
function resolveInitialTopology(config: Config, regionCount: number): InitialTopology {
  const reachByGood = config.goods.map((g) => reachOf(config, g.id));
  const regionByTrader: number[] = [];
  for (let pos = 0; pos < config.ringSize; pos++) {
    regionByTrader.push(regionOf(pos, config.ringSize, regionCount));
  }
  return { reachByGood, regionByTrader, regionsPartition: regionCount > 1 };
}

/**
 * Run the engine for `config` and `seed`. Throws only on an invalid configuration
 * (rejected at load, never silently normalized); a valid configuration always
 * runs to its round cap and returns a defined result.
 */
export const run: RunFn = (config, seed) => {
  validateConfig(config);
  const state = createState(config, seed);
  runSetup(state);
  for (let r = 1; r <= config.constants.ROUND_CAP; r++) {
    runRound(state);
  }
  return {
    record: makeRunRecord(config, seed),
    events: state.events,
    telemetry: state.telemetry,
    finalAgents: state.agents.map(freezeAgent),
    reachedCap: state.reachedCap,
    initialTopology: resolveInitialTopology(config, state.regionCount),
  };
};

export * from "./types.ts";
export * from "./constants.ts";
