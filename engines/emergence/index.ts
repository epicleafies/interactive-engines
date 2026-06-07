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

import type { Agent, Instance, RunFn } from "./types.ts";
import { validateConfig, runSetup } from "./setup.ts";
import { createState, type AgentState, type InstanceState } from "./state.ts";
import { runRound } from "./round.ts";
import { makeRunRecord } from "../../harness/replay.ts";

function freezeInstance(i: InstanceState | null): Instance | null {
  if (i === null) return null;
  return { type: i.type, age: i.age, isFake: i.isFake, acquiredByTrade: i.acquiredByTrade };
}

function freezeAgent(a: AgentState): Agent {
  return { position: a.position, homeGood: a.homeGood, held: freezeInstance(a.held), want: a.want };
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
    dominantGood: state.dominantGood,
  };
};

export * from "./types.ts";
export * from "./constants.ts";
