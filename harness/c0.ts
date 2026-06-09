/**
 * C0 feasibility campaign — village round/ordering beats (criteria v2.3 C-series).
 *
 * This is QA machinery (public per D-009): it runs the registered C0 sweep and
 * emits the sweep artifacts the closing entry will read. It contains NO invented
 * numbers — every constant, grid, cast, level, bar, and family traces to register
 * entry D-057 (the H6 intake). Where D-057 leaves a value to construction (the
 * holdings distribution / producer placement — spec §8 calls homeGood "the
 * configuration's holdings distribution", a config input), the choice is a
 * balanced, documented one (D-023-class latitude: chosen for neutrality, never
 * for outcome), recorded here and reported alongside the results.
 *
 * Beats covered here: the round beats C1 (desirability), C3 (durability) and C4
 * (divisibility) — all village mode (REGION_COUNT 1), portability neutral so
 * distance does not discriminate. C5 (portability, scaled) is a separate module:
 * its supply/demand geometry is a distinct construction (D-057(c)/(f)).
 *
 * C2 (recognizability) is no longer graded here: D-062 demoted it to a narrated
 * demonstration carrying no acceptance bar, so there is no C2 pass to compute and
 * no C2 TBD for C0 to fill.
 *
 * Criteria v2.4 relocation (D-059/060/061): the A(g) round bar below is faithful
 * only to C1 (desirability — the determinant A(g) measures honestly). C3 and C4
 * relocate off A(g) onto their honest per-dimension statistics — C3 to
 * held-and-re-traded persistence, C4 to circulation + the divisibility-refusal
 * hook — implemented in `c-series.ts` and validated by `c-series-feasibility.ts`.
 * Wiring those statistics into this campaign's grading (and filling their bars)
 * is the C0 re-run, gated on a registered D-057-successor entry (H6); this module
 * still computes the superseded A(g) bar until that re-run lands.
 *
 * Discipline (D-057, D-001): if a cell needs a value D-057 does not carry, or a
 * bar proves unreachable across the registered sweep, that is a register ruling
 * (the C0 escape) — reported, never a quiet bar move. This module reports; it does
 * not rule.
 */

import type { Config, EngineConstants, GoodType, LevelMapping, RunResult, AcceptanceShare } from "../engines/emergence/types.ts";
import { run } from "../engines/emergence/index.ts";
import { deriveSeeds, DEFAULT_BATCH_SIZE } from "./batch.ts";
import { passRate, summarize } from "./stats.ts";
import { enforceH6, type TbdDeclaration } from "./campaign.ts";
import {
  focalEventCounts,
  statByGood,
  persistence,
  circulation,
  divisibilityRefusalRate,
  type GoodStat,
} from "./c-series.ts";

// =========================================================================
// Registered parameters (D-057). Every value below cites D-057's section.
// =========================================================================

/** D-057(b)/(c)/(d) level -> parameter mapping for the village family. */
export const C0_MAPPING_VILLAGE: LevelMapping = {
  // D-057(b) want-share low/mid/high = 0.08 / 0.15 / 0.30 (desirability mapping).
  wantShareWeight: [0.08, 0.15, 0.30],
  // D-057(b) durability: fast (2,2) / "lasts a while" slow (8,4) / never spoils.
  durabilitySchedule: [
    { s1: 2, s2: 2, neverSpoils: false },
    { s1: 8, s2: 4, neverSpoils: false },
    { s1: 0, s2: 0, neverSpoils: true },
  ],
  // D-057(b) recognizability: hard-to-tell f_high 0.25 / f_mid 0.10 / anyone-can-tell 0.
  fakeProbability: [0.25, 0.10, 0.0],
  // Structural: all-or-nothing / cuts-with-effort / any-amount.
  sizeClass: ["whole", "coarse", "fine"],
  // D-057(c) village reach: R_bulky 1 / R_medium 3 / R_light 6.
  reachRadius: [1, 3, 6],
  // Profession policy ignores scarcity weights (Week 1 locked middle).
  scarcityWeight: [1, 1, 1],
};

