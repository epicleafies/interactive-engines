/**
 * Structural test fixtures (register entry D-023).
 *
 * These configurations exist to exercise engine branches and events during the
 * build (criteria H7) — they are builder latitude per fixture, exactly as
 * functional test seeds are (D-010), under D-023's three rules:
 *   1. each fixture is documented at point of use with the coverage it exists for;
 *   2. no fixture value is cited as evidence for any C/D/E-series claim, nor
 *      copied into a C0 registration (C0 registers fresh);
 *   3. fixture-local values for §12 TBD constants are NON-CANONICAL — the
 *      constants-table TBDs remain unfilled until their H6 moment.
 *
 * NOTHING here is a teaching parameter or a tuned value. The numbers are chosen
 * to make mechanics fire (a fake exists, a good spoils, a whole good fails
 * change-making, a bulky good is reach-limited), not to produce any particular
 * market outcome.
 */

import type { Config, EngineConstants, GoodType, LevelMapping } from "./types.ts";

/**
 * Non-canonical constant values for fixtures. Chosen only so the round loop runs
 * and every threshold is well-formed; they are not the registered teaching
 * constants and must never be cited as such (D-023 rule 3).
 */
export const FIXTURE_CONSTANTS: EngineConstants = {
  SEED_STRENGTH: 3,
  SEED_CAP: 0.3,
  ACCEPT_MARGIN: 0.05,
  DECAY_FACTOR: 0.8,
  WINDOW_ROUNDS: 10,
  WITNESS_RADIUS: 5,
  BURN_WEIGHT: 4.0,
  PROD_DELAY: 0,
  FILLER_MIN_SHARE: 0.2,
  DOM_THRESHOLD: 0.7,
  DOM_GAP: 0.15,
  DOM_SUSTAIN: 3,
  DOM_MIN_TRADE_SHARE: 0.1,
  DOM_RISE_MIN: 0.05,
  REGION_COUNT: 1,
  ROUND_CAP: 200,
};

/**
 * Mapping table for fixtures (non-canonical). Levels are ordered worst -> best
 * (index 0..2) as in the criteria's level tables.
 */
export const FIXTURE_MAPPING: LevelMapping = {
  // desirability level -> want-share (a focal good's share of total want mass)
  wantShareWeight: [0.1, 0.2, 0.3],
  // durability level -> schedule: spoils fast / keeps a while / never spoils
  durabilitySchedule: [
    { s1: 1, s2: 1, neverSpoils: false },
    { s1: 5, s2: 3, neverSpoils: false },
    { s1: 0, s2: 0, neverSpoils: true },
  ],
  // recognizability level -> fake probability: hard to tell / takes a look / anyone can tell
  fakeProbability: [0.3, 0.1, 0.0],
  // divisibility level -> size class: all-or-nothing / cuts with effort / any amount
  sizeClass: ["whole", "coarse", "fine"],
  // portability level -> reach radius: stays put / takes effort / travels light
  reachRadius: [2, 4, 5],
  // scarcity level -> production weight (Week 1 locks the middle level; profession ignores it)
  scarcityWeight: [1, 1, 1],
};

function good(id: number, label: string, isFiller: boolean, levels: [number, number, number, number, number, number]): GoodType {
  const [desirability, durability, recognizability, divisibility, portability, scarcity] = levels;
  return {
    id,
    label,
    isFiller,
    attributes: {
      desirability: desirability as 0 | 1 | 2,
      durability: durability as 0 | 1 | 2,
      recognizability: recognizability as 0 | 1 | 2,
      divisibility: divisibility as 0 | 1 | 2,
      portability: portability as 0 | 1 | 2,
      scarcity: scarcity as 0 | 1 | 2,
    },
  };
}

