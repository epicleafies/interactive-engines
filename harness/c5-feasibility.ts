/**
 * C5 SCALED FEASIBILITY (D-063 pending-module build; D-072 measure). EXPLICITLY
 * DIAGNOSTIC: not a registered pass, commits no bar. It shows the E1/E2/E3 scaled
 * statistics (c5-scaled.ts) separate in scaled mode — proof the relocations are
 * reachable, NOT the bars (those are TBD, C0-filled per H6).
 *
 * Scaled C5 geometry (D-057(c)/(f)): three goods differing ONLY in bulk/portability —
 * logs (R_bulky, low port) / firewood (R_medium) / charcoal (R_light, high port) — at
 * reach radii (2, 4, 6) (D-057(c) starting proposal); REGION_COUNT 4 (D-057(d)); ring
 * N in {12, 16} (<= the interim ceiling, D-057). Reach is MUTUAL (min of both held
 * goods' radii, §6.4), so a low-port good is confined to short hops while the high-port
 * good can bridge across regions.
 *
 * THINNESS WATCH (D-057 interim ceiling): N <= 16, REGION_COUNT 4 => ~3-4 traders/region.
 * If regional formation or the merge does not separate because the regions are too thin
 * (high NO_EVIDENCE — the D-058 thinness finding surfacing in scaled mode), that is a
 * finding to REPORT, not tune: it may couple C5 calibration to the measured-ceiling
 * successor (the D-052/D-058 village re-draw that would raise N). This runner does NOT
 * push N or tune to force separation.
 *
 * Self-contained: defines its own scaled config (does not touch the c0 campaign tree).
 * The convergence/merge winner is recomputed harness-side from global A(g) telemetry via
 * the robust D-069/D-072 measure — never the engine DOMINANT(g)/DOMINANCE event.
 * Harness code may use Node/console; the engine stays platform-pure.
 */

import type { Config, EngineConstants, GoodType, LevelMapping, SizeClass } from "../engines/emergence/types.ts";
import { run } from "../engines/emergence/index.ts";
import { deriveSeeds, DEFAULT_BATCH_SIZE } from "./batch.ts";
import { scaledOutcome } from "./c5-scaled.ts";

const SEEDS = deriveSeeds(20260608, DEFAULT_BATCH_SIZE); // functional base (D-010); not outcome-shopped
const LOW_PORT = 0; // logs (R_bulky)
const HIGH_PORT = 2; // charcoal (R_light)

// Registered C5 constants (D-057(b)/(d)) + REGION_COUNT 4 (D-057(d)); defined locally so the
// C5 module is self-contained (no dependency on the c0 campaign tree).
const C5_CONSTANTS: EngineConstants = {
  SEED_STRENGTH: 3, SEED_CAP: 0.5, D5_MARGIN: 0.15, ACCEPT_MARGIN: 0.05, DECAY_FACTOR: 0.9,
  WINDOW_ROUNDS: 12, WITNESS_RADIUS: 2, BURN_WEIGHT: 4.0, PROD_DELAY: 0, FILLER_MIN_SHARE: 0.25,
  DOM_THRESHOLD: 0.7, DOM_GAP: 0.15, DOM_SUSTAIN: 5, DOM_MIN_TRADE_SHARE: 0.5, DOM_RISE_MIN: 0.15,
  REGION_COUNT: 4, ROUND_CAP: 120,
};

// C5 level mapping: only reachRadius discriminates (D-057(c) R_bulky/R_medium/R_light = 2/4/6);
// every other attribute is held at its neutral level across the three goods.
const C5_MAPPING: LevelMapping = {
  wantShareWeight: [0.08, 0.15, 0.3], // desirability mapping; all C5 goods sit at the neutral (mid) level
  durabilitySchedule: [
    { s1: 2, s2: 2, neverSpoils: false },
    { s1: 8, s2: 4, neverSpoils: false },
    { s1: 0, s2: 0, neverSpoils: true },
  ],
  fakeProbability: [0.25, 0.1, 0.0],
  sizeClass: ["whole", "coarse", "fine"] as readonly [SizeClass, SizeClass, SizeClass],
  reachRadius: [2, 4, 6], // R_bulky / R_medium / R_light (D-057(c))
  scarcityWeight: [1, 1, 1],
};