/** D-057(b)/(d) base constants for the village family (starting values). */
export const C0_CONSTANTS_VILLAGE: EngineConstants = {
  SEED_STRENGTH: 3, // D-057(b)
  SEED_CAP: 0.5, // D-057(b)
  D5_MARGIN: 0.15, // D-057(b) — starting proposal; value is C0's to fill (D-056)
  ACCEPT_MARGIN: 0.05, // D-057(b)
  DECAY_FACTOR: 0.9, // D-057(b)
  WINDOW_ROUNDS: 12, // D-057(b)
  WITNESS_RADIUS: 2, // D-057(b)
  BURN_WEIGHT: 4.0, // D-057(d)
  PROD_DELAY: 0, // D-057(d)
  FILLER_MIN_SHARE: 0.25, // D-057(d)
  DOM_THRESHOLD: 0.7, // D-057(b)
  DOM_GAP: 0.15, // D-057(b)
  DOM_SUSTAIN: 5, // D-057(b)
  DOM_MIN_TRADE_SHARE: 0.5, // D-057(b) — per-capita, coupled to WINDOW_ROUNDS
  DOM_RISE_MIN: 0.15, // D-057(b)
  REGION_COUNT: 1, // village
  ROUND_CAP: 120, // D-057(b)
};

/**
 * H6 declarations: every registry-TBD constant the C0 base relies on, with the
 * value used and the authorizing entry (D-057). The campaign runner's gate checks
 * these; we run the same check here so a missing trace is a hard stop, not a
 * silent default.
 */
export const C0_TBD_DECLARATIONS: readonly TbdDeclaration[] = [
  { constant: "SEED_CAP", value: 0.5, registerEntry: "D-057(b)" },
  { constant: "D5_MARGIN", value: 0.15, registerEntry: "D-057(b) (starting proposal; value filled at C0 close, D-056)" },
  { constant: "DECAY_FACTOR", value: 0.9, registerEntry: "D-057(b)" },
  { constant: "WINDOW_ROUNDS", value: 12, registerEntry: "D-057(b)" },
  { constant: "WITNESS_RADIUS", value: 2, registerEntry: "D-057(b)" },
  { constant: "FILLER_MIN_SHARE", value: 0.25, registerEntry: "D-057(d)" },
  { constant: "DOM_GAP", value: 0.15, registerEntry: "D-057(b)" },
  { constant: "DOM_SUSTAIN", value: 5, registerEntry: "D-057(b)" },
  { constant: "DOM_MIN_TRADE_SHARE", value: 0.5, registerEntry: "D-057(b)" },
  { constant: "DOM_RISE_MIN", value: 0.15, registerEntry: "D-057(b)" },
  { constant: "REGION_COUNT", value: 1, registerEntry: "village (REGION_COUNT 1 outside scaled mode)" },
  { constant: "ROUND_CAP", value: 120, registerEntry: "D-057(b)" },
];

/** Registered teaching neutrals (D-024(b)) as level indices [des,dur,rec,div,por,sca]. */
const NEUTRAL = { desirability: 1, durability: 2, recognizability: 2, divisibility: 2, portability: 2, scarcity: 1 } as const;

/** The six focal-attribute slots, by name, in the engine's attribute order. */
type Attr = "desirability" | "durability" | "recognizability" | "divisibility" | "portability";

// =========================================================================
// Config construction (D-057(f) families; balanced placement is construction).
// =========================================================================

function levels(focal: Attr, focalLevel: 0 | 1 | 2): [number, number, number, number, number, number] {
  const a: Record<string, number> = { ...NEUTRAL };
  a[focal] = focalLevel;
  return [a.desirability!, a.durability!, a.recognizability!, a.divisibility!, a.portability!, a.scarcity!];
}

function good(id: number, label: string, isFiller: boolean, lv: [number, number, number, number, number, number]): GoodType {
  return {
    id,
    label,
    isFiller,
    attributes: {
      desirability: lv[0] as 0 | 1 | 2,
      durability: lv[1] as 0 | 1 | 2,
      recognizability: lv[2] as 0 | 1 | 2,
      divisibility: lv[3] as 0 | 1 | 2,
      portability: lv[4] as 0 | 1 | 2,
      scarcity: lv[5] as 0 | 1 | 2,
    },
  };
}

/**
 * The per-dimension grading metric (criteria v2.4; D-063). Each property is
 * graded on its honest dimension, never on A(g) (D-059): C1 on the win-rate
 * statistic A(g) is faithful (desirability is the demand determinant), C3 and C4
 * relocate to held-and-re-traded persistence and to circulation respectively.
 */
export type BeatMetric = "acceptance" | "persistence" | "circulation";

export interface VillageBeat {
  readonly id: string;
  readonly focal: Attr;
  /** Cast names low->high on the focal attribute (worst, mid, best). */
  readonly cast: readonly [string, string, string];
  /** "round" (favored finishes top) or "ordering" (best>mid>worst). Diagnostics only. */
  readonly grade: "round" | "ordering";
  /** The v2.4 per-dimension grading metric this beat is scored on (D-063). */
  readonly metric: BeatMetric;
}

/**
 * The graded village beats (casts per D-026(h) / D-055; focal levels low->high).
 * C2 (recognizability) was removed when D-062 demoted it to a narrated
 * demonstration with no acceptance bar — it is not a graded beat. The `ordering`
 * grade is retained on VillageBeat for the diagnostic probes that still use it.
 */
