/**
 * Money Emergence Simulation — engine public contract.
 *
 * This file is the typed boundary between the reference engine and everything
 * that consumes it (the acceptance harness, and later the surfaces). It encodes
 * the world model, goods, agents, configuration, and the semantic event stream
 * exactly as the engine spec defines them. It contains TYPES ONLY — no behavior
 * — so the harness skeleton (built before the engine, per the build order) can
 * be written and type-checked against a stable contract while the engine itself
 * is still being implemented.
 *
 * Platform purity: nothing here imports a DOM, Node, React, or host API, and the
 * engine that implements this contract is a pure `(config, seed) -> {state,
 * events}` state machine using only deterministic arithmetic.
 */

// --- Goods ---------------------------------------------------------------

/**
 * The six good attributes, each taking one of three discrete levels (no
 * sliders, no continuous values anywhere). Levels are ordinal 0/1/2 ordered
 * worst -> best as in the criteria's level tables, so that "step a single
 * attribute from worst to best" (the monotonic-trend audit) and "two goods with
 * the same level are mechanically identical" (the relabel audit) are both
 * expressible directly over these indices.
 */
export type LevelIndex = 0 | 1 | 2;

export type AttributeName =
  | "desirability"
  | "durability"
  | "recognizability"
  | "divisibility"
  | "portability"
  | "scarcity";

export type Attributes = Readonly<Record<AttributeName, LevelIndex>>;

/** Divisibility size classes (criteria B4). Derived from the divisibility level. */
export type SizeClass = "whole" | "coarse" | "fine";

/**
 * A good *type* (not an instance). `id` is the canonical type index: it is the
 * ordering used by structural tie-breaks ("lowest type index") and is the only
 * total order the engine imposes on goods.
 */
export interface GoodType {
  readonly id: number;
  /** Provisional learner-label slot. No shipped copy lives in the engine. */
  readonly label: string;
  readonly attributes: Attributes;
  /** Filler goods run identical rules; this flag only drives chart aggregation. */
  readonly isFiller: boolean;
}

// --- Good instances ------------------------------------------------------

/**
 * A held good instance. Age travels with the instance through trades; `isFake`
 * is hidden until reveal; `acquiredByTrade` flips true the first time the
 * instance changes hands and governs the burn weighting of a loss.
 */
export interface Instance {
  readonly type: number; // GoodType.id
  readonly age: number;
  readonly isFake: boolean;
  readonly acquiredByTrade: boolean;
}

// --- Agents --------------------------------------------------------------

/** Sentinel for "no want" — the defined degenerate when a want draw has empty support. */
export const NONE = -1 as const;
export type WantTarget = number | typeof NONE; // GoodType.id, or NONE

export interface Agent {
  readonly position: number; // ring position
  readonly homeGood: number; // GoodType.id this agent produces
  readonly held: Instance | null; // null = empty-handed
  readonly want: WantTarget;
}

// --- Configuration -------------------------------------------------------

export type Mode = "small" | "teaching" | "synthesis" | "scaled" | "sandbox";

/**
 * Ablation modes (A-series support). `none` is the normal engine. The ablation
 * modes disable exactly one mechanism so a headline result can be shown to
 * depend on it; each is specified in the engine spec.
 */
export type Ablation =
  | { readonly kind: "none" }
  | { readonly kind: "A1" } // tallies frozen after seeding AND wants pinned at initial draw
  | { readonly kind: "A2"; readonly attribute: AttributeName }; // disable one attribute's mechanic

/**
 * The level -> engine-parameter mapping (the sole tuning surface). It is global,
 * registered, and fixed per QA campaign; the engine reads it from config and
 * never adjusts a parameter per individual good. Tuned values are filled by the
 * C0 campaign with a logged sweep; this type only fixes their SHAPE.
 */
export interface LevelMapping {
  /** desirability level -> want-share weight. */
  readonly wantShareWeight: readonly [number, number, number];
  /** durability level -> (S1, S2) schedule; "never" carries no destroy tick. */
  readonly durabilitySchedule: readonly [Schedule, Schedule, Schedule];
  /** recognizability level -> fake probability (high recognizability = 0). */
  readonly fakeProbability: readonly [number, number, number];
  /** divisibility level -> size class. Structural, not tuned. */
  readonly sizeClass: readonly [SizeClass, SizeClass, SizeClass];
  /** portability level -> reach radius (ring positions). */
  readonly reachRadius: readonly [number, number, number];
  /** scarcity level -> production weight (Week 1 locks the middle level). */
  readonly scarcityWeight: readonly [number, number, number];
}

