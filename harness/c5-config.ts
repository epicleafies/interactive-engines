/**
 * C5 scaled config construction (D-057(c)/(d)/(f)) — the single source of the C5
 * teaching geometry, shared by the C5 feasibility diagnostic (c5-feasibility.ts)
 * and the C5 calibration that fills the E1/E2/E3 bars (c5-calibration.ts). Pure:
 * defines configs only, no console, no top-level execution, so importing it has
 * no side effects.
 *
 * The geometry (D-057(c)/(f), pinned by D-073): three goods differing ONLY in
 * bulk/portability — logs (R_bulky, low port) / firewood (R_medium) / charcoal
 * (R_light, high port) — at reach radii (2, 4, 6); every other attribute held at
 * its neutral teaching level (D-024(b)). Reach is MUTUAL (min of both held goods'
 * radii, §6.4), so a low-port good is confined to short hops while a high-port
 * good can bridge across regions. REGION_COUNT 4 (D-057(d)) partitions the ring
 * into equal arcs; a low-port good cannot leave its arc, a high-port good can.
 *
 * `regionCount` is a parameter (default the registered 4) so the calibration can
 * build the single-region ABLATION cell (REGION_COUNT 1) that disables regional
 * formation — the E1 failability demonstration: with one region no regional
 * leaders are tracked at all (engine statistic.ts only runs the regional block
 * when regionCount > 1), so E1 ("≥2 distinct regional leaders") collapses to 0.
 *
 * Harness-side only: no engine change, no spec change, no re-pin.
 */

import type { Config, EngineConstants, GoodType, LevelMapping, SizeClass } from "../engines/emergence/types.ts";

/** logs (R_bulky) — the low-portability focal good. */
export const LOW_PORT = 0;
/** charcoal (R_light) — the high-portability focal good. */
export const HIGH_PORT = 2;

/** Producer placement on the ring (spec §8 `homeGoods`): interleaved vs region-clustered. */
export type Placement = "round-robin" | "regional-clustered";

/**
 * Registered C5 constants (D-057(b)/(d)) + REGION_COUNT 4 (D-057(d)). Defined here
 * so the C5 modules are self-contained (no dependency on the c0 village campaign tree).
 */
export const C5_CONSTANTS: EngineConstants = {
  SEED_STRENGTH: 3, SEED_CAP: 0.5, D5_MARGIN: 0.15, ACCEPT_MARGIN: 0.05, DECAY_FACTOR: 0.9,
  WINDOW_ROUNDS: 12, WITNESS_RADIUS: 2, BURN_WEIGHT: 4.0, PROD_DELAY: 0, FILLER_MIN_SHARE: 0.25,
  DOM_THRESHOLD: 0.7, DOM_GAP: 0.15, DOM_SUSTAIN: 5, DOM_MIN_TRADE_SHARE: 0.5, DOM_RISE_MIN: 0.15,
  REGION_COUNT: 4, ROUND_CAP: 120,
};

/**
 * C5 level mapping: only reachRadius discriminates (D-057(c) R_bulky/R_medium/R_light
 * = 2/4/6); every other attribute is held at its neutral level across the three goods.
 */
export const C5_MAPPING: LevelMapping = {
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

// Registered teaching neutrals (D-024(b)); portability is the focal axis (swept 0/1/2),
// all else neutral.
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

/**
 * homeGoods producer placement (spec §8 — a config input; a neutral, documented
 * construction). Round-robin interleaves producers (region-independent: position i
 * makes good i%3); regional-clustered concentrates producers by arc (region r makes
 * good r%3), so each region's home producers favor one good.
 */
export function homeGoods(n: number, placement: Placement, regionCount: number): number[] {
  const arc = n / regionCount;
  return Array.from({ length: n }, (_, i) =>
    placement === "round-robin" ? i % 3 : Math.floor(i / arc) % 3,
  );
}

/**
 * Build the C5 scaled config at population `n`, producer `placement`, and
 * `regionCount` (default the registered 4). The default path returns the exact
 * registered teaching geometry; passing regionCount = 1 builds the single-region
 * ablation (the E1 failability cell).
 */
export function buildC5(n: number, placement: Placement, regionCount: number = C5_CONSTANTS.REGION_COUNT): Config {
  const constants: EngineConstants =
    regionCount === C5_CONSTANTS.REGION_COUNT ? C5_CONSTANTS : { ...C5_CONSTANTS, REGION_COUNT: regionCount };
  return {
    mode: "scaled",
    ablation: { kind: "none" },
    ringSize: n,
    goods: [good(0, "logs (low port)", 0), good(1, "firewood (mid port)", 1), good(2, "charcoal (high port)", 2)],
    focalGoodIds: [0, 1, 2],
    mapping: C5_MAPPING,
    productionPolicy: "profession",
    homeGoods: homeGoods(n, placement, regionCount),
    constants,
  };
}