export const VILLAGE_BEATS: readonly VillageBeat[] = [
  { id: "C1", focal: "desirability", cast: ["chalk", "glass beads", "salt"], grade: "round", metric: "acceptance" },
  { id: "C3", focal: "durability", cast: ["fresh fish", "grain", "honey"], grade: "round", metric: "persistence" },
  { id: "C4", focal: "divisibility", cast: ["iron pot", "iron bar", "iron nails"], grade: "round", metric: "circulation" },
];

/**
 * Producer-placement conventions for `homeGoods` (spec §8 — "the configuration's
 * holdings distribution", a config input; D-057 latitude, chosen for neutrality,
 * never for outcome). The held item the metric resolution unblocks: which
 * convention to register. Both spread every good's producers evenly; they differ
 * only in whether same-good producers are interleaved or contiguous on the ring.
 *   - "round-robin": producer of good (i mod g) at position i — maximally interleaved.
 *   - "blocked":     contiguous arcs, one good per arc — same-good producers adjacent.
 */
export type Placement = "round-robin" | "blocked";

function homeGoodsFor(n: number, g: number, placement: Placement): number[] {
  if (placement === "blocked") return Array.from({ length: n }, (_, i) => Math.min(g - 1, Math.floor((i * g) / n)));
  return Array.from({ length: n }, (_, i) => i % g); // round-robin
}

/**
 * Build a village beat config. 3 focal goods (focal attr at levels 0,1,2, all
 * other attributes at neutral) + `fillerCount` all-middle fillers; producer
 * placement per `placement` (default round-robin — construction latitude,
 * neutral, documented; the convention itself is a held C0 item, spec §8).
 */
export function buildVillage(
  beat: VillageBeat,
  n: number,
  fillerCount: number,
  mapping: LevelMapping,
  constants: EngineConstants,
  placement: Placement = "round-robin",
): Config {
  const goods: GoodType[] = [
    good(0, `${beat.cast[0]} (worst ${beat.focal})`, false, levels(beat.focal, 0)),
    good(1, `${beat.cast[1]} (mid ${beat.focal})`, false, levels(beat.focal, 1)),
    good(2, `${beat.cast[2]} (best ${beat.focal})`, false, levels(beat.focal, 2)),
  ];
  for (let f = 0; f < fillerCount; f++) goods.push(good(3 + f, `filler-${f}`, true, [1, 1, 1, 1, 1, 1]));
  const g = goods.length;
  const homeGoods = homeGoodsFor(n, g, placement);
  return {
    mode: "teaching",
    ablation: { kind: "none" },
    ringSize: n,
    goods,
    focalGoodIds: [0, 1, 2],
    mapping,
    productionPolicy: "profession",
    homeGoods,
    constants,
  };
}

// =========================================================================
// C1 grading — the focal-relative A(g) round bar (D-057(e)/D-058; C1-only after
// the D-059/060/061 relocation). C3/C4 no longer grade on A(g) (see below).
// =========================================================================

const ROUND_TOP_RATE = 0.9; // D-057(e): favored top in >= 90% of runs (C1)
const ROUND_MARGIN = 0.1; // D-057(e): final-share margin over runner-up >= 0.10 (C1)
const ORDER_SEP = 0.05; // D-057(e): both adjacent separations >= 0.05 (diagnostics)

function finalShares(r: RunResult): Map<number, AcceptanceShare> {
  const last = r.telemetry[r.telemetry.length - 1]!;
  const m = new Map<number, AcceptanceShare>();
  for (const [k, v] of Object.entries(last.acceptanceShare)) m.set(Number(k), v);
  return m;
}
const asNum = (v: AcceptanceShare | undefined): number => (v === null || v === undefined ? -1 : v);

/** Ordering bar (single run): A(best id2) > A(mid id1) > A(worst id0), both adjacent seps >= 0.05. */
export function orderingPassRun(r: RunResult): boolean {
  const shares = finalShares(r);
  const best = asNum(shares.get(2));
  const mid = asNum(shares.get(1));
  const worst = asNum(shares.get(0));
  return best - mid >= ORDER_SEP && mid - worst >= ORDER_SEP;
}

/**
 * Favored focal good (id 2) strictly tops the FOCAL TRIO {0,1,2} — fillers
 * excluded from the comparison (D-058: the round-bar comparison set is the three
 * focal goods, not all goods). The "does the favored top the three?" signal,
 * without the margin.
 */
export function favoredTopsTrioRun(r: RunResult): boolean {
  const s = finalShares(r);
  const fav = asNum(s.get(2));
  return fav > asNum(s.get(1)) && fav > asNum(s.get(0));
}