/**
 * A durability schedule (criteria B2). `fresh` iff age < s1; `stale` iff
 * s1 <= age < s1 + s2; destroyed at the tick reaching s1 + s2. A "never spoils"
 * level sets `neverSpoils` and ages without transitioning.
 */
export interface Schedule {
  readonly s1: number;
  readonly s2: number;
  readonly neverSpoils: boolean;
}

export type ProductionPolicy = "profession" | "weighted";

/**
 * The full engine configuration. Carries the world, the goods, the mapping
 * table, and every named constant — so the engine hardcodes no tuned value and
 * any run is reproducible from {config, seed} alone. TBD tuned constants are
 * supplied here by a campaign or a clearly-labeled test fixture, never invented
 * inside the engine.
 */
export interface Config {
  readonly mode: Mode;
  readonly ablation: Ablation;

  readonly ringSize: number; // N positions
  readonly goods: readonly GoodType[]; // includes focal and filler goods
  readonly focalGoodIds: readonly number[];
  readonly mapping: LevelMapping;
  readonly productionPolicy: ProductionPolicy;

  /** Optional per-agent pinned initial wants (criteria F1); bypass the draw, consume no RNG. */
  readonly pinnedWants?: Readonly<Record<number, WantTarget>>;
  /**
   * Per-position homeGood assignment (one good id per ring position). Required:
   * the engine never derives a holdings distribution — a structural fixture or a
   * campaign config assigns it explicitly (V-16).
   */
  readonly homeGoods: readonly number[];

  readonly constants: EngineConstants;
}

/**
 * Named constants (engine spec §12). Every threshold is denominated in rounds,
 * shares, or per-capita rates — never raw event counts (criteria B10). Values
 * are injected, not baked: the engine reads them here.
 */
export interface EngineConstants {
  readonly SEED_STRENGTH: number; // K, the prior weight
  readonly SEED_CAP: number; // cap on the seeded prior fraction
  readonly D5_MARGIN: number; // D5 seed headroom: validity precondition SEED_CAP <= DOM_THRESHOLD - D5_MARGIN (D-056)
  readonly ACCEPT_MARGIN: number; // epsilon, the single comparison constant
  readonly DECAY_FACTOR: number; // per-round multiplicative recency factor
  readonly WINDOW_ROUNDS: number; // rolling window length, rounds
  readonly WITNESS_RADIUS: number; // W_r: event witnessing AND setup want-visibility
  readonly BURN_WEIGHT: number; // weight of a trade-acquired loss to its victim
  readonly PROD_DELAY: number; // completed empty rounds before re-endowment
  readonly FILLER_MIN_SHARE: number; // config-validity floor on filler want-share
  readonly DOM_THRESHOLD: number; // dominance: A(g) floor
  readonly DOM_GAP: number; // dominance: A(g) - A(runner-up) floor
  readonly DOM_SUSTAIN: number; // dominance: consecutive rounds required
  readonly DOM_MIN_TRADE_SHARE: number; // dominance: per-capita in-window trade floor
  readonly DOM_RISE_MIN: number; // dominance: required rise above first defined A(g)
  readonly REGION_COUNT: number; // scaled mode: equal contiguous arcs
  readonly ROUND_CAP: number; // hard round limit
}

// --- Semantic event stream (spec §10) ------------------------------------

export type RefusalReason = "judgment" | "stale" | "divisibility";

/** A party that, in a completed trade, acquired a good that was not its current want (D-028). */
export type BridgeRole = "proposer" | "accepter";
export type BridgeQualification = "tally-clause acceptance" | "bridge-targeted acquisition";
export interface BridgeQualifier {
  readonly party: number; // agent position
  readonly role: BridgeRole;
  readonly acquiredGood: number;
  readonly qualification: BridgeQualification;
}

/** Where a fake was revealed: the round after a trade, or on attempted consumption. */
export type FakeContext = "trade" | "consume";

/**
 * The typed event stream. Beats and narration bind only to event types and
 * predicates over them — never to round numbers, agent identities, or facts of
 * one trace. Exactly four of these enter acceptance tallies (TRADE, REFUSAL,
 * FAKE_REVEAL, SPOIL_DESTROY); the rest are stream/telemetry.
 */