// Registered teaching neutrals (D-024(b)) as level indices [des,dur,rec,div,por,sca].
// portability is the focal axis (swept 0/1/2); all else neutral.
const NEUTRAL = { desirability: 1, durability: 2, recognizability: 2, divisibility: 2, scarcity: 1 } as const;

function good(id: number, label: string, portability: 0 | 1 | 2): GoodType {
  return {
    id, label, isFiller: false,
    attributes: {
      desirability: NEUTRAL.desirability, durability: NEUTRAL.durability, recognizability: NEUTRAL.recognizability,
      divisibility: NEUTRAL.divisibility, portability, scarcity: NEUTRAL.scarcity,
    },
  };
}

type Placement = "round-robin" | "regional-clustered";

/** homeGoods producer placement (spec §8 — a config input; a neutral, documented construction). */
function homeGoods(n: number, placement: Placement): number[] {
  const arc = n / C5_CONSTANTS.REGION_COUNT;
  return Array.from({ length: n }, (_, i) =>
    placement === "round-robin" ? i % 3 : Math.floor(i / arc) % 3, // region r -> good r%3 (regional concentration)
  );
}

function buildC5(n: number, placement: Placement): Config {
  return {
    mode: "scaled",
    ablation: { kind: "none" },
    ringSize: n,
    goods: [good(0, "logs (low port)", 0), good(1, "firewood (mid port)", 1), good(2, "charcoal (high port)", 2)],
    focalGoodIds: [0, 1, 2],
    mapping: C5_MAPPING,
    productionPolicy: "profession",
    homeGoods: homeGoods(n, placement),
    constants: C5_CONSTANTS,
  };
}

const f = (x: number) => (Number.isNaN(x) ? "  —  " : x.toFixed(3));

console.log("C5 SCALED FEASIBILITY (D-063 module; D-072 robust measure). DIAGNOSTIC ONLY (no pass, no bar).");
console.log("3 goods differ only in portability: logs(R2,low) / firewood(R4) / charcoal(R6,high); REGION_COUNT 4.");
console.log("merge-winner = robust convergence from GLOBAL A(g) telemetry (D-069/D-072), NOT the DOMINANCE event.");
console.log(`thinness watch: N<=16, 4 regions => ~3-4 traders/region; low regionalDefined ⇒ D-058 thinness in scaled mode.\n`);

for (const placement of ["regional-clustered", "round-robin"] as const) {
  console.log(`=== placement: ${placement} ===`);
  console.log("  N   | E1 form | converged | E2 merge | E3 decides (n cond) | regionalDefined (thinness)");
  for (const n of [12, 16]) {
    const runs = SEEDS.map((s) => run(buildC5(n, placement), s));
    const o = scaledOutcome(runs, LOW_PORT, HIGH_PORT);
    console.log(
      `  ${String(n).padEnd(3)} |  ${f(o.e1FormRate)}  |   ${f(o.convergedRate)}   |  ${f(o.e2MergeRate)}   |  ${f(o.e3DecidesRate)} (n=${o.e3ConditioningRuns})        |  ${f(o.regionalDefinedRate)}`,
    );
  }
  console.log("");
}
console.log("Reading: E1 = >=2 regional leaders before convergence; E2 = converged via an EMERGED winner (robust);");
console.log("E3 = of runs where low-port leads one region & high-port another, the fraction the high-port good wins+emerged.");
console.log("Bars (pass-rate %, margins) are TBD — C0-filled per H6. Separation here is reachability evidence, not the bar.");