/**
 * Focal-relative round bar (D-058): the favored focal good tops the focal trio,
 * with margin over the FOCAL runner-up (the higher of ids 0,1) >= ROUND_MARGIN.
 * Fillers are backdrop, excluded. C1's bar (and C1's only — D-059/060).
 */
export function roundFocalPassRun(r: RunResult): boolean {
  const s = finalShares(r);
  const fav = asNum(s.get(2));
  if (fav < 0) return false; // favored undefined -> does not top
  const focalRunnerUp = Math.max(0, asNum(s.get(1)), asNum(s.get(0)));
  return fav > asNum(s.get(1)) && fav > asNum(s.get(0)) && fav - focalRunnerUp >= ROUND_MARGIN;
}

// =========================================================================
// Per-dimension grading (criteria v2.4; D-059/060/061/063). The favored focal
// good is the best-level good (id 2); the worst is id 0. C3 grades on
// persistence(g), C4 on circulation(g) with the divisibility-refusal hook —
// both read from the witnessed event stream (c-series.ts), A2-clean. The A(g)
// round grading above is NOT applied to C3/C4 (D-059: per-dimension, never a
// lower A(g) threshold). Bar NUMBERS are TBD here and filled by this campaign at
// C0 per H6 (D-063); the statistics and bar forms are structural (registered).
// =========================================================================

const FAVORED = 2; // best level on the focal attribute
const MID = 1;
const WORST = 0;
const FOCAL_IDS = [WORST, MID, FAVORED];

/** The per-good statistic a beat is graded on (C3 persistence, C4 circulation). */
function dimensionStat(metric: BeatMetric): (c: import("./c-series.ts").FocalEventCounts) => number | null {
  return metric === "circulation" ? circulation : persistence;
}

/** Per-run dimension outcome, computed from the event stream. */
interface RunMetric {
  /** Dimension statistic of the favored / mid / worst focal good; null = NO_EVIDENCE. */
  readonly favored: number | null;
  readonly mid: number | null;
  readonly worst: number | null;
  /** favored - worst; null if either is NO_EVIDENCE (the run cannot speak to the gap). */
  readonly margin: number | null;
  /** Full ordering favored > mid > worst, all defined (predict-what-persists; supplementary). */
  readonly ordered: boolean;
  /** C4 only: worst(indivisible) - favored(fine) divisibility-refusal rate; the change-making hook. */
  readonly refusalGap: number | null;
  readonly favoredNoEvidence: boolean;
  readonly reachedCap: boolean;
}

function runMetric(beat: VillageBeat, r: RunResult): RunMetric {
  const counts = focalEventCounts(r.events, FOCAL_IDS);
  const stat: GoodStat = statByGood(counts, dimensionStat(beat.metric));
  const favored = stat[FAVORED] ?? null;
  const mid = stat[MID] ?? null;
  const worst = stat[WORST] ?? null;
  const margin = favored != null && worst != null ? favored - worst : null;
  const ordered = favored != null && mid != null && worst != null && favored > mid && mid > worst;
  let refusalGap: number | null = null;
  if (beat.metric === "circulation") {
    const dr = statByGood(counts, divisibilityRefusalRate);
    refusalGap = dr[WORST] != null && dr[FAVORED] != null ? dr[WORST]! - dr[FAVORED]! : null;
  }
  return { favored, mid, worst, margin, ordered, refusalGap, favoredNoEvidence: favored == null, reachedCap: r.reachedCap };
}

/** The bar a per-dimension beat is graded against (numbers C0-filled per H6). */
interface DimensionBar {
  /** Favored exceeds worst by >= this on the dimension statistic. */
  readonly marginFloor: number;
  /** C4 only: indivisible's change-making refusal rate exceeds the fine good's by >= this. */
  readonly refusalThreshold: number | null;
}

/**
 * Single-run pass on the per-dimension bar. NO_EVIDENCE is handled per A(g)'s own
 * convention (§9.1): a run whose favored focal good is NO_EVIDENCE does not
 * demonstrate the lesson — it counts as a FAIL in the pass rate (denominator is
 * every run), exactly as a NO_EVIDENCE favored good never "finishes top" under the
 * A(g) round bar. The tolerated NO_EVIDENCE rate is a separate ceiling.
 */
function dimensionPassRun(m: RunMetric, bar: DimensionBar): boolean {
  if (m.margin === null || m.margin < bar.marginFloor) return false;
  if (bar.refusalThreshold !== null && (m.refusalGap === null || m.refusalGap < bar.refusalThreshold)) return false;
  return true;
}

// --- H6 bar derivation (D-057(a)) -------------------------------------------