export type EngineEvent =
  | { readonly type: "PRODUCE"; readonly round: number; readonly agent: number; readonly good: number }
  | {
      readonly type: "TRADE";
      readonly round: number;
      readonly proposer: number;
      readonly partner: number;
      readonly goodFromProposer: number;
      readonly goodFromPartner: number;
      /**
       * True when the ACCEPTER took the offered good via the tally (bridge)
       * clause rather than the want clause — i.e. the offered good was not the
       * accepter's want, so its acceptance tally alone carried the trade. This
       * is the "accepted as an intermediary" signal `FIRST_BRIDGE_ACCEPT` keys
       * off, regardless of which priority the proposer used.
       */
      readonly viaBridge: boolean;
    }
  | {
      readonly type: "REFUSAL";
      readonly round: number;
      readonly proposer: number;
      readonly partner: number;
      readonly offeredGood: number;
      /** Full set of failed gates; no precedence, no information destroyed. */
      readonly reasons: readonly RefusalReason[];
    }
  | { readonly type: "SPOIL_STAGE"; readonly round: number; readonly agent: number; readonly good: number }
  | {
      readonly type: "SPOIL_DESTROY";
      readonly round: number;
      readonly agent: number;
      readonly good: number;
      readonly wasFake: boolean;
      /** Whether the victim's destroyed instance was acquired by trade (drives burn weighting). */
      readonly acquiredByTrade: boolean;
    }
  | {
      readonly type: "FAKE_REVEAL";
      readonly round: number;
      readonly agent: number;
      readonly good: number;
      readonly context: FakeContext;
      /** Whether the victim's revealed instance was acquired by trade (drives burn weighting). */
      readonly acquiredByTrade: boolean;
    }
  | { readonly type: "CONSUME"; readonly round: number; readonly agent: number; readonly good: number }
  | {
      /**
       * Once per run, on the first completed trade in which at least one party
       * acquires a good that is not its current want — the run's first
       * intermediary acquisition (D-028). The payload names every qualifying
       * party (accepter via tally-clause acceptance; proposer via
       * bridge-targeted acquisition); if both qualify, one event carries both.
       */
      readonly type: "FIRST_BRIDGE_ACCEPT";
      readonly round: number;
      readonly qualifiers: readonly BridgeQualifier[];
    }
  | { readonly type: "LEAD_CHANGE"; readonly round: number; readonly from: number | null; readonly to: number }
  | { readonly type: "REGION_LEADER"; readonly round: number; readonly region: number; readonly good: number }
  | { readonly type: "REGIONS_MERGED"; readonly round: number; readonly good: number }
  | { readonly type: "DOMINANCE"; readonly round: number; readonly good: number }
  | { readonly type: "CAP_REACHED"; readonly round: number }
  | { readonly type: "FILLER_PROMOTED"; readonly round: number; readonly good: number }
  | {
      readonly type: "DECISION_TRACE";
      readonly round: number;
      readonly agent: number;
      /** The visible inputs sufficient for an independent referee to reproduce the verdict. */
      readonly inputs: Readonly<Record<string, number | boolean | string>>;
      readonly verdict: "accept" | "reject";
    };

export type EventType = EngineEvent["type"];

/** The four event types that enter acceptance tallies (engine spec §7.1). */
export const TALLY_EVENT_TYPES: readonly EventType[] = [
  "TRADE",
  "REFUSAL",
  "FAKE_REVEAL",
  "SPOIL_DESTROY",
];

// --- Statistics & telemetry ----------------------------------------------

/**
 * The acceptance share A(g): recency-weighted positive fraction over the union
 * of distinct in-window events involving g. With zero in-window events A(g) is
 * the explicit value NO_EVIDENCE (never a fabricated number); the detector
 * treats NO_EVIDENCE as not-dominant and the display renders a gap.
 */
export const NO_EVIDENCE = null;
export type AcceptanceShare = number | typeof NO_EVIDENCE;

/** Per-round goods-flow counts by channel (for B9's ratio and B12's identity). */
export interface FlowCounts {
  readonly produced: number;
  readonly tradeMoves: number;
  readonly consumed: number;
  readonly spoiled: number;
  readonly fake: number;
}