/**
 * `smallContrast` — a 10-agent small-mode ring with two contrasting focal goods
 * and two all-middle fillers. Coverage it exists for:
 *   - good 0: a strong all-best focal (never spoils, anyone can tell it's real,
 *     any-amount divisible, travels light) — exercises the no-fake, no-spoil,
 *     fine-divisible, full-reach branches;
 *   - good 1: a weak focal (spoils fast, hard to tell it's real -> fakes exist,
 *     all-or-nothing -> change-making refusals, stays put -> reach-limited) —
 *     exercises the fake-reveal, spoilage, divisibility-refusal, and reach branches;
 *   - goods 2,3: all-middle fillers exercising the filler pool and redistribution.
 * The homeGoods distribution spreads producers around the ring so reach and
 * witnessing both bite.
 */
export function smallContrastFixture(): Config {
  const goods: GoodType[] = [
    good(0, "good-0 (strong focal)", false, [2, 2, 2, 2, 2, 1]),
    good(1, "good-1 (weak focal)", false, [1, 0, 0, 0, 0, 1]),
    good(2, "filler-2", true, [1, 1, 1, 1, 1, 1]),
    good(3, "filler-3", true, [1, 1, 1, 1, 1, 1]),
  ];
  return {
    mode: "small",
    ablation: { kind: "none" },
    ringSize: 10,
    goods,
    focalGoodIds: [0, 1],
    mapping: FIXTURE_MAPPING,
    productionPolicy: "profession",
    homeGoods: [0, 0, 0, 1, 1, 1, 2, 2, 3, 3],
    constants: FIXTURE_CONSTANTS,
  };
}

/**
 * `tradingPair` — a deliberately LIVE market for exercising the trade path
 * (steps 4/6). Coverage it exists for: TRADE execution, the instance swap,
 * consume-after-trade and re-endowment, and the one-trade-per-round invariant.
 *
 * It is a no-filler two-good ring — an artificial sealed market, the kind the
 * spec calls out as the unnatural construction — chosen ONLY so trades reliably
 * fire: alternating producers of good 0 and good 1, both goods fine-divisible,
 * never-spoiling, recognizable (no fakes), and full-reach. With no fillers, each
 * agent's want redistribution falls through to the other focal good (D-025b), so
 * good-0 producers always want good 1 and vice versa — a standing double
 * coincidence. This is a structural fixture (D-023): NOT a teaching parameter,
 * never cited for any C/D/E claim. FILLER_MIN_SHARE = 0 here is non-canonical.
 */
/**
 * `scaled` — a minimal scaled-mode ring (8 positions, 2 regions) for exercising
 * region attribution (§1, §9.3): a cross-border trade is attributed to both
 * parties' regions. Structural fixture (D-023); the region count and size are
 * coverage choices, not teaching parameters.
 */
export function scaledFixture(): Config {
  const goods: GoodType[] = [
    good(0, "good-0", false, [2, 2, 2, 2, 2, 1]),
    good(1, "good-1", false, [1, 2, 2, 2, 2, 1]),
    good(2, "filler-2", true, [1, 1, 1, 1, 1, 1]),
    good(3, "filler-3", true, [1, 1, 1, 1, 1, 1]),
  ];
  return {
    mode: "scaled",
    ablation: { kind: "none" },
    ringSize: 8,
    goods,
    focalGoodIds: [0, 1],
    mapping: FIXTURE_MAPPING,
    productionPolicy: "profession",
    homeGoods: [0, 1, 2, 3, 0, 1, 2, 3],
    constants: { ...FIXTURE_CONSTANTS, REGION_COUNT: 2 },
  };
}

export function tradingPairFixture(): Config {
  const focal = (id: number, label: string): GoodType =>
    // desirability low (mapped to 0.5 below), never spoils, anyone can tell,
    // any-amount divisible, travels light, scarcity middle.
    good(id, label, false, [0, 2, 2, 2, 2, 1]);
  return {
    mode: "small",
    ablation: { kind: "none" },
    ringSize: 6,
    goods: [focal(0, "good-0"), focal(1, "good-1")],
    focalGoodIds: [0, 1],
    mapping: { ...FIXTURE_MAPPING, wantShareWeight: [0.5, 0.5, 0.5] },
    productionPolicy: "profession",
    homeGoods: [0, 1, 0, 1, 0, 1],
    constants: { ...FIXTURE_CONSTANTS, FILLER_MIN_SHARE: 0 },
  };
}