const H6_HEADROOM = 0.2; // D-057(a): a post-observation bound sits >= 20% (relative) beyond the nearest observed value, in the failable direction.
const floorTo = (x: number, step: number): number => Math.floor(x / step + 1e-9) * step;
const ceilTo = (x: number, step: number): number => Math.ceil(x / step - 1e-9) * step;
/** Floor bar (higher value passes): sit 20% relative BELOW the observed base (failable direction = down), rounded down to `step`. */
const h6FloorBar = (observed: number, step: number): number => Math.max(0, floorTo(observed * (1 - H6_HEADROOM), step));
/** Ceiling bar (lower value passes; e.g. tolerated NO_EVIDENCE rate): sit 20% relative ABOVE the observed base, rounded up to `step`. */
const h6CeilBar = (observed: number, step: number): number => ceilTo(observed * (1 + H6_HEADROOM), step);

/** A bar number set at C0 per the registered H6 headroom rule, with its full derivation. */
export interface DerivedBar {
  readonly name: string;
  readonly value: number;
  /** The observed value the headroom was applied to (from the teaching cell). */
  readonly observedBase: number;
  /** How `observedBase` was obtained (the cited cell + statistic), so the closing entry can verify. */
  readonly basis: string;
  /** "down" (a floor: lower fails) or "up" (a ceiling: higher fails). */
  readonly failableDirection: "down" | "up";
  /** Whether at least one swept cell falls on the failing side — the bar is non-trivially failable. */
  readonly nonTriviallyFailable: boolean;
}

// =========================================================================
// Cells, sweep, and the campaign.
// =========================================================================

const C0_BASE_SEED = 20260608; // functional sweep base (D-010); not outcome-shopped

/** A swept cell: its identity, whether it is a teaching candidate, and its config. */
interface CellSpec {
  readonly axis: string;
  readonly value: string;
  readonly n: number;
  readonly fillerCount: number;
  readonly placement: Placement;
  /** Teaching candidate: eligible to be the chosen teaching cell the bars derive from. */
  readonly teaching: boolean;
  readonly cfg: Config;
}

export interface C0Cell {
  readonly axis: string;
  readonly value: string;
  readonly n: number;
  readonly fillerCount: number;
  readonly placement: Placement;
  readonly metric: BeatMetric;
  readonly teaching: boolean;
  readonly capOutRate: number;
  /** Favored good NO_EVIDENCE rate (per A(g)'s convention this fraction counts as fails). */
  readonly noEvidenceRate: number;
  /** Mean dimension statistic of the favored / worst focal good (defined runs only). */
  readonly favoredStatMean: number;
  readonly worstStatMean: number;
  /** favored - worst separation (defined runs): mean, 5th pct (the robust floor), median. */
  readonly marginMean: number;
  readonly marginP05: number;
  readonly marginP50: number;
  /** Full ordering favored>mid>worst rate (predict-what-persists; supplementary to the gap bar). */
  readonly orderedRate: number;
  /** C4 only: mean indivisible-minus-fine change-making refusal rate. */
  readonly refusalGapMean: number;
  /** Graded against the derived bar: fraction of ALL runs passing (NO_EVIDENCE = fail). */
  readonly passRate: number;
  readonly meetsBar: boolean;
}

export interface C0BeatReport {
  readonly id: string;
  readonly focal: string;
  readonly metric: BeatMetric;
  /** The chosen teaching cell the bars were derived from (or the registered bar for C1). */
  readonly teachingCell: string;
  /** The C0-derived bars (per H6); empty for C1, which keeps the registered round bar. */
  readonly bars: readonly DerivedBar[];
  /** The pass-rate bar: C0-derived per H6 (C3/C4) or registered ROUND_TOP_RATE (C1, basis names it). */
  readonly passRateBar: DerivedBar;
  readonly cells: readonly C0Cell[];
  /** Whether the chosen teaching cell meets its pass-rate bar (the C0 "demonstrated reachable" condition). */
  readonly feasible: boolean;
}

/** Mean of defined (non-null) numbers, or NaN if none. */
function meanDefined(xs: readonly (number | null)[]): number {
  const d = xs.filter((x): x is number => x != null);
  if (d.length === 0) return NaN;
  return d.reduce((a, b) => a + b, 0) / d.length;
}

