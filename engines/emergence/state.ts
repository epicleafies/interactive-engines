/**
 * Internal mutable engine state.
 *
 * The public contract (types.ts) is deliberately readonly — it is what the
 * engine HANDS OUT. This module is the engine's private working memory: mutable
 * mirrors the round loop updates in place, plus the accumulators and rolling
 * buffers the statistics need. Keeping the two separate means a consumer can
 * never reach into engine internals, and the engine never accidentally leaks a
 * live mutable reference into a RunResult.
 *
 * Platform-pure: plain data, no host APIs.
 */

import type { Rng } from "../../harness/prng.ts";
import { makeRng } from "../../harness/prng.ts";
import type {
  Config,
  EngineEvent,
  RoundTelemetry,
  WantTarget,
} from "./types.ts";
import { NONE } from "./types.ts";

/** A held good instance (mutable). Mirrors the readonly `Instance`. */
export interface InstanceState {
  type: number;
  age: number;
  isFake: boolean;
  /** Flips true the first time the instance moves in a trade; governs burn weighting. */
  acquiredByTrade: boolean;
  /** The round this instance was last acquired by trade, or null. Drives the reveal timing. */
  acquiredRound: number | null;
}

/** An agent (mutable). */
export interface AgentState {
  position: number;
  homeGood: number;
  held: InstanceState | null;
  want: WantTarget;
  /**
   * Completed rounds the agent has been continuously empty-handed. Reset to 0
   * on receiving a good; incremented at round end while empty. Re-endowment at
   * step 3 fires when held===null and this is >= PROD_DELAY (R-24).
   */
  emptyRounds: number;

  // --- Per-good tally state, indexed by good type id ---
  /** Permanent seeded prior S_i(g) (capped local want-share, excluding self). */
  prior: number[];
  /** Pure-decay accumulator: decayed positive-evidence weight (D-021). */
  scorePos: number[];
  /** Pure-decay accumulator: decayed total event weight (D-021). */
  scoreTot: number[];

  /**
   * Witnessed refusals within the rolling window, for the §6.1 direct-priority
   * exclusion. Each entry: a refuser and the offered good type, with the round
   * witnessed (pruned past WINDOW_ROUNDS).
   */
  witnessedRefusals: Array<{ refuser: number; offeredGood: number; round: number }>;
}

/**
 * Per-good rolling statistics state for A(g) and the D7 trade floor. Buckets are
 * a ring of length WINDOW_ROUNDS indexed by (round mod WINDOW_ROUNDS); a bucket
 * is zeroed when a new round first writes to it, so only the last WINDOW_ROUNDS
 * rounds of distinct events contribute.
 */
export interface GoodStatState {
  /** Distinct in-round positive-evidence weight for this good (A(g) numerator source). */
  posBucket: number[];
  /** Distinct in-round total event weight for this good (A(g) denominator source). */
  totBucket: number[];
  /** Distinct in-round TRADE-event count involving this good (D7 floor source). */
  tradeBucket: number[];
  /** The round each bucket currently holds, for ring freshness checks. */
  bucketRound: number[];
  /** First defined A(g) value seen in the run (for the D7 rise clause); null until defined. */
  firstDefinedA: number | null;
  /** Consecutive rounds the full dominance predicate has held (for DOM_SUSTAIN). */
  sustainCount: number;
  /** Whether this good has been declared dominant (rising-edge guard). */
  dominant: boolean;
  /** Whether this filler has been promoted (permanent once true). */
  promoted: boolean;
}

/** Conservation bookkeeping per good type (criteria B12). */
export interface ConservationState {
  /** Live instance count currently in the world, by good type id. */
  live: number[];
  /** Cumulative entries by channel (production only) and exits, by good type id. */
  produced: number[];
  consumed: number[];
  spoiled: number[];
  fake: number[];
}

/** The engine's full internal state for one run. */
export interface EngineStateInternal {
  readonly config: Config;
  readonly rng: Rng;
  /** Number of good types (focal + filler), == config.goods.length. */
  readonly goodCount: number;

  round: number;
  agents: AgentState[];
  goodStats: GoodStatState[];
  /** Region-scoped per-good statistics (scaled mode): indexed [region][good]. */
  regionGoodStats: GoodStatState[][];
  /** Number of regions (1 outside scaled mode). */
  readonly regionCount: number;
  conservation: ConservationState;

  /** The append-only event log, in emission order. */
  events: EngineEvent[];
  /** Per-round telemetry snapshots. */
  telemetry: RoundTelemetry[];

  // Detection / narration state
  leader: number | null;
  regionLeaders: (number | null)[];
  /** Whether all regional leaders currently align on one good (for REGIONS_MERGED rising edge). */
  regionsAligned: boolean;
  promoted: Set<number>;
  firstBridgeDone: boolean;
  dominantGood: number | null;
  reachedCap: boolean;
}

function zeros(n: number): number[] {
  return new Array<number>(n).fill(0);
}

function makeGoodStat(windowRounds: number): GoodStatState {
  return {
    posBucket: zeros(windowRounds),
    totBucket: zeros(windowRounds),
    tradeBucket: zeros(windowRounds),
    bucketRound: new Array<number>(windowRounds).fill(-1),
    firstDefinedA: null,
    sustainCount: 0,
    dominant: false,
    promoted: false,
  };
}

/**
 * Allocate the state shell for a run. Agents are created empty here and
 * populated by setup (M1); the round loop fills statistics and telemetry. The
 * RNG is seeded once; all randomness for the run flows from it in tape order.
 */
export function createState(config: Config, seed: number): EngineStateInternal {
  const goodCount = config.goods.length;
  const windowRounds = config.constants.WINDOW_ROUNDS;
  const regionCount = config.mode === "scaled" ? config.constants.REGION_COUNT : 1;

  const agents: AgentState[] = [];
  for (let pos = 0; pos < config.ringSize; pos++) {
    agents.push({
      position: pos,
      homeGood: 0, // assigned in setup
      held: null,
      want: NONE,
      emptyRounds: 0,
      prior: zeros(goodCount),
      scorePos: zeros(goodCount),
      scoreTot: zeros(goodCount),
      witnessedRefusals: [],
    });
  }

  const goodStats: GoodStatState[] = [];
  for (let g = 0; g < goodCount; g++) goodStats.push(makeGoodStat(windowRounds));

  const regionGoodStats: GoodStatState[][] = [];
  for (let r = 0; r < regionCount; r++) {
    const perGood: GoodStatState[] = [];
    for (let g = 0; g < goodCount; g++) perGood.push(makeGoodStat(windowRounds));
    regionGoodStats.push(perGood);
  }

  return {
    config,
    rng: makeRng(seed),
    goodCount,
    round: 0,
    agents,
    goodStats,
    regionGoodStats,
    regionCount,
    conservation: {
      live: zeros(goodCount),
      produced: zeros(goodCount),
      consumed: zeros(goodCount),
      spoiled: zeros(goodCount),
      fake: zeros(goodCount),
    },
    events: [],
    telemetry: [],
    leader: null,
    regionLeaders: new Array<number | null>(regionCount).fill(null),
    regionsAligned: false,
    promoted: new Set<number>(),
    firstBridgeDone: false,
    dominantGood: null,
    reachedCap: false,
  };
}