/** Permanent per-round telemetry the harness asserts on (never a debug feature). */
export interface RoundTelemetry {
  readonly round: number;
  readonly acceptanceShare: Readonly<Record<number, AcceptanceShare>>; // by good id
  readonly flow: FlowCounts;
  readonly leader: number | null;
  readonly regionLeaders: readonly (number | null)[];
  readonly refusalsByReasonSet: Readonly<Record<string, number>>;
  /** Event-record composition counters backing the A6 audit. */
  readonly eventRecordComposition: Readonly<Record<string, number>>;
}

// --- Resolved setup topology (D-064) -------------------------------------

/**
 * The engine's own resolution of the spatial setup the UI must render but must
 * never recompute (D-053): how far each good reaches, and which region each
 * trader sits in. Both fields are pure resolutions of inputs already fixed at
 * setup — the config's level->parameter mapping and the fixed ring positions —
 * so they carry NO run entropy and are bit-stable across replays.
 *
 * They are *surfaced* from the engine's own resolvers (`reachOf`, `regionOf`),
 * not recomputed: those resolvers are engine-internal (not on the public surface,
 * so a consumer cannot call them), and D-053 forbids the UI re-deriving ring
 * distance or arc boundaries. Emitting the resolved values is what lets a
 * consumer bind geometry instead of reconstructing it.
 *
 * Additive and deliberately OUTSIDE the pinned serialization (serializeRun):
 * because it is a deterministic function of inputs already pinned (config +
 * positions) it tells the determinism/replay checks nothing new, and it must not
 * move the PROJECT_SEED digest (D-064 determinism condition).
 */
export interface InitialTopology {
  /**
   * Resolved reach radius per good, indexed by `GoodType.id` (so `reachByGood[g]`
   * is good `g`'s reach in ring positions). This is `reachOf` applied — the good's
   * portability/bulk level mapped through `LevelMapping.reachRadius` — NOT the raw
   * level. A consumer binds this distance directly and must not re-resolve the
   * bulk->reach mapping itself (D-053).
   */
  readonly reachByGood: readonly number[];
  /**
   * Region membership per trader, indexed by ring position (which equals the
   * `finalAgents` index: positions are fixed for the run, so the agent at index
   * `i` sits at ring position `i`). Each entry is `regionOf(position, N,
   * regionCount)` — the engine's own equal-arc resolution. When regions partition
   * the ring (scaled mode; `regionsPartition` true) it is the trader's arc index
   * in `[0, regionCount)`; otherwise the ring is one region and every entry is 0,
   * an explicit single-region value rather than a UI-side guess about whether
   * regions exist.
   */
  readonly regionByTrader: readonly number[];
  /**
   * Whether the ring is partitioned into multiple regions (scaled mode with
   * REGION_COUNT > 1). False means a single region: `regionByTrader` is all 0 and
   * a consumer draws no district boundaries. Makes the single-region case explicit
   * rather than inferred from the values.
   */
  readonly regionsPartition: boolean;
}

// --- Run output ----------------------------------------------------------

import type { RunRecord } from "../../harness/replay.ts";

/**
 * The full, replayable output of one run.
 *
 * There is deliberately no scalar "dominant good" field (D-040). Dominance is
 * unique per round but non-terminal — it may lapse and re-fire, and several
 * goods may dominate across a run — so no single good id can honestly summarize
 * it. The DOMINANCE event stream is the sole authority on which good(s) dominated
 * and when; `CAP_REACHED` (and `reachedCap`) report the complementary outcome:
 * the cap was reached with no DOMINANCE event in the run.
 */
export interface RunResult {
  readonly record: RunRecord;
  readonly events: readonly EngineEvent[];
  readonly telemetry: readonly RoundTelemetry[];
  readonly finalAgents: readonly Agent[];
  /** Reached the round cap without any dominance verdict (a first-class outcome). */
  readonly reachedCap: boolean;
  /**
   * Resolved setup topology (D-064): reach-per-good and region-per-trader, the
   * engine's own resolution of the geometry a consumer renders from (D-053).
   * Additive and scoped OUT of the pinned serialization — a pure function of the
   * already-pinned config and positions, carrying no new entropy, so it does not
   * move the PROJECT_SEED digest.
   */
  readonly initialTopology: InitialTopology;
}

/** The engine's single entry point: a pure function of configuration and seed. */
export type RunFn = (config: Config, seed: number) => RunResult;