/** Build the swept cells for a beat: the held-item sweeps the metric resolution unblocked. */
function cellsFor(beat: VillageBeat): CellSpec[] {
  const M = C0_MAPPING_VILLAGE;
  const K = C0_CONSTANTS_VILLAGE;
  const specs: CellSpec[] = [];
  const add = (axis: string, value: string, n: number, fillerCount: number, placement: Placement, teaching: boolean, cfg: Config) =>
    specs.push({ axis, value, n, fillerCount, placement, teaching, cfg });

  // (1) Thinness / ceiling held item (D-058/D-052 successor): liquidity (filler) x
  // population (N), all at the interim ceiling N <= 16. Teaching candidates.
  for (const n of [10, 12, 16]) {
    for (const fc of [1, 3, 5]) {
      add("N×filler", `N=${n},f=${fc}`, n, fc, "round-robin", true, buildVillage(beat, n, fc, M, K, "round-robin"));
    }
  }
  // (2) homeGoods producer-placement held item (spec §8): the blocked convention at
  // the frozen 8-good and the liquid 4-good, to check placement-robustness. Teaching candidates.
  add("placement", "blocked,f=5", 12, 5, "blocked", true, buildVillage(beat, 12, 5, M, K, "blocked"));
  add("placement", "blocked,f=1", 12, 1, "blocked", true, buildVillage(beat, 12, 1, M, K, "blocked"));
  // (3) DOM_MIN_TRADE_SHARE × WINDOW_ROUNDS joint sweep held item (V-23/D-043): the
  // detector denomination at its control extremes. These touch dominance/cap-out, NOT
  // the event-flow statistics — robustness cells, NOT teaching candidates (they must
  // not move a flow statistic, which is the point of validating the denomination here).
  const liquid = buildVillage(beat, 12, 1, M, K, "round-robin");
  for (const [dom, win] of [[0.5, 8], [0.5, 16], [0.75, 12], [1.0, 12]] as const) {
    add("DOM×WINDOW", `dom=${dom},win=${win}`, 12, 1, "round-robin", false, {
      ...liquid,
      constants: { ...liquid.constants, DOM_MIN_TRADE_SHARE: dom, WINDOW_ROUNDS: win },
    });
  }

  // (4) Per-beat focal lever (D-057(b)) — the beat's own teaching dial, at the liquid
  // and the 8-good frame, so each beat is assessed on its lever (C1's want-share spread
  // is what reaches its A(g) bar; C3's faster spoil sharpens the persistence gap). C4's
  // divisibility is structural — no continuous focal dial. Teaching candidates.
  const focalDial = (label: string, m: LevelMapping): void => {
    add("focal-lever", `${label},f=5`, 16, 5, "round-robin", true, buildVillage(beat, 16, 5, m, K, "round-robin"));
    add("focal-lever", `${label},f=1`, 12, 1, "round-robin", true, buildVillage(beat, 12, 1, m, K, "round-robin"));
  };
  if (beat.id === "C1") {
    // want-share high 0.30 -> 0.35 (the D-057(b) grid edge that sharpens desirability's lever).
    focalDial("want-hi=0.35", { ...M, wantShareWeight: [M.wantShareWeight[0]!, M.wantShareWeight[1]!, 0.35] });
  } else if (beat.id === "C3") {
    // fast spoil (2,2) -> (3,2) (D-057(b) (S1,S2)-fast grid).
    focalDial("spoil=(3,2)", { ...M, durabilitySchedule: [{ s1: 3, s2: 2, neverSpoils: false }, M.durabilitySchedule[1]!, M.durabilitySchedule[2]!] });
  }
  return specs;
}

/** Run one cell's 50-seed batch and summarize the dimension statistic (no bar yet). */
interface CellRun {
  readonly spec: CellSpec;
  readonly metrics: readonly RunMetric[];
}
function runCell(beat: VillageBeat, spec: CellSpec): CellRun {
  const seeds = deriveSeeds(C0_BASE_SEED, DEFAULT_BATCH_SIZE);
  return { spec, metrics: seeds.map((s) => runMetric(beat, run(spec.cfg, s))) };
}

/** Distributional summary of a cell, independent of any bar. */
function summarizeCell(metric: BeatMetric, run: CellRun): Omit<C0Cell, "passRate" | "meetsBar"> {
  const { spec, metrics } = run;
  const margins = metrics.map((m) => m.margin).filter((x): x is number => x != null);
  const mSummary = margins.length > 0 ? summarize(margins) : null;
  return {
    axis: spec.axis, value: spec.value, n: spec.n, fillerCount: spec.fillerCount, placement: spec.placement,
    metric,
    teaching: spec.teaching,
    capOutRate: metrics.filter((m) => m.reachedCap).length / metrics.length,
    noEvidenceRate: metrics.filter((m) => m.favoredNoEvidence).length / metrics.length,
    favoredStatMean: meanDefined(metrics.map((m) => m.favored)),
    worstStatMean: meanDefined(metrics.map((m) => m.worst)),
    marginMean: mSummary ? mSummary.mean : NaN,
    marginP05: mSummary ? mSummary.p05 : NaN,
    marginP50: mSummary ? mSummary.p50 : NaN,
    orderedRate: metrics.filter((m) => m.ordered).length / metrics.length,
    refusalGapMean: meanDefined(metrics.map((m) => m.refusalGap)),
  };
}

export function runC0Village(): C0BeatReport[] {
  // H6 intake gate: refuse to run if any registry-TBD constant the base relies on is undeclared.
  const gateBase = buildVillage(VILLAGE_BEATS[0]!, 12, 5, C0_MAPPING_VILLAGE, C0_CONSTANTS_VILLAGE);
  const violations = enforceH6({ name: "C0-village", base: gateBase, baseSeed: C0_BASE_SEED, metrics: [], tbdDeclarations: C0_TBD_DECLARATIONS });
  if (violations.length > 0) throw new Error(`C0 H6 intake failed:\n  - ${violations.join("\n  - ")}`);

  const reports: C0BeatReport[] = [];
  for (const beat of VILLAGE_BEATS) {
    reports.push(beat.metric === "acceptance" ? runAcceptanceBeat(beat) : runDimensionBeat(beat));
  }
  return reports;
}

/** C1 — unchanged: the registered focal-relative A(g) round bar (D-057(e)/D-058). */
function runAcceptanceBeat(beat: VillageBeat): C0BeatReport {
  const specs = cellsFor(beat);
  const cells: C0Cell[] = [];
  let teachingPass = 0;
  let teachingLabel = "";
  for (const spec of specs) {
    const seeds = deriveSeeds(C0_BASE_SEED, DEFAULT_BATCH_SIZE);
    const results = seeds.map((s) => run(spec.cfg, s));
    const rate = passRate(results.map(roundFocalPassRun)).rate;
    const capOut = results.filter((r) => r.reachedCap).length / results.length;
    const favMean = results.reduce((a, r) => a + Math.max(0, asNum(finalShares(r).get(FAVORED))), 0) / results.length;
    const noEv = results.filter((r) => asNum(finalShares(r).get(FAVORED)) < 0).length / results.length;
    cells.push({
      axis: spec.axis, value: spec.value, n: spec.n, fillerCount: spec.fillerCount, placement: spec.placement,
      metric: "acceptance", teaching: spec.teaching, capOutRate: capOut, noEvidenceRate: noEv,
      favoredStatMean: favMean, worstStatMean: NaN, marginMean: NaN, marginP05: NaN, marginP50: NaN,
      orderedRate: passRate(results.map(favoredTopsTrioRun)).rate, refusalGapMean: NaN,
      passRate: rate, meetsBar: rate >= ROUND_TOP_RATE,
    });
    if (spec.teaching && rate > teachingPass) { teachingPass = rate; teachingLabel = `${spec.axis}=${spec.value}`; }
  }
  return {
    id: beat.id, focal: beat.focal, metric: "acceptance", teachingCell: teachingLabel || "(none)",
    bars: [],
    passRateBar: {
      name: "round-top rate (favored tops the focal trio, margin >= 0.10)",
      value: ROUND_TOP_RATE, observedBase: teachingPass,
      basis: "registered D-057(e)/D-058 (C1 keeps the focal-relative A(g) round bar; not C0-derived)",
      failableDirection: "down",
      nonTriviallyFailable: cells.some((c) => c.passRate < ROUND_TOP_RATE),
    },
    cells, feasible: teachingPass >= ROUND_TOP_RATE,
  };
}

/** C3/C4 — the relocated per-dimension grading; bars C0-derived per H6 (D-063). */
function runDimensionBeat(beat: VillageBeat): C0BeatReport {
  const runs = cellsFor(beat).map((spec) => runCell(beat, spec));

  // Teaching cell: PROPOSED for the closing entry to ratify (D-057(h)). Chosen for
  // legibility on a non-degenerate market: FIRST the lowest favored NO_EVIDENCE rate
  // (a NO_EVIDENCE favored good cannot teach — the D-058 thinness hazard), THEN the
  // highest 5th-percentile favored-minus-worst margin (a gap met in ~95% of its runs).
  // This deliberately does NOT pick the largest raw margin: the persistence margin is
  // inflated in a frozen market (the perishable cannot trade at all before it rots), so
  // max-margin would land on the thin regime the C0 thinness finding warns against.
  const teachingRuns = runs.filter((r) => r.spec.teaching);
  const summaries = new Map<CellRun, ReturnType<typeof summarizeCell>>(runs.map((r) => [r, summarizeCell(beat.metric, r)]));
  const teaching = [...teachingRuns].sort((a, b) => {
    const sa = summaries.get(a)!;
    const sb = summaries.get(b)!;
    const pa = Number.isNaN(sa.marginP05) ? -Infinity : sa.marginP05;
    const pb = Number.isNaN(sb.marginP05) ? -Infinity : sb.marginP05;
    return sa.noEvidenceRate - sb.noEvidenceRate || pb - pa;
  })[0]!;
  const tSummary = summaries.get(teaching)!;
  const tLabel = `${teaching.spec.axis}=${teaching.spec.value}`;

  // Visible-margin floor: 20% relative below the teaching cell's robust (p05) achieved
  // margin (D-057(a)), rounded to 0.05 — met in ~95% of its runs with headroom, failable
  // for a thinner config. (For the [0,1] persistence statistic this sits well above the
  // A(g) 0.10 legibility precedent, D-057(e).)
  const marginFloor = h6FloorBar(tSummary.marginP05, 0.05);
  const bars: DerivedBar[] = [{
    name: `${beat.metric} visible-margin floor (favored − worst)`,
    value: marginFloor, observedBase: tSummary.marginP05,
    basis: `teaching cell ${tLabel}: 5th-pct favored−worst margin over defined runs`,
    failableDirection: "down",
    nonTriviallyFailable: runs.some((r) => { const s = summaries.get(r)!; return !Number.isNaN(s.marginP50) && s.marginP50 < marginFloor; }),
  }];

  // C4 refusal-rate legibility threshold: 20% below the teaching cell's robust (p05)
  // indivisible-minus-fine change-making refusal gap (D-057(a)), rounded to 1.0/unit.
  let refusalThreshold: number | null = null;
  if (beat.metric === "circulation") {
    const gaps = teaching.metrics.map((m) => m.refusalGap).filter((x): x is number => x != null);
    const gapP05 = gaps.length > 0 ? summarize(gaps).p05 : 0;
    refusalThreshold = h6FloorBar(gapP05, 1.0);
    bars.push({
      name: "change-making refusal floor (indivisible − fine, per unit)",
      value: refusalThreshold, observedBase: gapP05,
      basis: `teaching cell ${tLabel}: 5th-pct indivisible−fine divisibility-refusal rate`,
      failableDirection: "down",
      nonTriviallyFailable: runs.some((r) => meanDefined(r.metrics.map((m) => m.refusalGap)) < refusalThreshold!),
    });
  }

  // NO_EVIDENCE rate ceiling: 20% above the teaching cell's observed favored-NO_EVIDENCE
  // rate (D-057(a)), rounded to 0.02. Reported with the rule (A(g)'s convention).
  const noEvidenceBar = h6CeilBar(tSummary.noEvidenceRate, 0.02);
  bars.push({
    name: "tolerated favored NO_EVIDENCE rate (A(g) convention; §9.1)",
    value: noEvidenceBar, observedBase: tSummary.noEvidenceRate,
    basis: `teaching cell ${tLabel}: favored-good NO_EVIDENCE rate`,
    failableDirection: "up",
    nonTriviallyFailable: runs.some((r) => summaries.get(r)!.noEvidenceRate > noEvidenceBar),
  });

  const dimBar: DimensionBar = { marginFloor, refusalThreshold };

  // Pass-rate bar: 20% below the teaching cell's achieved pass rate at the derived
  // margin/refusal bar (D-057(a)), rounded to 0.05 — a floor the teaching config clears
  // with headroom and a thinner config fails. NO_EVIDENCE runs are fails (A(g) convention).
  const teachingPassRate = passRate(teaching.metrics.map((m) => dimensionPassRun(m, dimBar))).rate;
  const passRateBarValue = h6FloorBar(teachingPassRate, 0.05);
  const passRateBar: DerivedBar = {
    name: `${beat.metric} pass rate (runs demonstrating the lesson)`,
    value: passRateBarValue, observedBase: teachingPassRate,
    basis: `teaching cell ${tLabel}: fraction of runs passing the derived margin${refusalThreshold !== null ? "+refusal" : ""} bar`,
    failableDirection: "down",
    nonTriviallyFailable: runs.some((r) => passRate(r.metrics.map((m) => dimensionPassRun(m, dimBar))).rate < passRateBarValue),
  };

  const cells: C0Cell[] = runs.map((r) => {
    const s = summaries.get(r)!;
    const rate = passRate(r.metrics.map((m) => dimensionPassRun(m, dimBar))).rate;
    return { ...s, passRate: rate, meetsBar: rate >= passRateBarValue };
  });

  return {
    id: beat.id, focal: beat.focal, metric: beat.metric, teachingCell: tLabel,
    bars, passRateBar, cells, feasible: teachingPassRate >= passRateBarValue,
  };
}
